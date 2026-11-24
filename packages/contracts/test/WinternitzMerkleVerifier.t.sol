// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {WinternitzMerkleVerifier} from "../src/verifiers/WinternitzMerkleVerifier.sol";
import {WinternitzHarness} from "./utils/WinternitzHarness.sol";

contract WinternitzMerkleVerifierTest is Test {
    uint256 private constant CHAINS = 67;

    WinternitzMerkleVerifier internal verifier;

    function setUp() public {
        verifier = new WinternitzMerkleVerifier();
    }

    function _encodeSig(uint256 leafIndex, bytes32[CHAINS] memory sig, bytes32[] memory proof)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(leafIndex, sig, proof);
    }

    /// @dev Build a signature for `leafIndex` in a single-leaf tree.
    function _sign(bytes32 seed, bytes32 message, uint256 leafIndex)
        internal
        pure
        returns (bytes32 root, bytes memory signature)
    {
        bytes32[CHAINS] memory sk = WinternitzHarness.deriveSecrets(seed, leafIndex);
        root = WinternitzHarness.leafCommit(WinternitzHarness.publicFromSecret(sk, leafIndex));
        signature = _encodeSig(
            leafIndex, WinternitzHarness.signOneTime(message, sk, leafIndex), new bytes32[](0)
        );
    }

    function test_verifiesSingleLeafSignature() public view {
        (bytes32 root, bytes memory signature) = _sign(keccak256("seed"), keccak256("authorize"), 0);
        assertTrue(verifier.verify(keccak256("authorize"), abi.encodePacked(root), signature));
    }

    function test_verifiesLeafWithinMerkleTree() public view {
        bytes32 seed = keccak256("tree-seed");
        bytes32 message = keccak256("authorize-large-transfer");

        // Two-leaf tree; sign with leaf 1, prove against leaf 0 as the sibling.
        bytes32 leaf0 = WinternitzHarness.leafCommit(
            WinternitzHarness.publicFromSecret(WinternitzHarness.deriveSecrets(seed, 0), 0)
        );
        bytes32[CHAINS] memory sk1 = WinternitzHarness.deriveSecrets(seed, 1);
        bytes32 leaf1 = WinternitzHarness.leafCommit(WinternitzHarness.publicFromSecret(sk1, 1));
        bytes32 root = keccak256(abi.encodePacked(leaf0, leaf1));

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = leaf0;
        bytes memory signature =
            _encodeSig(1, WinternitzHarness.signOneTime(message, sk1, 1), proof);

        assertTrue(verifier.verify(message, abi.encodePacked(root), signature));
    }

    function test_rejectsTruncatedTweakLeafAlias() public view {
        bytes32 message = keccak256("alias-regression");
        (bytes32 root, bytes memory signature) = _sign(keccak256("seed"), message, 0);
        // The original tweak shifted leafIndex left 64 bits in uint256; the
        // high 64 bits disappeared, while the empty Merkle proof ignored them.
        assembly { mstore(add(signature, 32), shl(192, 1)) }
        assertFalse(verifier.verify(message, abi.encodePacked(root), signature));
    }

    function test_rejectsTamperedMessage() public view {
        (bytes32 root, bytes memory signature) = _sign(keccak256("seed"), keccak256("authorize"), 0);
        assertFalse(verifier.verify(keccak256("different"), abi.encodePacked(root), signature));
    }

    function test_rejectsWrongLeafIndex() public view {
        bytes32 seed = keccak256("seed");
        bytes32 message = keccak256("authorize");
        bytes32[CHAINS] memory sk = WinternitzHarness.deriveSecrets(seed, 3);
        bytes32 root = WinternitzHarness.leafCommit(WinternitzHarness.publicFromSecret(sk, 3));

        // Genuine chains for leaf 3, relabelled as leaf 4. The per-leaf tweak
        // means they no longer complete to the same public key.
        bytes memory signature =
            _encodeSig(4, WinternitzHarness.signOneTime(message, sk, 3), new bytes32[](0));
        assertFalse(verifier.verify(message, abi.encodePacked(root), signature));
    }

    function test_rejectsMalformedPublicKeyLength() public view {
        (, bytes memory signature) = _sign(keccak256("seed"), keccak256("authorize"), 0);
        assertFalse(verifier.verify(keccak256("authorize"), hex"1234", signature));
    }

    function test_schemeIdentifierIsDistinctFromLamport() public view {
        assertEq(verifier.scheme(), bytes32("winternitz-merkle-keccak256"));
    }

    function testFuzz_acceptsValidSignature(bytes32 message) public view {
        (bytes32 root, bytes memory signature) = _sign(keccak256("fuzz-seed"), message, 0);
        assertTrue(verifier.verify(message, abi.encodePacked(root), signature));
    }

    function testFuzz_rejectsDifferentMessage(bytes32 message, bytes32 other) public view {
        vm.assume(message != other);
        (bytes32 root, bytes memory signature) = _sign(keccak256("fuzz-seed"), message, 0);
        assertFalse(verifier.verify(other, abi.encodePacked(root), signature));
    }

    /// @dev Any single altered chain value must break verification. This is the
    ///      property that matters: an attacker holding a valid signature must not
    ///      be able to substitute one element and keep it valid.
    function testFuzz_rejectsTamperedSignature(bytes32 message, uint8 position) public view {
        bytes32 seed = keccak256("fuzz-seed");
        bytes32[CHAINS] memory sk = WinternitzHarness.deriveSecrets(seed, 0);
        bytes32 root = WinternitzHarness.leafCommit(WinternitzHarness.publicFromSecret(sk, 0));

        bytes32[CHAINS] memory sig = WinternitzHarness.signOneTime(message, sk, 0);
        sig[position % CHAINS] = keccak256(abi.encodePacked("tampered", position));

        assertFalse(
            verifier.verify(message, abi.encodePacked(root), _encodeSig(0, sig, new bytes32[](0)))
        );
    }

    /// @dev The checksum is the forgery barrier. An attacker can always advance a
    ///      message chain by hashing, so raising a digit is free; the checksum
    ///      chains then have to be walked backwards, which is a preimage problem.
    ///      Advancing a chain without fixing the checksum must fail.
    function testFuzz_advancingAChainAloneDoesNotForge(bytes32 message, uint8 position)
        public
        view
    {
        bytes32 seed = keccak256("fuzz-seed");
        bytes32[CHAINS] memory sk = WinternitzHarness.deriveSecrets(seed, 0);
        bytes32 root = WinternitzHarness.leafCommit(WinternitzHarness.publicFromSecret(sk, 0));

        uint256 index = position % WinternitzHarness.MESSAGE_CHAINS;
        uint256[CHAINS] memory d = WinternitzHarness.digits(message);
        vm.assume(d[index] < WinternitzHarness.W - 1); // room to advance

        bytes32[CHAINS] memory sig = WinternitzHarness.signOneTime(message, sk, 0);
        // Walk this one chain forward by a step, as an attacker could.
        sig[index] = WinternitzHarness.chain(sig[index], 0, index, d[index], d[index] + 1);

        assertFalse(
            verifier.verify(message, abi.encodePacked(root), _encodeSig(0, sig, new bytes32[](0)))
        );
    }
}
