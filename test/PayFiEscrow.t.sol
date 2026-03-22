// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PayFiEscrow} from "../contracts/PayFiEscrow.sol";
import {MockERC20} from "../contracts/mocks/MockERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract PayFiEscrowTest is Test {
    PayFiEscrow internal escrow;
    MockERC20 internal token;

    address internal user;
    uint256 internal userPk;
    address internal merchant;
    uint256 internal merchantPk;

    uint256 internal escrowId;
    bytes32 internal constant AGREEMENT = bytes32(uint256(0xabc));

    function setUp() public {
        escrow = new PayFiEscrow();
        token = new MockERC20("Mock USDC", "mUSDC");

        (user, userPk) = makeAddrAndKey("user");
        (merchant, merchantPk) = makeAddrAndKey("merchant");

        uint128 total = 1000e18;
        uint128 perLesson = 100e18;
        uint16 maxR = 10;

        token.mint(user, total);

        vm.startPrank(user);
        token.approve(address(escrow), type(uint256).max);
        escrowId = escrow.createAndDeposit(
            merchant,
            IERC20(address(token)),
            total,
            perLesson,
            maxR,
            uint64(30 days),
            AGREEMENT,
            address(0)
        );
        vm.stopPrank();
    }

    function test_create_holds_funds() public view {
        assertEq(token.balanceOf(address(escrow)), 1000e18);
        assertEq(escrow.nextEscrowId(), 1);
    }

    function test_release_dual_sig_transfers_to_merchant() public {
        uint256 amount = 100e18;
        bytes32 digest = escrow.releaseDigest(escrowId, amount);

        (uint8 v0, bytes32 r0, bytes32 s0) = vm.sign(userPk, digest);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(merchantPk, digest);
        bytes memory userSig = abi.encodePacked(r0, s0, v0);
        bytes memory merchantSig = abi.encodePacked(r1, s1, v1);

        escrow.releaseBySignatures(escrowId, amount, userSig, merchantSig);

        assertEq(token.balanceOf(merchant), 100e18);
        assertEq(token.balanceOf(address(escrow)), 900e18);
    }

    function test_replay_same_nonce_reverts() public {
        uint256 amount = 100e18;
        bytes32 d1 = escrow.releaseDigest(escrowId, amount);
        (uint8 v0, bytes32 r0, bytes32 s0) = vm.sign(userPk, d1);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(merchantPk, d1);
        bytes memory us = abi.encodePacked(r0, s0, v0);
        bytes memory ms = abi.encodePacked(r1, s1, v1);
        escrow.releaseBySignatures(escrowId, amount, us, ms);

        vm.expectRevert();
        escrow.releaseBySignatures(escrowId, amount, us, ms);
    }

    function test_refund_after_expiry() public {
        vm.warp(block.timestamp + 31 days);
        escrow.refund(escrowId);
        assertEq(token.balanceOf(user), 1000e18);
    }
}
