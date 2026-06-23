// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Pluggable post-quantum signature verifier.
/// @dev Implementations verify a post-quantum signature over `messageHash`. The
///      default implementation is hash-based (Lamport + Merkle); lattice schemes
///      such as ETHFALCON or ETHDILITHIUM can implement the same interface.
interface IPQCVerifier {
    /// @return A stable identifier for the verification scheme.
    function scheme() external pure returns (bytes32);

    /// @param messageHash The 32-byte digest that was signed.
    /// @param publicKey    The signer's public key (encoding is scheme-specific).
    /// @param signature    The post-quantum signature (encoding is scheme-specific).
    function verify(bytes32 messageHash, bytes calldata publicKey, bytes calldata signature)
        external
        view
        returns (bool);
}
