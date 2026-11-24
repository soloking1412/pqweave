// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {LamportMerkleVerifier} from "../src/verifiers/LamportMerkleVerifier.sol";

/// @notice Verify CREATE2 prediction against deployment of the current hardened bytecode.
contract DeployPredictTest is Test {
    bytes32 internal constant SALT = keccak256("pqweave.v1");

    function test_predictedVerifierMatchesDeployment() public {
        address predicted = vm.computeCreate2Address(
            SALT, keccak256(type(LamportMerkleVerifier).creationCode), address(this)
        );
        LamportMerkleVerifier deployed = new LamportMerkleVerifier{salt: SALT}();
        assertEq(predicted, address(deployed), "CREATE2 prediction must match current bytecode");
        assertGt(predicted.code.length, 0);
    }
}
