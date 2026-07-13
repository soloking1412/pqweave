// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PQWeaveAccount} from "./PQWeaveAccount.sol";
import {IPQCVerifier} from "./interfaces/IPQCVerifier.sol";

/// @notice Deterministic (CREATE2) factory for PQWeave accounts.
/// @dev The deployment salt is bound to the initialization parameters, so an
///      account address can only ever be created with the owner and keys it was
///      derived from.
contract PQWeaveFactory {
    address public immutable entryPoint;

    event AccountCreated(address indexed account, address indexed owner);

    constructor(address entryPoint_) {
        entryPoint = entryPoint_;
    }

    function createAccount(
        address owner,
        bytes calldata pqcPublicKey,
        IPQCVerifier verifier,
        uint256 valueThreshold,
        bytes32 salt
    ) external returns (PQWeaveAccount account) {
        bytes32 deploySalt = _deploySalt(owner, pqcPublicKey, verifier, valueThreshold, salt);
        address predicted = _addressOf(deploySalt);
        if (predicted.code.length > 0) {
            return PQWeaveAccount(payable(predicted));
        }
        account = new PQWeaveAccount{salt: deploySalt}(entryPoint);
        account.initialize(owner, pqcPublicKey, verifier, valueThreshold);
        emit AccountCreated(address(account), owner);
    }

    function getAddress(
        address owner,
        bytes calldata pqcPublicKey,
        IPQCVerifier verifier,
        uint256 valueThreshold,
        bytes32 salt
    ) external view returns (address) {
        return _addressOf(_deploySalt(owner, pqcPublicKey, verifier, valueThreshold, salt));
    }

    function _deploySalt(
        address owner,
        bytes calldata pqcPublicKey,
        IPQCVerifier verifier,
        uint256 valueThreshold,
        bytes32 salt
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(owner, pqcPublicKey, verifier, valueThreshold, salt));
    }

    function _addressOf(bytes32 deploySalt) internal view returns (address) {
        bytes32 initCodeHash =
            keccak256(abi.encodePacked(type(PQWeaveAccount).creationCode, abi.encode(entryPoint)));
        bytes32 hash =
            keccak256(abi.encodePacked(bytes1(0xff), address(this), deploySalt, initCodeHash));
        return address(uint160(uint256(hash)));
    }
}
