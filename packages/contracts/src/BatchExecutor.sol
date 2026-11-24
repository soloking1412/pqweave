// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "./interfaces/tokens.sol";

/// @title BatchExecutor
/// @notice Minimal batch-call executor used as an EIP-7702 delegation target so
///         an existing EOA can sweep its entire balance — native, ERC-20, and
///         NFTs — into a quantum-safe account in a single transaction.
/// @dev The EOA signs one 7702 transaction that (1) delegates to this contract
///      and (2) calls `executeBatch`. Because the call originates from the EOA,
///      `msg.sender == address(this)`, so the self-only guard passes. This is a
///      transient migration tool: once the sweep completes the EOA is empty and
///      can revoke the delegation. It is the same address on every chain.
contract BatchExecutor {
    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    error NotSelf();
    error CallFailed(uint256 index, bytes returnData);
    error TokenTransferFailed(uint256 index);

    event BatchExecuted(uint256 count);

    function executeBatch(Call[] calldata calls) external {
        if (msg.sender != address(this)) revert NotSelf();
        for (uint256 i = 0; i < calls.length; i++) {
            (bool ok, bytes memory ret) = calls[i].target.call{value: calls[i].value}(calls[i].data);
            if (!ok) revert CallFailed(i, ret);
            // Some ERC-20s signal failure by returning false without reverting.
            // A successful low-level call is not proof that the sweep moved tokens.
            if (
                calls[i].data.length >= 4 && bytes4(calls[i].data[:4]) == IERC20.transfer.selector
                    && (calls[i].target.code.length == 0
                        || (ret.length != 0 && (ret.length != 32 || !abi.decode(ret, (bool)))))
            ) revert TokenTransferFailed(i);
        }
        emit BatchExecuted(calls.length);
    }
}
