// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Circuit-breaker policy: classifies which operations require a
///         post-quantum signature in addition to the ECDSA signature.
/// @dev The rules are deliberately simple and auditable. An operation requires a
///      post-quantum signature when any of the following hold:
///        - it moves native value at or above the configured threshold;
///        - it grants token spending power (`approve` / `setApprovalForAll`);
///        - it targets the account itself (administrative changes such as
///          rotating the post-quantum key or swapping the verifier).
library QuantumPolicy {
    // ERC-20 approve(address,uint256)
    bytes4 internal constant APPROVE = 0x095ea7b3;
    // ERC-721/1155 setApprovalForAll(address,bool)
    bytes4 internal constant SET_APPROVAL_FOR_ALL = 0xa22cb465;

    function requiresPqc(
        uint256 valueThreshold,
        address account,
        address dest,
        uint256 value,
        bytes memory data
    ) internal pure returns (bool) {
        if (value >= valueThreshold) return true;
        if (dest == account) return true;

        if (data.length >= 4) {
            bytes4 selector;
            assembly {
                selector := mload(add(data, 0x20))
            }
            if (selector == APPROVE || selector == SET_APPROVAL_FOR_ALL) return true;
        }
        return false;
    }
}
