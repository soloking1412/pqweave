// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Canonical ABI encoding and tree bounds shared by the custom verifiers.
/// Checking before abi.decode prevents malformed lengths/offsets allocating memory.
library HashSigEncoding {
    uint256 internal constant MAX_DEPTH = 12; // At most 4096 one-time keys per root.

    function valid(bytes calldata signature, uint256 headWords) internal pure returns (bool) {
        if (signature.length < (headWords + 1) * 32) return false;
        uint256 index;
        uint256 offset;
        uint256 depth;
        assembly ("memory-safe") {
            index := calldataload(signature.offset)
            offset := calldataload(add(signature.offset, mul(sub(headWords, 1), 32)))
            depth := calldataload(add(signature.offset, mul(headWords, 32)))
        }
        if (offset != headWords * 32 || depth > MAX_DEPTH) return false;
        return signature.length == (headWords + 1 + depth) * 32 && index < (uint256(1) << depth);
    }
}
