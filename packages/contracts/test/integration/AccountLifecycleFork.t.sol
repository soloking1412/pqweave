// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PQWeaveAccount} from "../../src/PQWeaveAccount.sol";
import {PQWeaveFactory} from "../../src/PQWeaveFactory.sol";
import {LamportMerkleVerifier} from "../../src/verifiers/LamportMerkleVerifier.sol";
import {IEntryPoint} from "../../src/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "../../src/interfaces/IAccount.sol";
import {LamportHarness} from "../utils/LamportHarness.sol";

/// @notice Full ERC-4337 lifecycle against the real canonical EntryPoint on a
///         Base Sepolia fork. Runs only when RPC_URL_BASE_SEPOLIA is set, so the
///         default test run stays offline.
contract AccountLifecycleForkTest is Test {
    IEntryPoint internal constant ENTRY_POINT =
        IEntryPoint(0x0000000071727De22E5E9d8BAf0edAc6f37da032);
    bytes32 internal constant PQC_SEED = keccak256("fork-pqc-seed");
    uint256 internal constant THRESHOLD = 1 ether;

    PQWeaveFactory internal factory;
    LamportMerkleVerifier internal verifier;
    PQWeaveAccount internal account;

    uint256 internal ownerPk = 0xA11CE;
    address internal owner;
    address internal recipient;
    bytes32[] internal leaves;
    bool internal active;

    receive() external payable {}

    function setUp() public {
        string memory rpc = vm.envOr("RPC_URL_BASE_SEPOLIA", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        active = true;

        owner = vm.addr(ownerPk);
        recipient = address(new Sink()); // fresh address on the fork, no real-chain code
        verifier = new LamportMerkleVerifier();
        factory = new PQWeaveFactory(address(ENTRY_POINT));

        bytes32 root = _buildRoot();
        account = factory.createAccount(
            owner, abi.encodePacked(root), verifier, THRESHOLD, bytes32(uint256(1))
        );

        vm.deal(address(account), 10 ether);
        ENTRY_POINT.depositTo{value: 2 ether}(address(account));
    }

    function test_routineTransferValidatesWithEcdsaOnly() public {
        if (!active) return vm.skip(true);
        bytes memory callData = abi.encodeCall(PQWeaveAccount.execute, (recipient, 0.1 ether, ""));
        uint256 before = recipient.balance;
        _submit(_sign(_buildOp(callData), false, 0));
        assertEq(recipient.balance, before + 0.1 ether);
    }

    function test_gatedTransferRevertsWithoutPqc() public {
        if (!active) return vm.skip(true);
        bytes memory callData = abi.encodeCall(PQWeaveAccount.execute, (recipient, 2 ether, ""));
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = _sign(_buildOp(callData), false, 0);
        vm.expectRevert();
        ENTRY_POINT.handleOps(ops, payable(address(this)));
    }

    function test_gatedTransferSucceedsWithPqc() public {
        if (!active) return vm.skip(true);
        bytes memory callData = abi.encodeCall(PQWeaveAccount.execute, (recipient, 2 ether, ""));
        uint256 before = recipient.balance;
        _submit(_sign(_buildOp(callData), true, 0));
        assertEq(recipient.balance, before + 2 ether);
        assertTrue(account.pqcLeafUsed(0));
    }

    // --- helpers ---

    function _submit(PackedUserOperation memory op) internal {
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op;
        ENTRY_POINT.handleOps(ops, payable(address(this)));
    }

    function _buildOp(bytes memory callData) internal view returns (PackedUserOperation memory op) {
        op.sender = address(account);
        op.nonce = ENTRY_POINT.getNonce(address(account), 0);
        op.callData = callData;
        op.accountGasLimits = _pack(3_000_000, 500_000); // verificationGasLimit, callGasLimit
        op.preVerificationGas = 100_000;
        op.gasFees = _pack(1 gwei, 2 gwei); // maxPriorityFeePerGas, maxFeePerGas
    }

    function _sign(PackedUserOperation memory op, bool withPqc, uint256 leafIndex)
        internal
        view
        returns (PackedUserOperation memory)
    {
        bytes32 userOpHash = ENTRY_POINT.getUserOpHash(op);
        bytes32 ethHash =
            keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", userOpHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, ethHash);
        bytes memory ecdsa = abi.encodePacked(r, s, v);
        bytes memory pqc = withPqc ? _pqcBlob(userOpHash, leafIndex) : bytes("");
        op.signature = abi.encode(ecdsa, pqc);
        return op;
    }

    function _pack(uint128 high, uint128 low) internal pure returns (bytes32) {
        return bytes32((uint256(high) << 128) | uint256(low));
    }

    function _leafSecrets(uint256 index) internal pure returns (bytes32[512] memory) {
        return LamportHarness.deriveSecrets(keccak256(abi.encodePacked(PQC_SEED, index)));
    }

    function _buildRoot() internal returns (bytes32) {
        leaves = new bytes32[](2);
        for (uint256 i = 0; i < 2; i++) {
            leaves[i] = LamportHarness.leafCommit(LamportHarness.publicFromSecret(_leafSecrets(i)));
        }
        return LamportHarness.buildRoot(leaves);
    }

    function _pqcBlob(bytes32 userOpHash, uint256 leafIndex) internal view returns (bytes memory) {
        bytes32[512] memory sk = _leafSecrets(leafIndex);
        bytes32[512] memory pk = LamportHarness.publicFromSecret(sk);
        bytes32[256] memory sig = LamportHarness.signOneTime(userOpHash, sk);
        bytes32[] memory proof = LamportHarness.buildProof(leaves, leafIndex);
        return abi.encode(leafIndex, pk, sig, proof);
    }
}

/// @dev Empty payable sink so transfers land at a fresh fork address.
contract Sink {
    receive() external payable {}
}
