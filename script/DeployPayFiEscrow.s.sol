// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PayFiEscrow} from "../contracts/PayFiEscrow.sol";

/// @notice forge script script/DeployPayFiEscrow.s.sol:DeployPayFiEscrow --rpc-url $RPC_URL --broadcast
contract DeployPayFiEscrow is Script {
    /// @dev Accepts `0x` + 64 hex (typical) or 64 hex only, matching `.env` styles for other keys.
    function privateKeyFromEnv(string memory name) internal view returns (uint256) {
        string memory raw = vm.envString(name);
        bytes memory b = bytes(raw);
        if (b.length >= 2 && b[0] == 0x30 && (b[1] == 0x78 || b[1] == 0x58)) {
            return vm.parseUint(raw);
        }
        return vm.parseUint(string.concat("0x", raw));
    }

    function run() external {
        uint256 pk = privateKeyFromEnv("PRIVATE_KEY");
        vm.startBroadcast(pk);
        PayFiEscrow e = new PayFiEscrow();
        vm.stopBroadcast();
        console2.log("PayFiEscrow:", address(e));
    }
}
