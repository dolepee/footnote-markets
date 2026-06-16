// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {FootnoteMarket} from "../src/FootnoteMarket.sol";

contract DeployFootnoteMarket is Script {
    address internal constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external returns (FootnoteMarket market) {
        vm.startBroadcast();
        market = new FootnoteMarket(ARC_USDC);
        vm.stopBroadcast();
    }
}
