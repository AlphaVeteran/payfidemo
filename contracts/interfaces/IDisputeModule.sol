// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice 争议模块占位；MVP 不接入，release 前可扩展校验
interface IDisputeModule {
    function canRelease(uint256 escrowId) external view returns (bool);
}
