// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PQWeaveAccount} from "../src/PQWeaveAccount.sol";
import {PQWeaveForwarder} from "../src/PQWeaveForwarder.sol";
import {LamportMerkleVerifier} from "../src/verifiers/LamportMerkleVerifier.sol";
import {IPQCVerifier} from "../src/interfaces/IPQCVerifier.sol";
import {LamportHarness} from "./utils/LamportHarness.sol";
import {MockERC20, MockERC721} from "./utils/Mocks.sol";

/// @dev USDT-style token: transfer returns no data.
contract NoReturnERC20 {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
    }
}

/// @dev Broken token: transfer returns false.
contract FalseReturnERC20 {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address, uint256) external pure returns (bool) {
        return false;
    }
}

/// @dev Minimal ERC-1155 supporting one id, with the receiver-hook check.
contract MockERC1155 {
    mapping(address => mapping(uint256 => uint256)) public balanceOf;

    function mint(address to, uint256 id, uint256 amount) external {
        balanceOf[to][id] += amount;
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes calldata data
    ) external {
        require(from == msg.sender, "not owner");
        balanceOf[from][id] -= amount;
        balanceOf[to][id] += amount;
        if (to.code.length > 0) {
            bytes4 ack =
                MockERC1155Receiver(to).onERC1155Received(msg.sender, from, id, amount, data);
            require(ack == MockERC1155Receiver.onERC1155Received.selector, "receiver rejected");
        }
    }
}

interface MockERC1155Receiver {
    function onERC1155Received(address, address, uint256, uint256, bytes calldata)
        external
        returns (bytes4);
}

/// @dev ERC-721 whose safeTransferFrom enforces the receiver hook — used to
///      prove that deposits INTO the delegated EOA do not revert.
contract HookERC721 {
    mapping(uint256 => address) public ownerOf;

    function mint(address to, uint256 id) external {
        ownerOf[id] = to;
    }

    function safeTransferFrom(address from, address to, uint256 id) external {
        require(ownerOf[id] == from, "not owner");
        ownerOf[id] = to;
        if (to.code.length > 0) {
            bytes4 ack = HookERC721Receiver(to).onERC721Received(msg.sender, from, id, "");
            require(ack == HookERC721Receiver.onERC721Received.selector, "receiver rejected");
        }
    }
}

interface HookERC721Receiver {
    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4);
}

/// @dev Exchange-style payer that uses transfer() with its 2300-gas stipend.
contract StipendPayer {
    receive() external payable {}

    function payOut(address payable to, uint256 amount) external {
        to.transfer(amount);
    }
}

