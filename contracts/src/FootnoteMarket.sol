// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract FootnoteMarket {
    enum Decision {
        PAY,
        REFUSE,
        CACHE,
        SKIP
    }

    struct Source {
        address creator;
        address payoutWallet;
        bytes32 contentHash;
        string metadataURI;
        uint256 price;
        uint256 bond;
        int256 reputation;
        uint256 paidCount;
        uint256 refusedCount;
        bool active;
    }

    struct Receipt {
        uint256 sourceId;
        address buyer;
        Decision decision;
        uint256 amount;
        bytes32 queryHash;
        bytes32 reasonHash;
        bytes32 contentHashAtDecision;
        bool challenged;
        uint256 refundAmount;
    }

    IERC20 public immutable USDC;
    uint256 public nextSourceId = 1;
    uint256 public nextReceiptId = 1;

    mapping(uint256 => Source) public sources;
    mapping(uint256 => Receipt) public receipts;

    event SourceRegistered(
        uint256 indexed sourceId,
        address indexed creator,
        address indexed payoutWallet,
        bytes32 contentHash,
        uint256 price,
        uint256 bond,
        string metadataURI
    );
    event SourceHashUpdated(uint256 indexed sourceId, bytes32 oldHash, bytes32 newHash);
    event CitationPaid(
        uint256 indexed receiptId,
        uint256 indexed sourceId,
        address indexed buyer,
        address creator,
        uint256 amount,
        bytes32 queryHash,
        bytes32 reasonHash
    );
    event CitationRefused(
        uint256 indexed receiptId,
        uint256 indexed sourceId,
        address indexed buyer,
        Decision decision,
        bytes32 queryHash,
        bytes32 reasonHash
    );
    event ObjectiveChallengeResolved(
        uint256 indexed receiptId,
        uint256 indexed sourceId,
        address indexed buyer,
        uint256 refundAmount,
        bytes32 originalHash,
        bytes32 currentHash
    );
    event ReputationMoved(uint256 indexed sourceId, int256 newReputation);

    error InvalidSource();
    error InvalidDecision();
    error Unauthorized();
    error InactiveSource();
    error NotPaidReceipt();
    error AlreadyChallenged();
    error ObjectiveFailureNotMet();
    error TokenTransferFailed();

    constructor(address _usdc) {
        USDC = IERC20(_usdc);
    }

    function registerSource(
        address payoutWallet,
        bytes32 contentHash,
        string calldata metadataURI,
        uint256 price,
        uint256 bond
    ) external returns (uint256 sourceId) {
        if (payoutWallet == address(0) || contentHash == bytes32(0)) revert InvalidSource();

        if (bond > 0) {
            if (!USDC.transferFrom(msg.sender, address(this), bond)) revert TokenTransferFailed();
        }

        sourceId = nextSourceId++;
        sources[sourceId] = Source({
            creator: msg.sender,
            payoutWallet: payoutWallet,
            contentHash: contentHash,
            metadataURI: metadataURI,
            price: price,
            bond: bond,
            reputation: 0,
            paidCount: 0,
            refusedCount: 0,
            active: true
        });

        emit SourceRegistered(sourceId, msg.sender, payoutWallet, contentHash, price, bond, metadataURI);
        emit ReputationMoved(sourceId, sources[sourceId].reputation);
    }

    function payCitation(
        uint256 sourceId,
        bytes32 queryHash,
        bytes32 reasonHash
    ) external returns (uint256 receiptId) {
        Source storage source = sources[sourceId];
        if (!source.active) revert InactiveSource();

        if (!USDC.transferFrom(msg.sender, source.payoutWallet, source.price)) revert TokenTransferFailed();

        receiptId = nextReceiptId++;
        receipts[receiptId] = Receipt({
            sourceId: sourceId,
            buyer: msg.sender,
            decision: Decision.PAY,
            amount: source.price,
            queryHash: queryHash,
            reasonHash: reasonHash,
            contentHashAtDecision: source.contentHash,
            challenged: false,
            refundAmount: 0
        });

        source.paidCount += 1;
        source.reputation += 1;

        emit CitationPaid(
            receiptId,
            sourceId,
            msg.sender,
            source.payoutWallet,
            source.price,
            queryHash,
            reasonHash
        );
        emit ReputationMoved(sourceId, source.reputation);
    }

    function recordDecision(
        uint256 sourceId,
        Decision decision,
        bytes32 queryHash,
        bytes32 reasonHash
    ) external returns (uint256 receiptId) {
        if (decision == Decision.PAY) revert InvalidDecision();
        Source storage source = sources[sourceId];
        if (!source.active) revert InactiveSource();

        receiptId = nextReceiptId++;
        receipts[receiptId] = Receipt({
            sourceId: sourceId,
            buyer: msg.sender,
            decision: decision,
            amount: 0,
            queryHash: queryHash,
            reasonHash: reasonHash,
            contentHashAtDecision: source.contentHash,
            challenged: false,
            refundAmount: 0
        });

        if (decision == Decision.REFUSE) {
            source.refusedCount += 1;
            source.reputation -= 1;
            emit ReputationMoved(sourceId, source.reputation);
        }

        emit CitationRefused(receiptId, sourceId, msg.sender, decision, queryHash, reasonHash);
    }

    function updateSourceHash(uint256 sourceId, bytes32 newContentHash) external {
        if (newContentHash == bytes32(0)) revert InvalidSource();
        Source storage source = sources[sourceId];
        if (msg.sender != source.creator) revert Unauthorized();
        bytes32 oldHash = source.contentHash;
        source.contentHash = newContentHash;
        emit SourceHashUpdated(sourceId, oldHash, newContentHash);
    }

    function challengeHashChanged(uint256 receiptId) external returns (uint256 refundAmount) {
        Receipt storage receipt = receipts[receiptId];
        if (receipt.decision != Decision.PAY) revert NotPaidReceipt();
        if (receipt.challenged) revert AlreadyChallenged();
        if (msg.sender != receipt.buyer) revert Unauthorized();

        Source storage source = sources[receipt.sourceId];
        if (source.contentHash == receipt.contentHashAtDecision) revert ObjectiveFailureNotMet();

        refundAmount = receipt.amount <= source.bond ? receipt.amount : source.bond;
        source.bond -= refundAmount;
        source.reputation -= 10;
        receipt.challenged = true;
        receipt.refundAmount = refundAmount;

        if (refundAmount > 0 && !USDC.transfer(receipt.buyer, refundAmount)) revert TokenTransferFailed();

        emit ObjectiveChallengeResolved(
            receiptId,
            receipt.sourceId,
            receipt.buyer,
            refundAmount,
            receipt.contentHashAtDecision,
            source.contentHash
        );
        emit ReputationMoved(receipt.sourceId, source.reputation);
    }
}
