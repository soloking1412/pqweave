// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPQCVerifier} from "../interfaces/IPQCVerifier.sol";

/// @notice Post-quantum signature verifier built on Lamport one-time signatures
///         secured by a Merkle tree (an XMSS-style construction).
/// @dev Security rests only on the preimage and collision resistance of
///      keccak256, so it has no lattice or discrete-log assumptions and is
///      unaffected by Shor's algorithm.
///
///      Encodings:
///        publicKey  = the 32-byte Merkle root committing to the one-time keys.
///        signature  = abi.encode(
///                       uint256     leafIndex,   // which one-time key is used
///                       bytes32[512] otsPublicKey,// pk[2i], pk[2i+1] per message bit
///                       bytes32[256] otsSignature,// revealed secret per message bit
///                       bytes32[]    merkleProof   // path from the leaf to the root
///                     );
///
///      The signed message bits are read most-significant-bit first across the
///      32-byte `messageHash`. Each one-time key authorizes exactly one
///      operation; reuse protection is enforced by the calling account.
contract LamportMerkleVerifier is IPQCVerifier {
    function scheme() external pure returns (bytes32) {
        return "lamport-merkle-keccak256";
    }

    function verify(bytes32 messageHash, bytes calldata publicKey, bytes calldata signature)
        external
        pure
        returns (bool)
    {
        if (publicKey.length != 32) return false;
        bytes32 root = bytes32(publicKey[0:32]);

        (
            uint256 leafIndex,
            bytes32[512] memory otsPublicKey,
            bytes32[256] memory otsSignature,
            bytes32[] memory merkleProof
        ) = abi.decode(signature, (uint256, bytes32[512], bytes32[256], bytes32[]));

        if (!_verifyOneTime(messageHash, otsPublicKey, otsSignature)) return false;

        bytes32 leaf = keccak256(abi.encode(otsPublicKey));
        return _verifyMerkle(leaf, leafIndex, merkleProof) == root;
    }

    function _verifyOneTime(
        bytes32 messageHash,
        bytes32[512] memory otsPublicKey,
        bytes32[256] memory otsSignature
    ) private pure returns (bool) {
        uint256 message = uint256(messageHash);
        for (uint256 i = 0; i < 256; i++) {
            uint256 bit = (message >> (255 - i)) & 1;
            if (keccak256(abi.encodePacked(otsSignature[i])) != otsPublicKey[2 * i + bit]) {
                return false;
            }
        }
        return true;
    }

    function _verifyMerkle(bytes32 leaf, uint256 leafIndex, bytes32[] memory proof)
        private
        pure
        returns (bytes32 node)
    {
        node = leaf;
        uint256 index = leafIndex;
        for (uint256 i = 0; i < proof.length; i++) {
            node = (index & 1) == 0
                ? keccak256(abi.encodePacked(node, proof[i]))
                : keccak256(abi.encodePacked(proof[i], node));
            index >>= 1;
        }
    }
}
