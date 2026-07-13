// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {LamportMerkleVerifier} from "../src/verifiers/LamportMerkleVerifier.sol";

/// @notice Guards the idempotent Deploy script: proves that the address
///         `vm.computeCreate2Address(salt, initCodeHash)` predicts is the same
///         one forge's `new{salt}` actually deploys to. Ground truth is the
///         LamportMerkleVerifier already live on Base Sepolia (unchanged
///         bytecode), whose address surfaced in a CREATE2 collision.
contract DeployPredictTest is Test {
    bytes32 internal constant SALT = keccak256("pqweave.v1");
    address internal constant KNOWN_VERIFIER = 0x77433e098c56CfbE35D1b8ab0d61Ea82Fa59359F;

    function test_predictedVerifierMatchesOnChain() public view {
        address predicted =
            vm.computeCreate2Address(SALT, keccak256(type(LamportMerkleVerifier).creationCode));
        assertEq(predicted, KNOWN_VERIFIER, "CREATE2 prediction must match the deployed verifier");
    }
}
