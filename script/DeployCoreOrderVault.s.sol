// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CoreOrderVault} from "../contracts/CoreOrderVault.sol";

/// @notice forge script script/DeployCoreOrderVault.s.sol:DeployCoreOrderVault --rpc-url $RPC_URL --broadcast
contract DeployCoreOrderVault is Script {
    function privateKeyFromEnv(string memory name) internal view returns (uint256) {
        string memory raw = vm.envString(name);
        bytes memory b = bytes(raw);
        if (b.length >= 2 && b[0] == 0x30 && (b[1] == 0x78 || b[1] == 0x58)) {
            return vm.parseUint(raw);
        }
        return vm.parseUint(string.concat("0x", raw));
    }

    function run() external {
        string memory deployerRaw = vm.envOr("DEPLOYER_PRIVATE_KEY", string(""));
        uint256 pk = bytes(deployerRaw).length > 0
            ? privateKeyFromEnv("DEPLOYER_PRIVATE_KEY")
            : privateKeyFromEnv("PRIVATE_KEY");
        vm.startBroadcast(pk);
        CoreOrderVault vault = new CoreOrderVault();
        vm.stopBroadcast();
        console2.log("CoreOrderVault:", address(vault));
    }
}

