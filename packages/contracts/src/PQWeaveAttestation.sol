// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title PQWeaveAttestation
/// @notice An open, on-chain registry binding a Bitcoin address to a PQWeave
///         post-quantum (Lamport+Merkle) key. The user signs a binding message
///         with their Bitcoin wallet off-chain; this contract anchors that
///         binding with an immutable, timestamped event that anyone can read and
///         verify. It is deliberately minimal: the Bitcoin signature is verified
///         off-chain (BIP-322 verification on-chain is infeasible and expensive),
///         so the contract's job is public, permanent timestamping — not
///         signature checking, and not making the Bitcoin address quantum-safe.
/// @dev Deployed with CREATE2 to the same address on every chain, like the rest
///      of the PQWeave infrastructure.
contract PQWeaveAttestation {
    /// @notice Unix timestamp of the most recent attestation for a PQC root.
    mapping(bytes32 => uint64) public attestedAt;

    event Attested(
        address indexed signer,
        bytes32 indexed pqcRoot,
        string btcAddress,
        bytes btcSignature,
        uint64 timestamp
    );

    error InvalidRoot();
    error EmptyAddress();

    /// @notice Anchor a Bitcoin-address ↔ post-quantum-key binding.
    /// @param pqcRoot       32-byte Merkle root of the post-quantum key.
    /// @param btcAddress    The Bitcoin address being bound.
    /// @param btcSignature  The Bitcoin wallet's signature over the binding
    ///                      message (BIP-322 or legacy). Stored for public
    ///                      off-chain verification; not checked here.
    function attest(bytes32 pqcRoot, string calldata btcAddress, bytes calldata btcSignature)
        external
    {
        if (pqcRoot == bytes32(0)) revert InvalidRoot();
        if (bytes(btcAddress).length == 0) revert EmptyAddress();
        attestedAt[pqcRoot] = uint64(block.timestamp);
        emit Attested(msg.sender, pqcRoot, btcAddress, btcSignature, uint64(block.timestamp));
    }
}
