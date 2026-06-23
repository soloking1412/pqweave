// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Minimal ECDSA recovery with low-s malleability protection.
library ECDSA {
    /// @dev Returns the signer of `hash` for a 65-byte `signature`, or address(0) on failure.
    function recover(bytes32 hash, bytes memory signature) internal pure returns (address) {
        if (signature.length != 65) return address(0);

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 0x20))
            s := mload(add(signature, 0x40))
            v := byte(0, mload(add(signature, 0x60)))
        }

        // Reject the upper half of the curve order to prevent signature malleability.
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            return address(0);
        }
        if (v != 27 && v != 28) return address(0);

        return ecrecover(hash, v, r, s);
    }
}
