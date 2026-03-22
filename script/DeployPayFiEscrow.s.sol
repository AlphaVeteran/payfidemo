// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PayFiEscrow} from "../contracts/PayFiEscrow.sol";

/// @notice forge script script/DeployPayFiEscrow.s.sol:DeployPayFiEscrow --rpc-url $RPC_URL --broadcast
contract DeployPayFiEscrow is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        PayFiEscrow e = new PayFiEscrow();
        vm.stopBroadcast();
        console2.log("PayFiEscrow:", address(e));
    }
}
