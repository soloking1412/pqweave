// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Test-only Winternitz signer, so the verifier can be fuzzed on chain
///         rather than only against fixtures generated off chain.
/// @dev Deliberately an independent implementation of the signing side. The
///      verifier is the code under test; if this file simply called into it the
///      tests would prove nothing. Cross-runtime agreement with the TypeScript
///      SDK is checked separately in CrossCompat.t.sol.
library WinternitzHarness {
    uint256 internal constant W = 16;
    uint256 internal constant MESSAGE_CHAINS = 64;
    uint256 internal constant CHECKSUM_CHAINS = 3;
    uint256 internal constant CHAINS = 67;

    function digits(bytes32 messageHash) internal pure returns (uint256[CHAINS] memory out) {
        uint256 message = uint256(messageHash);
        uint256 checksum;
        for (uint256 i = 0; i < MESSAGE_CHAINS; i++) {
            uint256 digit = (message >> (252 - 4 * i)) & 0x0f;
            out[i] = digit;
            checksum += W - 1 - digit;
        }
        for (uint256 i = 0; i < CHECKSUM_CHAINS; i++) {
            out[MESSAGE_CHAINS + i] = (checksum >> (4 * (CHECKSUM_CHAINS - 1 - i))) & 0x0f;
        }
    }

    function chain(bytes32 start, uint256 leafIndex, uint256 chainIndex, uint256 from, uint256 to)
        internal
        pure
        returns (bytes32 node)
    {
        node = start;
        for (uint256 step = from; step < to; step++) {
            node = keccak256(abi.encodePacked(node, (leafIndex << 64) | (chainIndex << 32) | step));
        }
    }

    function deriveSecrets(bytes32 masterSeed, uint256 leafIndex)
        internal
        pure
        returns (bytes32[CHAINS] memory secrets)
    {
        bytes32 seed = keccak256(abi.encodePacked(masterSeed, leafIndex));
        for (uint256 i = 0; i < CHAINS; i++) {
            secrets[i] = keccak256(abi.encodePacked(seed, i));
        }
    }

    function publicFromSecret(bytes32[CHAINS] memory secrets, uint256 leafIndex)
        internal
        pure
        returns (bytes32[CHAINS] memory pk)
    {
        for (uint256 i = 0; i < CHAINS; i++) {
            pk[i] = chain(secrets[i], leafIndex, i, 0, W - 1);
        }
    }

    function leafCommit(bytes32[CHAINS] memory pk) internal pure returns (bytes32) {
        return keccak256(abi.encode(pk));
    }

    function signOneTime(bytes32 messageHash, bytes32[CHAINS] memory secrets, uint256 leafIndex)
        internal
        pure
        returns (bytes32[CHAINS] memory sig)
    {
        uint256[CHAINS] memory d = digits(messageHash);
        for (uint256 i = 0; i < CHAINS; i++) {
            sig[i] = chain(secrets[i], leafIndex, i, 0, d[i]);
        }
    }
}
