// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PayFiEscrow} from "../contracts/PayFiEscrow.sol";
import {ESpaceEscrowAdapter} from "../contracts/ESpaceEscrowAdapter.sol";

/// @notice forge script script/DeployCrossSpaceEspace.s.sol:DeployCrossSpaceEspace --rpc-url $RPC_URL --broadcast
contract DeployCrossSpaceEspace is Script {
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
        uint256 adminPk = bytes(deployerRaw).length > 0
            ? privateKeyFromEnv("DEPLOYER_PRIVATE_KEY")
            : privateKeyFromEnv("PRIVATE_KEY");
        address admin = vm.addr(adminPk);
        address relayer = vm.envAddress("RELAYER_ADDRESS");

        vm.startBroadcast(adminPk);

        ESpaceEscrowAdapter adapter = new ESpaceEscrowAdapter(admin);
        PayFiEscrow escrow = new PayFiEscrow(address(adapter));
        adapter.setEscrow(address(escrow));
        adapter.setRelayer(relayer, true);

        vm.stopBroadcast();

        console2.log("ESpaceEscrowAdapter:", address(adapter));
        console2.log("PayFiEscrow:", address(escrow));
        console2.log("admin:", admin);
        console2.log("relayer:", relayer);
    }
}

