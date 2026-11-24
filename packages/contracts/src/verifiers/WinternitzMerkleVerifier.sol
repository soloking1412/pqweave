// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPQCVerifier} from "../interfaces/IPQCVerifier.sol";
import {HashSigEncoding} from "../libraries/HashSigEncoding.sol";

/// @notice Custom Winternitz-style one-time signatures secured by a Merkle tree.
///         This is not a standardized WOTS+, XMSS, or NIST-approved implementation.
/// @dev Same security assumption as LamportMerkleVerifier (keccak256 preimage and
///      collision resistance only, unaffected by Shor's algorithm), but roughly
///      11x cheaper in calldata.
///
///      Lamport must transmit the one-time public key so the verifier can rebuild
///      the Merkle leaf: 512 + 256 words, about 24.6 KB. Winternitz *derives* the
///      public key by finishing each hash chain, so only the 67 chain values
///      travel, about 2.2 KB. Since calldata dominates verification cost on EVM,
///      that is the difference between an expensive operation and a routine one.
///
///      Encodings:
///        publicKey = the 32-byte Merkle root committing to the one-time keys.
///        signature = abi.encode(
///                      uint256     leafIndex,  // which one-time key is used
///                      bytes32[67] chains,     // one value per base-16 digit
///                      bytes32[]   merkleProof // path from the leaf to the root
///                    );
///
///      Digits are read most-significant-nibble first across `messageHash`,
///      followed by 3 checksum digits, most significant first. Each one-time key
///      authorizes exactly one operation; reuse protection is enforced by the
///      calling account, and reuse here is more damaging than under Lamport
///      because a lower digit reveals every chain step above it.
contract WinternitzMerkleVerifier is IPQCVerifier {
    /// @dev Winternitz parameter; each chain encodes log2(W) = 4 bits.
    uint256 private constant W = 16;
    uint256 private constant MESSAGE_CHAINS = 64;
    uint256 private constant CHECKSUM_CHAINS = 3;
    uint256 private constant CHAINS = 67;

    function scheme() external pure returns (bytes32) {
        return "winternitz-merkle-keccak256";
    }

    function verify(bytes32 messageHash, bytes calldata publicKey, bytes calldata signature)
        external
        pure
        returns (bool)
    {
        if (publicKey.length != 32 || !HashSigEncoding.valid(signature, 69)) return false;
        bytes32 root = bytes32(publicKey[0:32]);

        (uint256 leafIndex, bytes32[67] memory chains, bytes32[] memory merkleProof) =
            abi.decode(signature, (uint256, bytes32[67], bytes32[]));

        uint256[CHAINS] memory digits = _digits(messageHash);

        // Finish every chain to W-1. This reconstructs the one-time public key,
        // which is why the signature never has to carry it.
        bytes32[CHAINS] memory otsPublicKey;
        for (uint256 i = 0; i < CHAINS; i++) {
            otsPublicKey[i] = _chain(chains[i], leafIndex, i, digits[i], W - 1);
        }

        // abi.encode of a fixed-size bytes32 array is the elements laid out
        // inline, which is exactly the concatenation the SDK hashes.
        bytes32 leaf = keccak256(abi.encode(otsPublicKey));
        return _verifyMerkle(leaf, leafIndex, merkleProof) == root;
    }

    /// @dev Split the digest into base-16 digits and append the checksum.
    ///      The checksum is what prevents forgery: an attacker can always walk a
    ///      chain forward to a higher digit, so without it any digit could be
    ///      raised at will. Raising a message digit lowers the checksum, and
    ///      lowering a checksum digit would mean inverting keccak256.
    function _digits(bytes32 messageHash) private pure returns (uint256[CHAINS] memory digits) {
        uint256 message = uint256(messageHash);
        uint256 checksum;
        for (uint256 i = 0; i < MESSAGE_CHAINS; i++) {
            uint256 digit = (message >> (252 - 4 * i)) & 0x0f;
            digits[i] = digit;
            checksum += W - 1 - digit;
        }
        for (uint256 i = 0; i < CHECKSUM_CHAINS; i++) {
            digits[MESSAGE_CHAINS + i] = (checksum >> (4 * (CHECKSUM_CHAINS - 1 - i))) & 0x0f;
        }
    }

    /// @dev Walk a chain from `from` to `to`, hashing with a position-dependent
    ///      tweak. The tweak makes each step its own function; without it a
    ///      single inverted hash would apply across every leaf in the tree at
    ///      once, turning a single-key attack into a multi-target one.
    function _chain(bytes32 start, uint256 leafIndex, uint256 chainIndex, uint256 from, uint256 to)
        private
        pure
        returns (bytes32 node)
    {
        node = start;
        for (uint256 step = from; step < to; step++) {
            node = keccak256(abi.encodePacked(node, (leafIndex << 64) | (chainIndex << 32) | step));
        }
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
