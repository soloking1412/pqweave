// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {LamportMerkleVerifier} from "../src/verifiers/LamportMerkleVerifier.sol";
import {LamportHarness} from "./utils/LamportHarness.sol";

contract LamportMerkleVerifierTest is Test {
    using LamportHarness for *;

    LamportMerkleVerifier internal verifier;

    function setUp() public {
        verifier = new LamportMerkleVerifier();
    }

    function _encodeSig(
        uint256 leafIndex,
        bytes32[512] memory pk,
        bytes32[256] memory sig,
        bytes32[] memory proof
    ) internal pure returns (bytes memory) {
        return abi.encode(leafIndex, pk, sig, proof);
    }

    function test_verifiesSingleLeafSignature() public view {
        bytes32 message = keccak256("authorize-large-transfer");
        bytes32[512] memory sk = LamportHarness.deriveSecrets(keccak256("seed"));
        bytes32[512] memory pk = LamportHarness.publicFromSecret(sk);
        bytes32 root = LamportHarness.leafCommit(pk);

        bytes32[256] memory sig = LamportHarness.signOneTime(message, sk);
        bytes memory signature = _encodeSig(0, pk, sig, new bytes32[](0));

        assertTrue(verifier.verify(message, abi.encodePacked(root), signature));
    }

    function testFuzz_rejectsOutOfTreeLeafAlias(uint256 aliasIndex) public view {
        aliasIndex = bound(aliasIndex, 1, type(uint256).max);
        bytes32 message = keccak256("alias-regression");
        bytes32[512] memory sk = LamportHarness.deriveSecrets(keccak256("seed"));
        bytes32[512] memory pk = LamportHarness.publicFromSecret(sk);
        bytes32 root = LamportHarness.leafCommit(pk);
        bytes memory signature =
            _encodeSig(aliasIndex, pk, LamportHarness.signOneTime(message, sk), new bytes32[](0));
        assertFalse(verifier.verify(message, abi.encodePacked(root), signature));
    }

    function test_rejectsTamperedMessage() public view {
        bytes32 message = keccak256("authorize-large-transfer");
        bytes32[512] memory sk = LamportHarness.deriveSecrets(keccak256("seed"));
        bytes32[512] memory pk = LamportHarness.publicFromSecret(sk);
        bytes32 root = LamportHarness.leafCommit(pk);

        bytes32[256] memory sig = LamportHarness.signOneTime(message, sk);
        bytes memory signature = _encodeSig(0, pk, sig, new bytes32[](0));

        assertFalse(verifier.verify(keccak256("different"), abi.encodePacked(root), signature));
    }

    function test_rejectsForgedSignature() public view {
        bytes32 message = keccak256("authorize-large-transfer");
        bytes32[512] memory sk = LamportHarness.deriveSecrets(keccak256("seed"));
        bytes32[512] memory pk = LamportHarness.publicFromSecret(sk);
        bytes32 root = LamportHarness.leafCommit(pk);

        bytes32[256] memory sig = LamportHarness.signOneTime(message, sk);
        sig[0] = keccak256("forged");
        bytes memory signature = _encodeSig(0, pk, sig, new bytes32[](0));

        assertFalse(verifier.verify(message, abi.encodePacked(root), signature));
    }

    function test_verifiesLeafWithinMerkleTree() public view {
        bytes32 message = keccak256("authorize");
        uint256 leafIndex = 2;

        bytes32[] memory leaves = new bytes32[](4);
        bytes32[512] memory targetSk;
        bytes32[512] memory targetPk;
        for (uint256 i = 0; i < 4; i++) {
            bytes32[512] memory sk =
                LamportHarness.deriveSecrets(keccak256(abi.encodePacked("leaf", i)));
            bytes32[512] memory pk = LamportHarness.publicFromSecret(sk);
            leaves[i] = LamportHarness.leafCommit(pk);
            if (i == leafIndex) {
                targetSk = sk;
                targetPk = pk;
            }
        }

        bytes32 root = LamportHarness.buildRoot(leaves);
        bytes32[] memory proof = LamportHarness.buildProof(leaves, leafIndex);
        bytes32[256] memory sig = LamportHarness.signOneTime(message, targetSk);
        bytes memory signature = _encodeSig(leafIndex, targetPk, sig, proof);

        assertTrue(verifier.verify(message, abi.encodePacked(root), signature));
    }

    function test_rejectsWrongLeafIndex() public view {
        bytes32 message = keccak256("authorize");
        uint256 leafIndex = 2;

        bytes32[] memory leaves = new bytes32[](4);
        bytes32[512] memory targetSk;
        bytes32[512] memory targetPk;
        for (uint256 i = 0; i < 4; i++) {
            bytes32[512] memory sk =
                LamportHarness.deriveSecrets(keccak256(abi.encodePacked("leaf", i)));
            bytes32[512] memory pk = LamportHarness.publicFromSecret(sk);
            leaves[i] = LamportHarness.leafCommit(pk);
            if (i == leafIndex) {
                targetSk = sk;
                targetPk = pk;
            }
        }

        bytes32 root = LamportHarness.buildRoot(leaves);
        bytes32[] memory proof = LamportHarness.buildProof(leaves, leafIndex);
        bytes32[256] memory sig = LamportHarness.signOneTime(message, targetSk);
        // Claim the wrong index while supplying a valid proof for leaf 2.
        bytes memory signature = _encodeSig(1, targetPk, sig, proof);

        assertFalse(verifier.verify(message, abi.encodePacked(root), signature));
    }

    // --- Fuzz ---

    function testFuzz_acceptsValidSignature(bytes32 message) public view {
        bytes32[512] memory sk = LamportHarness.deriveSecrets(keccak256("fuzz-seed"));
        bytes32[512] memory pk = LamportHarness.publicFromSecret(sk);
        bytes32 root = LamportHarness.leafCommit(pk);
        bytes32[256] memory sig = LamportHarness.signOneTime(message, sk);

        bytes memory signature = _encodeSig(0, pk, sig, new bytes32[](0));
        assertTrue(verifier.verify(message, abi.encodePacked(root), signature));
    }

    function testFuzz_rejectsDifferentMessage(bytes32 message, bytes32 other) public view {
        vm.assume(message != other);
        bytes32[512] memory sk = LamportHarness.deriveSecrets(keccak256("fuzz-seed"));
        bytes32[512] memory pk = LamportHarness.publicFromSecret(sk);
        bytes32 root = LamportHarness.leafCommit(pk);
        bytes32[256] memory sig = LamportHarness.signOneTime(message, sk);

        bytes memory signature = _encodeSig(0, pk, sig, new bytes32[](0));
        assertFalse(verifier.verify(other, abi.encodePacked(root), signature));
    }

    function testFuzz_rejectsTamperedSignature(bytes32 message, uint8 position) public view {
        bytes32[512] memory sk = LamportHarness.deriveSecrets(keccak256("fuzz-seed"));
        bytes32[512] memory pk = LamportHarness.publicFromSecret(sk);
        bytes32 root = LamportHarness.leafCommit(pk);
        bytes32[256] memory sig = LamportHarness.signOneTime(message, sk);
        sig[position] = keccak256(abi.encodePacked("tamper", message, position));

        bytes memory signature = _encodeSig(0, pk, sig, new bytes32[](0));
        assertFalse(verifier.verify(message, abi.encodePacked(root), signature));
    }
}
