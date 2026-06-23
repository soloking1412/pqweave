// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {LamportMerkleVerifier} from "../src/verifiers/LamportMerkleVerifier.sol";

/// @notice Proves the on-chain verifier accepts a signature produced by the
///         TypeScript SDK. The vector in test/vectors/hashsig.json is generated
///         by the SDK (see the package's vector generation step).
contract CrossCompatTest is Test {
    using stdJson for string;

    function test_acceptsSdkGeneratedSignature() public {
        string memory json =
            vm.readFile(string.concat(vm.projectRoot(), "/test/vectors/hashsig.json"));
        bytes32 root = json.readBytes32(".root");
        bytes32 message = json.readBytes32(".message");
        bytes memory signature = json.readBytes(".signature");

        LamportMerkleVerifier verifier = new LamportMerkleVerifier();
        assertTrue(verifier.verify(message, abi.encodePacked(root), signature));
    }
}
