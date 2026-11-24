// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PQWeaveAccount} from "../src/PQWeaveAccount.sol";
import {LamportMerkleVerifier} from "../src/verifiers/LamportMerkleVerifier.sol";
import {IPQCVerifier} from "../src/interfaces/IPQCVerifier.sol";
import {PackedUserOperation} from "../src/interfaces/IAccount.sol";
import {LamportHarness} from "./utils/LamportHarness.sol";

contract PQWeaveAccountTest is Test {
    bytes32 internal constant PQC_SEED = keccak256("account-pqc-seed");
    uint256 internal constant THRESHOLD = 1 ether;

    PQWeaveAccount internal account;
    LamportMerkleVerifier internal verifier;

    uint256 internal ownerPk = 0xA11CE;
    address internal owner;
    address internal recipient = makeAddr("recipient");

    // This test contract plays the role of the ERC-4337 EntryPoint.
    function setUp() public {
        owner = vm.addr(ownerPk);
        verifier = new LamportMerkleVerifier();
        account = new PQWeaveAccount(address(this));

        bytes32[512] memory sk = LamportHarness.deriveSecrets(PQC_SEED);
        bytes32[512] memory pk = LamportHarness.publicFromSecret(sk);
        bytes32 root = LamportHarness.leafCommit(pk);
        account.initialize(owner, abi.encodePacked(root), verifier, THRESHOLD);
    }

    function _executeCall(address dest, uint256 value, bytes memory data)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodeWithSelector(PQWeaveAccount.execute.selector, dest, value, data);
    }

    function _op(bytes memory callData, bytes memory signature)
        internal
        view
        returns (PackedUserOperation memory op)
    {
        op.sender = address(account);
        op.callData = callData;
        op.signature = signature;
    }

    function _ecdsa(uint256 pk, bytes32 userOpHash) internal pure returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", userOpHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _pqcBlob(bytes32 userOpHash) internal pure returns (bytes memory) {
        bytes32[512] memory sk = LamportHarness.deriveSecrets(PQC_SEED);
        bytes32[512] memory pk = LamportHarness.publicFromSecret(sk);
        bytes32[256] memory sig = LamportHarness.signOneTime(userOpHash, sk);
        return abi.encode(uint256(0), pk, sig, new bytes32[](0));
    }

    function test_relabelingConsumedLeafCannotBypassReuseGuard() public {
        bytes memory data = _executeCall(recipient, THRESHOLD, "");
        bytes32 first = keccak256("first-leaf-use");
        assertEq(
            account.validateUserOp(
                _op(data, abi.encode(_ecdsa(ownerPk, first), _pqcBlob(first))), first, 0
            ),
            0
        );
        bytes32 second = keccak256("second-leaf-use");
        // Model a second exposed signature under the same one-time key.
        bytes memory aliased = _pqcBlob(second);
        assembly { mstore(add(aliased, 32), 1) }
        assertEq(
            account.validateUserOp(
                _op(data, abi.encode(_ecdsa(ownerPk, second), aliased)), second, 0
            ),
            1
        );
        assertFalse(account.pqcLeafUsed(1));
    }

    function testFuzz_nonemptyCalldataRequiresPqc(bytes memory payload) public {
        vm.assume(payload.length > 0);
        bytes32 hash = keccak256(payload);
        bytes memory signature = abi.encode(_ecdsa(ownerPk, hash), bytes(""));
        assertEq(
            account.validateUserOp(_op(_executeCall(recipient, 0, payload), signature), hash, 0), 1
        );
    }

    function test_emptyCalldataToContractRequiresPqc() public {
        vm.etch(recipient, hex"00");
        bytes32 hash = keccak256("contract-fallback");
        bytes memory signature = abi.encode(_ecdsa(ownerPk, hash), bytes(""));
        assertEq(account.validateUserOp(_op(_executeCall(recipient, 0, ""), signature), hash, 0), 1);
    }

    function testFuzz_batchThresholdCannotBeSplit(uint96 firstValue) public {
        uint256 value = bound(firstValue, 1, THRESHOLD - 1);
        PQWeaveAccount.Call[] memory calls = new PQWeaveAccount.Call[](2);
        calls[0] = PQWeaveAccount.Call(recipient, value, "");
        calls[1] = PQWeaveAccount.Call(recipient, THRESHOLD - value, "");
        bytes memory data = abi.encodeWithSelector(PQWeaveAccount.executeBatch.selector, calls);
        bytes32 hash = keccak256(data);
        bytes memory signature = abi.encode(_ecdsa(ownerPk, hash), bytes(""));
        assertEq(account.validateUserOp(_op(data, signature), hash, 0), 1);
        calls[1].value -= 1;
        data = abi.encodeWithSelector(PQWeaveAccount.executeBatch.selector, calls);
        hash = keccak256(data);
        signature = abi.encode(_ecdsa(ownerPk, hash), bytes(""));
        assertEq(account.validateUserOp(_op(data, signature), hash, 0), 0);
    }

    function test_rotationNamespacesLeavesAndPreservesOldHistory() public {
        bytes32 hash = keccak256("consume-old-root");
        bytes memory data = _executeCall(recipient, THRESHOLD, "");
        bytes memory signature = abi.encode(_ecdsa(ownerPk, hash), _pqcBlob(hash));
        assertEq(account.validateUserOp(_op(data, signature), hash, 0), 0);
        bytes memory oldRoot = account.pqcPublicKey();
        assertTrue(account.pqcLeafUsed(0));
        vm.prank(address(account));
        account.rotatePqcKey(abi.encodePacked(keccak256("new-root")));
        assertFalse(account.pqcLeafUsed(0));
        vm.prank(address(account));
        account.rotatePqcKey(oldRoot);
        assertTrue(account.pqcLeafUsed(0));
        assertEq(account.validateUserOp(_op(data, signature), hash, 0), 1);
    }

    function test_rejectsVerifierWithoutCode() public {
        PQWeaveAccount fresh = new PQWeaveAccount(address(this));
        vm.expectRevert(PQWeaveAccount.InvalidVerifier.selector);
        fresh.initialize(owner, abi.encodePacked(bytes32(uint256(1))), IPQCVerifier(recipient), 1);
        vm.prank(address(account));
        vm.expectRevert(PQWeaveAccount.InvalidVerifier.selector);
        account.setVerifier(IPQCVerifier(recipient));
    }

    function test_erc20FalseReturnDoesNotReportExecutionSuccess() public {
        bytes memory data = abi.encodeWithSignature("transfer(address,uint256)", owner, 1);
        vm.etch(recipient, hex"00");
        vm.mockCall(recipient, data, abi.encode(false));
        vm.expectRevert(PQWeaveAccount.TokenTransferFailed.selector);
        account.execute(recipient, 0, data);
    }

    function test_erc20LegacyEmptyReturnIsAccepted() public {
        bytes memory data = abi.encodeWithSignature("transfer(address,uint256)", owner, 1);
        vm.etch(recipient, hex"00");
        vm.mockCall(recipient, data, bytes(""));
        account.execute(recipient, 0, data);
    }

    function test_routineOperationValidatesWithEcdsaOnly() public {
        bytes32 userOpHash = keccak256("routine");
        bytes memory callData = _executeCall(recipient, 0, "");
        bytes memory signature = abi.encode(_ecdsa(ownerPk, userOpHash), bytes(""));

        assertEq(account.validateUserOp(_op(callData, signature), userOpHash, 0), 0);
    }

    function test_rejectsInvalidEcdsa() public {
        bytes32 userOpHash = keccak256("routine");
        bytes memory callData = _executeCall(recipient, 0, "");
        bytes memory signature = abi.encode(_ecdsa(0xBEEF, userOpHash), bytes(""));

        assertEq(account.validateUserOp(_op(callData, signature), userOpHash, 0), 1);
    }

    function test_sensitiveOperationRequiresPqc() public {
        bytes32 userOpHash = keccak256("large-transfer");
        bytes memory callData = _executeCall(recipient, THRESHOLD, "");
        bytes memory signature = abi.encode(_ecdsa(ownerPk, userOpHash), bytes(""));

        assertEq(account.validateUserOp(_op(callData, signature), userOpHash, 0), 1);
    }

    function test_sensitiveOperationPassesWithPqc() public {
        bytes32 userOpHash = keccak256("large-transfer");
        bytes memory callData = _executeCall(recipient, THRESHOLD, "");
        bytes memory signature = abi.encode(_ecdsa(ownerPk, userOpHash), _pqcBlob(userOpHash));

        assertEq(account.validateUserOp(_op(callData, signature), userOpHash, 0), 0);
    }

    function test_rejectsReusedPqcLeaf() public {
        bytes32 userOpHash = keccak256("large-transfer");
        bytes memory callData = _executeCall(recipient, THRESHOLD, "");
        bytes memory signature = abi.encode(_ecdsa(ownerPk, userOpHash), _pqcBlob(userOpHash));

        assertEq(account.validateUserOp(_op(callData, signature), userOpHash, 0), 0);
        assertTrue(account.pqcLeafUsed(0));
        // Reusing the one-time key must fail.
        assertEq(account.validateUserOp(_op(callData, signature), userOpHash, 0), 1);
    }

    function test_tokenApprovalRequiresPqc() public {
        bytes32 userOpHash = keccak256("approve");
        bytes memory approveCall = abi.encodeWithSelector(0x095ea7b3, recipient, type(uint256).max);
        bytes memory callData = _executeCall(makeAddr("token"), 0, approveCall);

        bytes memory withoutPqc = abi.encode(_ecdsa(ownerPk, userOpHash), bytes(""));
        assertEq(account.validateUserOp(_op(callData, withoutPqc), userOpHash, 0), 1);

        bytes memory withPqc = abi.encode(_ecdsa(ownerPk, userOpHash), _pqcBlob(userOpHash));
        assertEq(account.validateUserOp(_op(callData, withPqc), userOpHash, 0), 0);
    }

    function test_executeMovesNativeFunds() public {
        vm.deal(address(account), 5 ether);
        uint256 before = recipient.balance;
        account.execute(recipient, 1 ether, "");
        assertEq(recipient.balance, before + 1 ether);
    }

    function test_adminFunctionsRequireSelfCall() public {
        vm.expectRevert(PQWeaveAccount.NotAuthorized.selector);
        account.setOwner(recipient);
    }

    // --- Maximum-security modes ---

    function _pqcRoot() internal pure returns (bytes32) {
        return LamportHarness.leafCommit(LamportHarness.publicFromSecret(deriveSeed()));
    }

    function deriveSeed() internal pure returns (bytes32[512] memory) {
        return LamportHarness.deriveSecrets(PQC_SEED);
    }

    function _newAccount(address owner_) internal returns (PQWeaveAccount a) {
        a = new PQWeaveAccount(address(this));
        a.initialize(owner_, abi.encodePacked(_pqcRoot()), verifier, THRESHOLD);
    }

    function _opFor(address sender, bytes memory callData, bytes memory signature)
        internal
        pure
        returns (PackedUserOperation memory op)
    {
        op.sender = sender;
        op.callData = callData;
        op.signature = signature;
    }

    function test_pqcSoleAuthorityRequiresPqcForEveryOperation() public {
        // owner == address(0): the ECDSA key is removed from the trust model.
        PQWeaveAccount pqcAccount = _newAccount(address(0));
        bytes32 userOpHash = keccak256("routine-under-pqc-sole-authority");
        bytes memory callData = _executeCall(recipient, 0, ""); // routine, sub-threshold

        // No post-quantum signature: even a routine op is rejected.
        bytes memory noPqc = abi.encode(bytes(""), bytes(""));
        assertEq(
            pqcAccount.validateUserOp(_opFor(address(pqcAccount), callData, noPqc), userOpHash, 0),
            1
        );

        // With a valid post-quantum signature: it passes. ECDSA is never consulted.
        bytes memory withPqc = abi.encode(bytes(""), _pqcBlob(userOpHash));
        assertEq(
            pqcAccount.validateUserOp(
                _opFor(address(pqcAccount), callData, withPqc), userOpHash, 0
            ),
            0
        );
    }

    function test_pqcOnlyFlagGatesRoutineOperations() public {
        vm.prank(address(account));
        account.setPqcOnly(true);

        bytes32 userOpHash = keccak256("routine-but-pqc-only");
        bytes memory callData = _executeCall(recipient, 0, "");

        bytes memory noPqc = abi.encode(_ecdsa(ownerPk, userOpHash), bytes(""));
        assertEq(account.validateUserOp(_op(callData, noPqc), userOpHash, 0), 1);

        bytes memory withPqc = abi.encode(_ecdsa(ownerPk, userOpHash), _pqcBlob(userOpHash));
        assertEq(account.validateUserOp(_op(callData, withPqc), userOpHash, 0), 0);
    }

    function test_initializeRejectsBadPqcKey() public {
        PQWeaveAccount a = new PQWeaveAccount(address(this));
        vm.expectRevert(PQWeaveAccount.InvalidPqcKey.selector);
        a.initialize(owner, hex"1234", verifier, THRESHOLD);
    }

    function test_initializeRejectsZeroVerifier() public {
        PQWeaveAccount a = new PQWeaveAccount(address(this));
        vm.expectRevert(PQWeaveAccount.InvalidVerifier.selector);
        a.initialize(owner, abi.encodePacked(_pqcRoot()), IPQCVerifier(address(0)), THRESHOLD);
    }

    function test_setVerifierRejectsZeroVerifier() public {
        vm.prank(address(account));
        vm.expectRevert(PQWeaveAccount.InvalidVerifier.selector);
        account.setVerifier(IPQCVerifier(address(0)));
    }

    function test_initializeRejectsThirdParties() public {
        // A delegated-but-uninitialized account must not be claimable by anyone
        // other than its deployer or itself (7702 self-call).
        PQWeaveAccount a = new PQWeaveAccount(address(this));
        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        vm.expectRevert(PQWeaveAccount.NotAuthorized.selector);
        a.initialize(attacker, abi.encodePacked(_pqcRoot()), verifier, THRESHOLD);
    }

    function test_initializeAllowsSelfCallUnderDelegation() public {
        uint256 eoaPk = 0xD00D;
        address eoa = vm.addr(eoaPk);
        PQWeaveAccount impl = new PQWeaveAccount(address(this));

        vm.signAndAttachDelegation(address(impl), eoaPk);
        vm.prank(eoa); // the EOA calling itself: msg.sender == address(this)
        PQWeaveAccount(payable(eoa))
            .initialize(eoa, abi.encodePacked(_pqcRoot()), verifier, THRESHOLD);
        assertEq(PQWeaveAccount(payable(eoa)).owner(), eoa);
    }

    function test_rotatePqcKeyRejectsBadLength() public {
        vm.prank(address(account));
        vm.expectRevert(PQWeaveAccount.InvalidPqcKey.selector);
        account.rotatePqcKey(hex"1234");
    }

    function test_rotatePqcKeyAcceptsNewRoot() public {
        bytes32 newRoot = keccak256("rotated-root");
        vm.prank(address(account));
        account.rotatePqcKey(abi.encodePacked(newRoot));
        assertEq(account.pqcPublicKey(), abi.encodePacked(newRoot));
    }
}
