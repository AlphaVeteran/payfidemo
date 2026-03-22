// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PayFiEscrow} from "../contracts/PayFiEscrow.sol";
import {MockERC20} from "../contracts/mocks/MockERC20.sol";

/// @notice 在本地 Anvil 上部署 MockERC20 + PayFiEscrow，并向默认账户 #0 铸币。不自动 createAndDeposit（由你按意图用 cast 或钱包发起）。
/// forge script script/LocalAnvilBootstrap.s.sol:LocalAnvilBootstrap --rpc-url http://127.0.0.1:8545 --broadcast
contract LocalAnvilBootstrap is Script {
    function run() external {
        // 使用 CLI：`--private-key <anvil_default_0>`，见 README
        vm.startBroadcast();
        MockERC20 token = new MockERC20("Mock USDC", "mUSDC");
        PayFiEscrow escrow = new PayFiEscrow();
        address deployer = msg.sender;
        token.mint(deployer, 10_000 ether);
        vm.stopBroadcast();

        console2.log("CHAIN: anvil / 31337");
        console2.log("PayFiEscrow:", address(escrow));
        console2.log("MockERC20:", address(token));
        console2.log("Minted deployer:", deployer);
    }
}
