// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PayFiEscrow} from "../contracts/PayFiEscrow.sol";
import {ESpaceEscrowAdapter} from "../contracts/ESpaceEscrowAdapter.sol";
import {MockERC20} from "../contracts/mocks/MockERC20.sol";

contract CrossSpaceAdapterTest is Test {
    ESpaceEscrowAdapter internal adapter;
    PayFiEscrow internal escrow;
    MockERC20 internal token;

    address internal admin = makeAddr("admin");
    address internal relayer = makeAddr("relayer");
    address internal buyer = makeAddr("buyer");
    address internal seller = makeAddr("seller");
    uint256 internal constant CORE_ORDER_ID = 42;
    bytes32 internal constant AGREEMENT = bytes32(uint256(0x1234));

    function setUp() public {
        vm.prank(admin);
        adapter = new ESpaceEscrowAdapter(admin);

        escrow = new PayFiEscrow(address(adapter));
        token = new MockERC20("Mock USDT", "mUSDT");

        vm.startPrank(admin);
        adapter.setEscrow(address(escrow));
        adapter.setRelayer(relayer, true);
        vm.stopPrank();

        token.mint(relayer, 1_000_000_000);
    }

    function test_relayer_maps_core_order_to_escrow() public {
        vm.startPrank(relayer);
        token.approve(address(adapter), type(uint256).max);
        uint256 mappedEscrowId = adapter.createEscrowFromCore(
            CORE_ORDER_ID,
            buyer,
            seller,
            token,
            1_000_000,
            100_000,
            10,
            uint64(block.timestamp + 30 days),
            AGREEMENT,
            address(0)
        );
        vm.stopPrank();

        assertTrue(adapter.processedOrderId(CORE_ORDER_ID));
        assertEq(adapter.escrowIdByCoreOrderId(CORE_ORDER_ID), mappedEscrowId);
        assertEq(token.balanceOf(address(escrow)), 1_000_000);
        assertEq(escrow.nextEscrowId(), 0);
    }

    function test_replay_same_core_order_reverts() public {
        vm.startPrank(relayer);
        token.approve(address(adapter), type(uint256).max);
        adapter.createEscrowFromCore(
            CORE_ORDER_ID,
            buyer,
            seller,
            token,
            1_000_000,
            100_000,
            10,
            uint64(block.timestamp + 30 days),
            AGREEMENT,
            address(0)
        );

        vm.expectRevert(bytes("processed"));
        adapter.createEscrowFromCore(
            CORE_ORDER_ID,
            buyer,
            seller,
            token,
            1_000_000,
            100_000,
            10,
            uint64(block.timestamp + 30 days),
            AGREEMENT,
            address(0)
        );
        vm.stopPrank();
    }

    function test_non_relayer_reverts() public {
        vm.prank(buyer);
        vm.expectRevert(ESpaceEscrowAdapter.NotRelayer.selector);
        adapter.createEscrowFromCore(
            CORE_ORDER_ID,
            buyer,
            seller,
            token,
            1_000_000,
            100_000,
            10,
            uint64(block.timestamp + 30 days),
            AGREEMENT,
            address(0)
        );
    }
}

