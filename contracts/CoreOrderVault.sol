// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CoreOrderVault
/// @notice Core Space side vault for deposit intent events.
contract CoreOrderVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Order {
        address buyer;
        address seller;
        IERC20 asset;
        uint128 amount;
        uint128 amountPerLesson;
        uint16 maxReleases;
        uint64 durationSeconds;
        bytes32 agreementHash;
        address disputeModule;
        uint64 createdAt;
        bool deposited;
    }

    mapping(uint256 => Order) public orders;

    event OrderDeposited(
        uint256 indexed orderId,
        address indexed buyer,
        address indexed seller,
        address asset,
        uint256 amount,
        uint256 timestamp,
        uint256 amountPerLesson,
        uint256 maxReleases,
        uint256 durationSeconds,
        bytes32 agreementHash,
        address disputeModule
    );

    function placeOrderDeposit(uint256 orderId, address seller, IERC20 asset, uint128 amount)
        external
        nonReentrant
    {
        _placeOrderDeposit(
            orderId, seller, asset, amount, amount, 1, 30 days, bytes32(0), address(0)
        );
    }

    function placeOrderDeposit(
        uint256 orderId,
        address seller,
        IERC20 asset,
        uint128 amount,
        uint128 amountPerLesson,
        uint16 maxReleases,
        uint64 durationSeconds,
        bytes32 agreementHash,
        address disputeModule
    ) external nonReentrant {
        _placeOrderDeposit(
            orderId,
            seller,
            asset,
            amount,
            amountPerLesson,
            maxReleases,
            durationSeconds,
            agreementHash,
            disputeModule
        );
    }

    function _placeOrderDeposit(
        uint256 orderId,
        address seller,
        IERC20 asset,
        uint128 amount,
        uint128 amountPerLesson,
        uint16 maxReleases,
        uint64 durationSeconds,
        bytes32 agreementHash,
        address disputeModule
    ) internal {
        require(orderId != 0, "orderId");
        require(seller != address(0), "seller");
        require(address(asset) != address(0), "asset");
        require(amount > 0, "amount");
        require(amountPerLesson > 0, "perLesson");
        require(maxReleases > 0, "maxReleases");
        require(uint256(maxReleases) * uint256(amountPerLesson) == uint256(amount), "totalMismatch");
        require(durationSeconds > 0, "duration");
        require(!orders[orderId].deposited, "exists");

        asset.safeTransferFrom(msg.sender, address(this), amount);

        orders[orderId] = Order({
            buyer: msg.sender,
            seller: seller,
            asset: asset,
            amount: amount,
            amountPerLesson: amountPerLesson,
            maxReleases: maxReleases,
            durationSeconds: durationSeconds,
            agreementHash: agreementHash,
            disputeModule: disputeModule,
            createdAt: uint64(block.timestamp),
            deposited: true
        });

        emit OrderDeposited(
            orderId,
            msg.sender,
            seller,
            address(asset),
            amount,
            block.timestamp,
            amountPerLesson,
            maxReleases,
            durationSeconds,
            agreementHash,
            disputeModule
        );
    }
}

