// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FootnoteMarket} from "../src/FootnoteMarket.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract FootnoteMarketTest is Test {
    MockUSDC internal usdc;
    FootnoteMarket internal market;

    address internal creator = address(0xC0FFEE);
    address internal buyer = address(0xB0B);

    uint256 internal constant SOURCE_PRICE = 3_000; // 0.003 USDC
    uint256 internal constant SOURCE_BOND = 50_000; // 0.05 USDC

    bytes32 internal constant ORIGINAL_HASH = keccak256("original-source-body-v1");
    bytes32 internal constant UPDATED_HASH = keccak256("changed-source-body-v2");
    bytes32 internal constant QUERY_HASH = keccak256("why do nanopayments matter for creator publishing?");
    bytes32 internal constant PAY_REASON_HASH = keccak256("high relevance, bonded source, inside budget");
    bytes32 internal constant REFUSE_REASON_HASH = keccak256("overpriced for low relevance");

    function setUp() public {
        usdc = new MockUSDC();
        market = new FootnoteMarket(address(usdc));

        usdc.mint(creator, 10_000_000);
        usdc.mint(buyer, 10_000_000);
    }

    function testSpikePayRefuseChallengeRefundAndReputation() public {
        vm.startPrank(creator);
        usdc.approve(address(market), SOURCE_BOND);
        uint256 sourceId = market.registerSource(
            creator,
            ORIGINAL_HASH,
            "ipfs://footnote/source/arc-nanopayments",
            SOURCE_PRICE,
            SOURCE_BOND
        );
        vm.stopPrank();

        (, , , , , uint256 bondBefore, int256 initialRep, , , ) = market.sources(sourceId);
        assertEq(bondBefore, SOURCE_BOND);
        assertEq(initialRep, 0);

        vm.startPrank(buyer);
        usdc.approve(address(market), SOURCE_PRICE);
        uint256 paidReceiptId = market.payCitation(sourceId, QUERY_HASH, PAY_REASON_HASH);
        uint256 refusedReceiptId = market.recordDecision(
            sourceId,
            FootnoteMarket.Decision.REFUSE,
            QUERY_HASH,
            REFUSE_REASON_HASH
        );
        vm.stopPrank();

        assertEq(paidReceiptId, 1);
        assertEq(refusedReceiptId, 2);
        assertEq(usdc.balanceOf(creator), 10_000_000 - SOURCE_BOND + SOURCE_PRICE);
        assertEq(usdc.balanceOf(buyer), 10_000_000 - SOURCE_PRICE);

        (, , , , , , int256 repAfterDecision, uint256 paidCount, uint256 refusedCount, ) = market.sources(sourceId);
        assertEq(paidCount, 1);
        assertEq(refusedCount, 1);
        assertEq(repAfterDecision, 0);

        vm.prank(creator);
        market.updateSourceHash(sourceId, UPDATED_HASH);

        vm.prank(buyer);
        uint256 refund = market.challengeHashChanged(paidReceiptId);

        assertEq(refund, SOURCE_PRICE);
        assertEq(usdc.balanceOf(buyer), 10_000_000);

        (, , , , , uint256 bondAfter, int256 finalRep, , , ) = market.sources(sourceId);
        assertEq(bondAfter, SOURCE_BOND - SOURCE_PRICE);
        assertEq(finalRep, -10);

        (, , , , , , , bool challenged, uint256 refundAmount) = market.receipts(paidReceiptId);
        assertTrue(challenged);
        assertEq(refundAmount, SOURCE_PRICE);
    }

    function testCannotSlashSubjectiveQualityWhenHashIsUnchanged() public {
        vm.startPrank(creator);
        usdc.approve(address(market), SOURCE_BOND);
        uint256 sourceId = market.registerSource(
            creator,
            ORIGINAL_HASH,
            "ipfs://footnote/source/stable-source",
            SOURCE_PRICE,
            SOURCE_BOND
        );
        vm.stopPrank();

        vm.startPrank(buyer);
        usdc.approve(address(market), SOURCE_PRICE);
        uint256 receiptId = market.payCitation(sourceId, QUERY_HASH, PAY_REASON_HASH);

        vm.expectRevert(FootnoteMarket.ObjectiveFailureNotMet.selector);
        market.challengeHashChanged(receiptId);
        vm.stopPrank();
    }
}