contract PQWeaveForwarderTest is Test {
    bytes32 internal constant PQC_SEED = keccak256("forwarder-pqc-seed");

    PQWeaveForwarder internal forwarder;
    LamportMerkleVerifier internal verifier;
    MockERC20 internal token;

    uint256 internal eoaPk = 0xC0FFEE;
    address internal eoa;
    address internal destination = makeAddr("pqc-destination");
    address internal keeper = makeAddr("keeper");

    bytes32 internal root;

    function setUp() public {
        forwarder = new PQWeaveForwarder();
        verifier = new LamportMerkleVerifier();
        token = new MockERC20();
        eoa = vm.addr(eoaPk);

        bytes32[512] memory sk = LamportHarness.deriveSecrets(PQC_SEED);
        root = LamportHarness.leafCommit(LamportHarness.publicFromSecret(sk));
    }

    /// @dev Delegate the EOA to the forwarder and initialize via self-call.
    function _install() internal returns (PQWeaveForwarder mailbox) {
        vm.signAndAttachDelegation(address(forwarder), eoaPk);
        mailbox = PQWeaveForwarder(payable(eoa));
        vm.prank(eoa);
        mailbox.initialize(destination, root, verifier);
    }

    function _pqcSign(bytes32 digest) internal pure returns (bytes memory) {
        bytes32[512] memory sk = LamportHarness.deriveSecrets(PQC_SEED);
        bytes32[512] memory pk = LamportHarness.publicFromSecret(sk);
        bytes32[256] memory sig = LamportHarness.signOneTime(digest, sk);
        return abi.encode(uint256(0), pk, sig, new bytes32[](0));
    }

    // --- initialize ---

    function test_initializeRejectsVerifierWithoutCode() public {
        vm.signAndAttachDelegation(address(forwarder), eoaPk);
        vm.prank(eoa);
        vm.expectRevert(PQWeaveForwarder.InvalidVerifier.selector);
        PQWeaveForwarder(payable(eoa))
            .initialize(destination, root, IPQCVerifier(makeAddr("noCode")));
    }

    function test_initializeViaSelfCall() public {
        PQWeaveForwarder mailbox = _install();
        assertTrue(mailbox.initialized());
        assertEq(mailbox.destination(), destination);
        assertEq(mailbox.pqcRoot(), root);
        assertEq(address(mailbox.pqcVerifier()), address(verifier));
    }

    function test_initializeRejectsSecondCall() public {
        PQWeaveForwarder mailbox = _install();
        vm.prank(eoa);
        vm.expectRevert(PQWeaveForwarder.AlreadyInitialized.selector);
        mailbox.initialize(destination, root, verifier);
    }

    function test_initializeRejectsNonSelf() public {
        vm.signAndAttachDelegation(address(forwarder), eoaPk);
        vm.expectRevert(PQWeaveForwarder.NotSelf.selector);
        PQWeaveForwarder(payable(eoa)).initialize(destination, root, verifier);
    }

    function test_initializeRejectsBadParams() public {
        vm.signAndAttachDelegation(address(forwarder), eoaPk);
        PQWeaveForwarder mailbox = PQWeaveForwarder(payable(eoa));

        vm.prank(eoa);
        vm.expectRevert(PQWeaveForwarder.InvalidDestination.selector);
        mailbox.initialize(address(0), root, verifier);

        vm.prank(eoa);
        vm.expectRevert(PQWeaveForwarder.InvalidDestination.selector);
        mailbox.initialize(eoa, root, verifier);

        vm.prank(eoa);
        vm.expectRevert(PQWeaveForwarder.InvalidPqcKey.selector);
        mailbox.initialize(destination, bytes32(0), verifier);

        vm.prank(eoa);
        vm.expectRevert(PQWeaveForwarder.InvalidVerifier.selector);
        mailbox.initialize(destination, root, IPQCVerifier(address(0)));
    }

    // --- receive under exchange gas stipend ---

    function test_receiveSurvivesTransferStipend() public {
        _install();
        StipendPayer payer = new StipendPayer();
        vm.deal(address(payer), 3 ether);

        // transfer() forwards only 2300 gas; the empty receive() must accept.
        payer.payOut(payable(eoa), 1 ether);
        assertEq(eoa.balance, 1 ether);
    }

    // --- flush ---

    function test_flushPushesFullBalancePermissionlessly() public {
        PQWeaveForwarder mailbox = _install();
        vm.deal(eoa, 4 ether);

        vm.prank(keeper);
        mailbox.flush();

        assertEq(eoa.balance, 0);
        assertEq(destination.balance, 4 ether);
    }

    function test_flushIsNoopOnZeroBalance() public {
        PQWeaveForwarder mailbox = _install();
        vm.prank(keeper);
        mailbox.flush();
        assertEq(destination.balance, 0);
    }

    function test_flushRequiresInitialization() public {
        vm.signAndAttachDelegation(address(forwarder), eoaPk);
        vm.expectRevert(PQWeaveForwarder.NotInitialized.selector);
        PQWeaveForwarder(payable(eoa)).flush();
    }

    function test_flushErc20PushesFullBalance() public {
        PQWeaveForwarder mailbox = _install();
        token.mint(eoa, 500 ether);

        vm.prank(keeper);
        mailbox.flushERC20(address(token));

        assertEq(token.balanceOf(eoa), 0);
        assertEq(token.balanceOf(destination), 500 ether);
    }

    function test_flushErc20HandlesNoReturnTokens() public {
        PQWeaveForwarder mailbox = _install();
        NoReturnERC20 usdt = new NoReturnERC20();
        usdt.mint(eoa, 100e6);

        mailbox.flushERC20(address(usdt));
        assertEq(usdt.balanceOf(destination), 100e6);
    }

    function test_flushErc20RevertsOnFalseReturn() public {
        PQWeaveForwarder mailbox = _install();
        FalseReturnERC20 bad = new FalseReturnERC20();
        bad.mint(eoa, 1 ether);

        vm.expectRevert(
            abi.encodeWithSelector(PQWeaveForwarder.Erc20TransferFailed.selector, address(bad))
        );
        mailbox.flushERC20(address(bad));
    }

    // --- one-tx install + sweep ---

    function test_oneTransactionInstallAndFlush() public {
        vm.deal(eoa, 10 ether);
        token.mint(eoa, 1_000 ether);

        address[] memory tokens = new address[](1);
        tokens[0] = address(token);

        // One 7702 tx: delegate to the forwarder and run initializeAndFlush.
        vm.signAndAttachDelegation(address(forwarder), eoaPk);
        PQWeaveForwarder mailbox = PQWeaveForwarder(payable(eoa));
        vm.prank(eoa);
        mailbox.initializeAndFlush(destination, root, verifier, tokens);

        assertEq(eoa.balance, 0);
        assertEq(destination.balance, 10 ether);
        assertEq(token.balanceOf(destination), 1_000 ether);
        assertTrue(mailbox.initialized());
        // The mailbox keeps working: a later deposit is flushable by anyone.
        vm.deal(eoa, 1 ether);
        vm.prank(keeper);
        mailbox.flush();
        assertEq(destination.balance, 11 ether);
    }

    // --- setDestination (PQC-gated) ---

    function test_setDestinationWithValidPqcSignature() public {
        PQWeaveForwarder mailbox = _install();
        address next = makeAddr("next-destination");

        bytes memory sig = _pqcSign(mailbox.setDestinationDigest(next));
        vm.prank(keeper); // caller does not matter; the signature is the authority
        mailbox.setDestination(next, sig);

        assertEq(mailbox.destination(), next);
        assertEq(mailbox.destinationNonce(), 1);
        assertTrue(mailbox.pqcLeafUsed(0));
    }

    function test_setDestinationRejectsReplayedLeaf() public {
        PQWeaveForwarder mailbox = _install();
        address next = makeAddr("next-destination");

        bytes memory sig = _pqcSign(mailbox.setDestinationDigest(next));
        mailbox.setDestination(next, sig);

        // Same one-time leaf again — must be rejected before verification.
        vm.expectRevert(abi.encodeWithSelector(PQWeaveForwarder.PqcLeafReused.selector, 0));
        mailbox.setDestination(makeAddr("another"), sig);
    }

    function test_setDestinationRejectsWrongMessageSignature() public {
        PQWeaveForwarder mailbox = _install();

        // Signature over a digest for a DIFFERENT destination.
        bytes memory sig = _pqcSign(mailbox.setDestinationDigest(makeAddr("intended")));
        vm.expectRevert(PQWeaveForwarder.InvalidPqcSignature.selector);
        mailbox.setDestination(makeAddr("attacker"), sig);
    }

    function test_setDestinationRejectsShortSignature() public {
        PQWeaveForwarder mailbox = _install();
        vm.expectRevert(PQWeaveForwarder.InvalidPqcSignature.selector);
        mailbox.setDestination(makeAddr("next"), hex"1234");
    }

    function test_setDestinationDigestMatchesSdkFixture() public {
        // Pinned in the SDK's forwarder.test.ts: chainId 84532, mailbox =
        // vm.addr(0xC0FFEE), nonce 0, destination 0x2222…2222. If either side
        // drifts, cross-runtime signatures stop verifying.
        vm.chainId(84532);
        PQWeaveForwarder mailbox = _install();
        bytes32 digest = mailbox.setDestinationDigest(0x2222222222222222222222222222222222222222);
        assertEq(
            digest, bytes32(0xfd2874aae6828d66391db7698ed33782592b8b860a7ffa30a0799b07e63d3fee)
        );
    }

    // --- NFT forwarding + receiver hooks ---

    function test_forwardErc721ViaTransferFrom() public {
        PQWeaveForwarder mailbox = _install();
        MockERC721 nft = new MockERC721();
        nft.mint(eoa, 7);

        vm.prank(keeper);
        mailbox.forwardERC721(address(nft), 7);
        assertEq(nft.ownerOf(7), destination);
    }

    function test_safeTransfersIntoMailboxAreAccepted() public {
        _install();
        HookERC721 nft = new HookERC721();
        address collector = makeAddr("collector");
        nft.mint(collector, 9);

        // Deposit INTO the delegated EOA runs its onERC721Received hook.
        vm.prank(collector);
        nft.safeTransferFrom(collector, eoa, 9);
        assertEq(nft.ownerOf(9), eoa);

        MockERC1155 multi = new MockERC1155();
        multi.mint(collector, 1, 50);
        vm.prank(collector);
        multi.safeTransferFrom(collector, eoa, 1, 50, "");
        assertEq(multi.balanceOf(eoa, 1), 50);
    }

    function test_forwardErc1155PushesFullBalance() public {
        PQWeaveForwarder mailbox = _install();
        MockERC1155 multi = new MockERC1155();
        multi.mint(eoa, 1, 50);

        vm.prank(eoa);
        mailbox.forwardERC1155(address(multi), 1);
        assertEq(multi.balanceOf(destination, 1), 50);
    }

    // --- storage isolation across successive delegations ---

    function test_storageDoesNotAliasAcrossDelegates() public {
        // First life: the EOA is delegated to PQWeaveAccount and initialized.
        PQWeaveAccount accountImpl = new PQWeaveAccount(makeAddr("entrypoint"));
        vm.signAndAttachDelegation(address(accountImpl), eoaPk);
        vm.prank(eoa);
        PQWeaveAccount(payable(eoa)).initialize(eoa, abi.encodePacked(root), verifier, 1 ether);

        // Second life: re-delegate to the forwarder. Its namespaced storage must
        // be untouched by the account's slots.
        vm.signAndAttachDelegation(address(forwarder), eoaPk);
        PQWeaveForwarder mailbox = PQWeaveForwarder(payable(eoa));
        assertFalse(mailbox.initialized());
        assertEq(mailbox.destination(), address(0));

        vm.prank(eoa);
        mailbox.initialize(destination, root, verifier);
        vm.deal(eoa, 2 ether);
        mailbox.flush();
        assertEq(destination.balance, 2 ether);
    }
}
