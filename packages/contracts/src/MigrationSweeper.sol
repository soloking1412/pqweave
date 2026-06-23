// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20, IERC721, IERC1155} from "./interfaces/tokens.sol";

/// @notice Batched, approval-based asset sweep from a quantum-exposed wallet to
///         a post-quantum-safe destination in a single transaction.
/// @dev The caller is the asset holder. ERC-20s and approvals must be granted to
///      this contract beforehand; native value is moved by the holder directly.
contract MigrationSweeper {
    struct Erc20Sweep {
        address token;
        // Amount to move, or 0 to sweep the full balance.
        uint256 amount;
    }

    struct Erc721Sweep {
        address token;
        uint256 tokenId;
    }

    struct Erc1155Sweep {
        address token;
        uint256 id;
        uint256 amount;
    }

    event Swept(address indexed from, address indexed to);

    error TransferFailed(address token);

    function sweep(
        address to,
        Erc20Sweep[] calldata erc20s,
        Erc721Sweep[] calldata erc721s,
        Erc1155Sweep[] calldata erc1155s
    ) external {
        address from = msg.sender;

        for (uint256 i = 0; i < erc20s.length; i++) {
            uint256 amount = erc20s[i].amount;
            if (amount == 0) amount = IERC20(erc20s[i].token).balanceOf(from);
            if (amount > 0) _erc20TransferFrom(erc20s[i].token, from, to, amount);
        }

        for (uint256 i = 0; i < erc721s.length; i++) {
            IERC721(erc721s[i].token).transferFrom(from, to, erc721s[i].tokenId);
        }

        for (uint256 i = 0; i < erc1155s.length; i++) {
            IERC1155(erc1155s[i].token)
                .safeTransferFrom(from, to, erc1155s[i].id, erc1155s[i].amount, "");
        }

        emit Swept(from, to);
    }

    function _erc20TransferFrom(address token, address from, address to, uint256 amount) private {
        (bool ok, bytes memory ret) =
            token.call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed(token);
    }
}
