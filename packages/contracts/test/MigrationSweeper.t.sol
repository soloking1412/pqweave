// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MigrationSweeper} from "../src/MigrationSweeper.sol";
import {MockERC20, MockERC721} from "./utils/Mocks.sol";

contract MigrationSweeperTest is Test {
    MigrationSweeper internal sweeper;
    MockERC20 internal token;
    MockERC721 internal nft;

    address internal holder = makeAddr("holder");
    address internal safeAccount = makeAddr("safeAccount");

    function setUp() public {
        sweeper = new MigrationSweeper();
        token = new MockERC20();
        nft = new MockERC721();
    }

    function test_sweepsFullErc20BalanceAndNft() public {
        token.mint(holder, 1_000 ether);
        nft.mint(holder, 42);

        vm.startPrank(holder);
        token.approve(address(sweeper), type(uint256).max);

        MigrationSweeper.Erc20Sweep[] memory erc20s = new MigrationSweeper.Erc20Sweep[](1);
        erc20s[0] = MigrationSweeper.Erc20Sweep({token: address(token), amount: 0});

        MigrationSweeper.Erc721Sweep[] memory erc721s = new MigrationSweeper.Erc721Sweep[](1);
        erc721s[0] = MigrationSweeper.Erc721Sweep({token: address(nft), tokenId: 42});

        sweeper.sweep(safeAccount, erc20s, erc721s, new MigrationSweeper.Erc1155Sweep[](0));
        vm.stopPrank();

        assertEq(token.balanceOf(holder), 0);
        assertEq(token.balanceOf(safeAccount), 1_000 ether);
        assertEq(nft.ownerOf(42), safeAccount);
    }

    function test_sweepsExactErc20Amount() public {
        token.mint(holder, 1_000 ether);

        vm.startPrank(holder);
        token.approve(address(sweeper), type(uint256).max);

        MigrationSweeper.Erc20Sweep[] memory erc20s = new MigrationSweeper.Erc20Sweep[](1);
        erc20s[0] = MigrationSweeper.Erc20Sweep({token: address(token), amount: 250 ether});

        sweeper.sweep(
            safeAccount,
            erc20s,
            new MigrationSweeper.Erc721Sweep[](0),
            new MigrationSweeper.Erc1155Sweep[](0)
        );
        vm.stopPrank();

        assertEq(token.balanceOf(holder), 750 ether);
        assertEq(token.balanceOf(safeAccount), 250 ether);
    }
}
