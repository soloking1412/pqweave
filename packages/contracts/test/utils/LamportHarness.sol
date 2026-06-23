// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Test-only helper that mirrors the Lamport + Merkle scheme used by
///         LamportMerkleVerifier, so tests can produce valid keys and signatures.
library LamportHarness {
    function deriveSecrets(bytes32 seed) internal pure returns (bytes32[512] memory sk) {
        for (uint256 i = 0; i < 512; i++) {
            sk[i] = keccak256(abi.encodePacked(seed, i));
        }
    }

    function publicFromSecret(bytes32[512] memory sk)
        internal
        pure
        returns (bytes32[512] memory pk)
    {
        for (uint256 i = 0; i < 512; i++) {
            pk[i] = keccak256(abi.encodePacked(sk[i]));
        }
    }

    function leafCommit(bytes32[512] memory pk) internal pure returns (bytes32) {
        return keccak256(abi.encode(pk));
    }

    function signOneTime(bytes32 message, bytes32[512] memory sk)
        internal
        pure
        returns (bytes32[256] memory sig)
    {
        uint256 m = uint256(message);
        for (uint256 i = 0; i < 256; i++) {
            uint256 bit = (m >> (255 - i)) & 1;
            sig[i] = sk[2 * i + bit];
        }
    }

    function buildRoot(bytes32[] memory leaves) internal pure returns (bytes32) {
        bytes32[] memory nodes = leaves;
        while (nodes.length > 1) {
            nodes = _nextLevel(nodes);
        }
        return nodes[0];
    }

    function buildProof(bytes32[] memory leaves, uint256 index)
        internal
        pure
        returns (bytes32[] memory proof)
    {
        uint256 levels;
        for (uint256 t = leaves.length; t > 1; t >>= 1) {
            levels++;
        }
        proof = new bytes32[](levels);

        bytes32[] memory nodes = leaves;
        uint256 idx = index;
        uint256 p;
        while (nodes.length > 1) {
            proof[p++] = nodes[idx ^ 1];
            nodes = _nextLevel(nodes);
            idx >>= 1;
        }
    }

    function _nextLevel(bytes32[] memory nodes) private pure returns (bytes32[] memory next) {
        next = new bytes32[](nodes.length / 2);
        for (uint256 i = 0; i < next.length; i++) {
            next[i] = keccak256(abi.encodePacked(nodes[2 * i], nodes[2 * i + 1]));
        }
    }
}
