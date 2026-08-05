// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {LamportMerkleVerifier} from "../src/verifiers/LamportMerkleVerifier.sol";
import {WinternitzMerkleVerifier} from "../src/verifiers/WinternitzMerkleVerifier.sol";
import {PQWeaveAccount} from "../src/PQWeaveAccount.sol";
import {PQWeaveFactory} from "../src/PQWeaveFactory.sol";
import {PQWeaveForwarder} from "../src/PQWeaveForwarder.sol";
import {PQWeaveAttestation} from "../src/PQWeaveAttestation.sol";
import {MigrationSweeper} from "../src/MigrationSweeper.sol";
import {BatchExecutor} from "../src/BatchExecutor.sol";

/// @notice Deploys the shared PQWeave infrastructure with CREATE2 so every
///         contract lands at the SAME address on every EVM chain. These are
///         canonical, shared by all users and partners — deploy once per chain.
/// @dev Uses the standard deterministic CREATE2 deployer (0x4e59…), present on
///      all major chains, which is what forge's `new{salt}` routes through and
///      what `vm.computeCreate2Address(salt, initCodeHash)` assumes. The deploy
///      is idempotent: a contract whose bytecode is unchanged already exists at
///      its deterministic address, so we skip it instead of reverting with a
///      CREATE2 collision. Re-running after a partial change (e.g. only
///      PQWeaveAccount + the new Forwarder/Attestation) is therefore safe.
///      Set DEPLOYER_PRIVATE_KEY; ENTRYPOINT defaults to the canonical
///      ERC-4337 v0.7 EntryPoint.
contract Deploy is Script {
    address internal constant DEFAULT_ENTRYPOINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;
    bytes32 internal constant SALT = keccak256("pqweave.v1");

    function _predict(bytes32 initCodeHash) internal view returns (address) {
        return vm.computeCreate2Address(SALT, initCodeHash);
    }

    function run() external {
        address entryPoint = vm.envOr("ENTRYPOINT", DEFAULT_ENTRYPOINT);
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        // Predict every address up front (pure, no broadcast needed).
        address verifierAddr = _predict(keccak256(type(LamportMerkleVerifier).creationCode));
        address winternitzAddr = _predict(keccak256(type(WinternitzMerkleVerifier).creationCode));
        address factoryAddr = _predict(
            keccak256(abi.encodePacked(type(PQWeaveFactory).creationCode, abi.encode(entryPoint)))
        );
        address sweeperAddr = _predict(keccak256(type(MigrationSweeper).creationCode));
        address executorAddr = _predict(keccak256(type(BatchExecutor).creationCode));
        address forwarderAddr = _predict(keccak256(type(PQWeaveForwarder).creationCode));
        address accountAddr = _predict(
            keccak256(abi.encodePacked(type(PQWeaveAccount).creationCode, abi.encode(entryPoint)))
        );
        address attestationAddr = _predict(keccak256(type(PQWeaveAttestation).creationCode));

        vm.startBroadcast(deployerKey);
        if (verifierAddr.code.length == 0) new LamportMerkleVerifier{salt: SALT}();
        if (winternitzAddr.code.length == 0) new WinternitzMerkleVerifier{salt: SALT}();
        if (factoryAddr.code.length == 0) new PQWeaveFactory{salt: SALT}(entryPoint);
        if (sweeperAddr.code.length == 0) new MigrationSweeper{salt: SALT}();
        if (executorAddr.code.length == 0) new BatchExecutor{salt: SALT}();
        if (forwarderAddr.code.length == 0) new PQWeaveForwarder{salt: SALT}();
        if (accountAddr.code.length == 0) new PQWeaveAccount{salt: SALT}(entryPoint);
        if (attestationAddr.code.length == 0) new PQWeaveAttestation{salt: SALT}();
        vm.stopBroadcast();

        console2.log("Chain id:           ", block.chainid);
        console2.log("EntryPoint:         ", entryPoint);
        console2.log("LamportVerifier:    ", verifierAddr);
        console2.log("WinternitzVerifier: ", winternitzAddr);
        console2.log("PQWeaveFactory:", factoryAddr);
        console2.log("MigrationSweeper:   ", sweeperAddr);
        console2.log("BatchExecutor:      ", executorAddr);
        console2.log("PQWeaveForwarder:   ", forwarderAddr);
        console2.log("PQWeaveAccountImpl: ", accountAddr);
        console2.log("PQWeaveAttestation: ", attestationAddr);

        // Persist the canonical (deterministic) addresses so the web-env writer
        // has all of them even when some were skipped as already-deployed.
        string memory k = "pqweave";
        vm.serializeAddress(k, "verifier", verifierAddr);
        vm.serializeAddress(k, "winternitzVerifier", winternitzAddr);
        vm.serializeAddress(k, "factory", factoryAddr);
        vm.serializeAddress(k, "sweeper", sweeperAddr);
        vm.serializeAddress(k, "batchExecutor", executorAddr);
        vm.serializeAddress(k, "forwarder", forwarderAddr);
        vm.serializeAddress(k, "accountImpl", accountAddr);
        string memory json = vm.serializeAddress(k, "attestation", attestationAddr);
        vm.writeJson(json, string.concat("./deployments/", vm.toString(block.chainid), ".json"));
    }
}
