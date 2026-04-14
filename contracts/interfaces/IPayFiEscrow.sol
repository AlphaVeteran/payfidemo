// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPayFiEscrow {
    function registerDeposit(
        uint256 escrowId,
        address user_,
        address merchant_,
        IERC20 asset_,
        uint128 amountTotal_,
        uint128 amountPerLesson_,
        uint16 maxReleases_,
        uint64 expiresAt_,
        bytes32 agreementHash_,
        address disputeModule_
    ) external;
}

