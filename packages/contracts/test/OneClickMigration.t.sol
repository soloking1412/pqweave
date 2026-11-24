// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {BatchExecutor} from "../src/BatchExecutor.sol";
import {MockERC20, MockERC721} from "./utils/Mocks.sol";

contract FalseReturnToken {
    function transfer(address, uint256) external pure returns (bool) {
        return false;
    }
}

contract NoReturnToken {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
    }
}

/// @notice Proves a full EVM wallet can be migrated in a single EIP-7702
///         transaction: the EOA delegates to BatchExecutor and sweeps native,
///         ERC-20, and NFT holdings to a quantum-safe account at once.
contract OneClickMigrationTest is Test {
    BatchExecutor internal executor;
    MockERC20 internal token;
    MockERC721 internal nft;

    uint256 internal eoaPk = 0xC0FFEE;
    address internal eoa;
    address internal safeAccount = makeAddr("safeAccount");

    function setUp() public {
        executor = new BatchExecutor();
        token = new MockERC20();
        nft = new MockERC721();
        eoa = vm.addr(eoaPk);

        vm.deal(eoa, 10 ether);
        token.mint(eoa, 1_000 ether);
        nft.mint(eoa, 7);
    }

    function test_migratesEntireWalletInOneTransaction() public {
        BatchExecutor.Call[] memory calls = new BatchExecutor.Call[](3);
        calls[0] = BatchExecutor.Call({
            target: address(token),
            value: 0,
            data: abi.encodeCall(MockERC20.transfer, (safeAccount, 1_000 ether))
        });
        calls[1] = BatchExecutor.Call({
            target: address(nft),
            value: 0,
            data: abi.encodeCall(MockERC721.transferFrom, (eoa, safeAccount, 7))
        });
        calls[2] = BatchExecutor.Call({target: safeAccount, value: 9 ether, data: ""});

        // One 7702 transaction: delegate the EOA to BatchExecutor and run the batch.
        vm.signAndAttachDelegation(address(executor), eoaPk);
        vm.prank(eoa);
        BatchExecutor(eoa).executeBatch(calls);

        assertEq(token.balanceOf(eoa), 0);
        assertEq(token.balanceOf(safeAccount), 1_000 ether);
        assertEq(nft.ownerOf(7), safeAccount);
        assertEq(safeAccount.balance, 9 ether);
        // The delegated code is now present on the EOA address.
        assertGt(eoa.code.length, 0);
    }

    function test_onlySelfCanExecute() public {
        vm.signAndAttachDelegation(address(executor), eoaPk);
        BatchExecutor.Call[] memory calls = new BatchExecutor.Call[](0);
        vm.expectRevert(BatchExecutor.NotSelf.selector);
        BatchExecutor(eoa).executeBatch(calls); // caller is the test contract, not the EOA
    }

    function test_falseReturnTokenRevertsWholeSweep() public {
        FalseReturnToken badToken = new FalseReturnToken();
        BatchExecutor.Call[] memory calls = new BatchExecutor.Call[](2);
        calls[0] = BatchExecutor.Call({
            target: address(badToken),
            value: 0,
            data: abi.encodeCall(FalseReturnToken.transfer, (safeAccount, 1))
        });
        calls[1] = BatchExecutor.Call({target: safeAccount, value: 9 ether, data: ""});

        vm.signAndAttachDelegation(address(executor), eoaPk);
        vm.prank(eoa);
        vm.expectRevert(abi.encodeWithSelector(BatchExecutor.TokenTransferFailed.selector, 0));
        BatchExecutor(eoa).executeBatch(calls);
        assertEq(safeAccount.balance, 0);
    }

    function test_missingTokenCodeRevertsEarlierNativeTransfer() public {
        BatchExecutor.Call[] memory calls = new BatchExecutor.Call[](2);
        calls[0] = BatchExecutor.Call(safeAccount, 1 ether, "");
        calls[1] = BatchExecutor.Call(
            makeAddr("noTokenCode"), 0, abi.encodeCall(FalseReturnToken.transfer, (safeAccount, 1))
        );
        vm.signAndAttachDelegation(address(executor), eoaPk);
        vm.prank(eoa);
        vm.expectRevert(abi.encodeWithSelector(BatchExecutor.TokenTransferFailed.selector, 1));
        BatchExecutor(eoa).executeBatch(calls);
        assertEq(safeAccount.balance, 0);
        assertEq(eoa.balance, 10 ether);
    }

    function testFuzz_unrelatedCallerCannotExecute(address caller) public {
        vm.assume(caller != eoa);
        vm.signAndAttachDelegation(address(executor), eoaPk);
        BatchExecutor.Call[] memory calls = new BatchExecutor.Call[](1);
        calls[0] = BatchExecutor.Call(safeAccount, 1 ether, "");
        vm.prank(caller);
        vm.expectRevert(BatchExecutor.NotSelf.selector);
        BatchExecutor(eoa).executeBatch(calls);
        assertEq(safeAccount.balance, 0);
    }

    function test_noReturnTokenCanSweep() public {
        NoReturnToken noReturnToken = new NoReturnToken();
        noReturnToken.mint(eoa, 50);
        BatchExecutor.Call[] memory calls = new BatchExecutor.Call[](1);
        calls[0] = BatchExecutor.Call({
            target: address(noReturnToken),
            value: 0,
            data: abi.encodeCall(NoReturnToken.transfer, (safeAccount, 50))
        });

        vm.signAndAttachDelegation(address(executor), eoaPk);
        vm.prank(eoa);
        BatchExecutor(eoa).executeBatch(calls);
        assertEq(noReturnToken.balanceOf(eoa), 0);
        assertEq(noReturnToken.balanceOf(safeAccount), 50);
    }
}
