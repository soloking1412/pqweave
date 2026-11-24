// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Circuit-breaker policy: classifies which operations require a
///         post-quantum signature in addition to the ECDSA signature.
/// @dev The rules are deliberately simple and auditable. An operation requires a
///      post-quantum signature when any of the following hold:
///        - it moves native value at or above the configured threshold;
///        - it includes any calldata, including token transfers and approvals;
///        - it targets the account itself (administrative changes such as
///          rotating the post-quantum key or swapping the verifier).
library QuantumPolicy {
    function requiresPqc(
        uint256 valueThreshold,
        address account,
        address dest,
        uint256 value,
        bytes memory data
    ) internal view returns (bool) {
        if (value >= valueThreshold) return true;
        if (dest == account) return true;

        // Unknown selectors can transfer assets or grant authority indirectly.
        // Empty-data calls to contracts can also execute receive/fallback code.
        return data.length != 0 || dest.code.length != 0;
    }
}
