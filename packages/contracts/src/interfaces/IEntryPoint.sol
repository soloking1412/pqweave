// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PackedUserOperation} from "./IAccount.sol";

/// @notice Minimal view of the ERC-4337 EntryPoint (v0.7) used to drive and test
///         PQWeave accounts. The canonical EntryPoint is deployed at
///         0x0000000071727De22E5E9d8BAf0edAc6f37da032 on every supported chain.
interface IEntryPoint {
    function handleOps(PackedUserOperation[] calldata ops, address payable beneficiary) external;
    function getNonce(address sender, uint192 key) external view returns (uint256);
    function getUserOpHash(PackedUserOperation calldata userOp) external view returns (bytes32);
    function depositTo(address account) external payable;
    function balanceOf(address account) external view returns (uint256);
}
