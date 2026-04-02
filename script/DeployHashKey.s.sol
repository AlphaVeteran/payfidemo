// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PayFiEscrow} from "../contracts/PayFiEscrow.sol";

/// @notice 部署到 HashKey Chain Testnet（或任意 RPC）；不依赖 MockERC20，链上 USDC 由环境配置使用。
/// forge script script/DeployHashKey.s.sol:DeployHashKey --rpc-url $CHAIN_RPC_URL --broadcast
/// 可选验证：--verify --verifier blockscout --verifier-url https://hashkey.blockscout.com/api/
contract DeployHashKey is Script {
    function run() external {
        uint256 pk = vm.envOr("SUBMITTER_PRIVATE_KEY", type(uint256).max);
        if (pk == type(uint256).max) pk = vm.envUint("PRIVATE_KEY");
        address submitter = vm.addr(pk);
        vm.startBroadcast(pk);
        PayFiEscrow e = new PayFiEscrow(submitter);
        vm.stopBroadcast();
        console2.log("PayFiEscrow:", address(e));
        console2.log("submitter:", submitter);
    }
}
