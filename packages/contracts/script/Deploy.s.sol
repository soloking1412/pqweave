// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {LamportMerkleVerifier} from "../src/verifiers/LamportMerkleVerifier.sol";
import {PQWeaveFactory} from "../src/PQWeaveFactory.sol";
import {MigrationSweeper} from "../src/MigrationSweeper.sol";
import {BatchExecutor} from "../src/BatchExecutor.sol";

/// @notice Deploys the shared PQWeave infrastructure with CREATE2 so every
///         contract lands at the SAME address on every EVM chain. These are
///         canonical, shared by all users and partners — deploy once per chain.
/// @dev Uses the standard deterministic CREATE2 deployer (0x4e59…), present on
///      all major chains. The factory's address is identical across chains
///      because the EntryPoint it is constructed with is the same canonical
///      address everywhere. Set DEPLOYER_PRIVATE_KEY; ENTRYPOINT defaults to the
///      canonical ERC-4337 v0.7 EntryPoint.
contract Deploy is Script {
    address internal constant DEFAULT_ENTRYPOINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;
    bytes32 internal constant SALT = keccak256("pqweave.v1");

    function run() external {
        address entryPoint = vm.envOr("ENTRYPOINT", DEFAULT_ENTRYPOINT);
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerKey);
        LamportMerkleVerifier verifier = new LamportMerkleVerifier{salt: SALT}();
        PQWeaveFactory factory = new PQWeaveFactory{salt: SALT}(entryPoint);
        MigrationSweeper sweeper = new MigrationSweeper{salt: SALT}();
        BatchExecutor executor = new BatchExecutor{salt: SALT}();
        vm.stopBroadcast();

        console2.log("Chain id:           ", block.chainid);
        console2.log("EntryPoint:         ", entryPoint);
        console2.log("LamportVerifier:    ", address(verifier));
        console2.log("PQWeaveFactory:", address(factory));
        console2.log("MigrationSweeper:   ", address(sweeper));
        console2.log("BatchExecutor:      ", address(executor));
    }
}
