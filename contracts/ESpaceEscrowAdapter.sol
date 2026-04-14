// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPayFiEscrow} from "./interfaces/IPayFiEscrow.sol";

/// @title ESpaceEscrowAdapter
/// @notice Relayer-only adapter that maps Core events to PayFiEscrow.registerDeposit.
contract ESpaceEscrowAdapter is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IPayFiEscrow public escrow;

    mapping(address => bool) public isRelayer;
    mapping(uint256 => bool) public processedOrderId;
    mapping(uint256 => uint256) public escrowIdByCoreOrderId;

    event RelayerUpdated(address indexed relayer, bool allowed);
    event CoreOrderMapped(uint256 indexed coreOrderId, uint256 indexed escrowId);

    error NotRelayer();

    modifier onlyRelayer() {
        if (!isRelayer[msg.sender]) revert NotRelayer();
        _;
    }

    constructor(address owner_) Ownable(owner_) {}

    function setEscrow(address escrow_) external onlyOwner {
        require(escrow_ != address(0), "escrow");
        escrow = IPayFiEscrow(escrow_);
    }

    function setRelayer(address relayer, bool allowed) external onlyOwner {
        require(relayer != address(0), "relayer");
        isRelayer[relayer] = allowed;
        emit RelayerUpdated(relayer, allowed);
    }

    function createEscrowFromCore(
        uint256 coreOrderId,
        address buyer,
        address seller,
        IERC20 asset,
        uint128 amountTotal,
        uint128 amountPerLesson,
        uint16 maxReleases,
        uint64 expiresAt,
        bytes32 agreementHash,
        address disputeModule
    ) external onlyRelayer nonReentrant returns (uint256 escrowId) {
        require(address(escrow) != address(0), "escrowUnset");
        require(coreOrderId != 0, "orderId");
        require(!processedOrderId[coreOrderId], "processed");
        require(buyer != address(0), "buyer");
        require(seller != address(0), "seller");
        require(address(asset) != address(0), "asset");
        require(amountTotal > 0 && amountPerLesson > 0, "amounts");
        require(maxReleases > 0, "maxReleases");
        require(
            uint256(maxReleases) * uint256(amountPerLesson) == uint256(amountTotal), "totalMismatch"
        );
        require(expiresAt > block.timestamp, "expires");

        // Relayer moves settlement funds to adapter first, then adapter forwards to escrow.
        asset.safeTransferFrom(msg.sender, address(this), amountTotal);
        asset.safeTransfer(address(escrow), amountTotal);

        escrowId = uint256(keccak256(abi.encodePacked(block.chainid, address(this), coreOrderId)));
        escrow.registerDeposit(
            escrowId,
            buyer,
            seller,
            asset,
            amountTotal,
            amountPerLesson,
            maxReleases,
            expiresAt,
            agreementHash,
            disputeModule
        );

        processedOrderId[coreOrderId] = true;
        escrowIdByCoreOrderId[coreOrderId] = escrowId;

        emit CoreOrderMapped(coreOrderId, escrowId);
    }
}

