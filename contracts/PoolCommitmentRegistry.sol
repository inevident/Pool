// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title PoolCommitmentRegistry
/// @notice Anchors a fully funded buying coalition before sellers may bid, then
///         binds the eventual Rain settlement attestation to one registered offer hash.
/// @dev Prices and buyer mandates stay private. Only collision-resistant hashes,
///      aggregate units, and the maximum reserved amount are published.
contract PoolCommitmentRegistry {
    bytes32 public constant COMMITMENT_DOMAIN = keccak256("POOL_MONAD_COMMITMENT_V1");

    struct Commitment {
        bytes32 poolIdHash;
        bytes32 termsHash;
        bytes32 fundingRoot;
        bytes32 acceptedOfferHash;
        bytes32 rainSettlementHash;
        uint128 reservedCents;
        uint128 capturedCents;
        uint64 committedAt;
        uint64 bidClosesAt;
        uint64 settledAt;
        uint32 unitCount;
    }

    address public operator;
    address public pendingOperator;

    mapping(bytes32 commitmentId => Commitment commitment) private commitments;
    mapping(bytes32 commitmentId => mapping(bytes32 offerHash => bool registered))
        private registeredOffers;

    error Unauthorized();
    error ZeroAddress();
    error InvalidCommitment();
    error InvalidBidWindow();
    error CommitmentAlreadyExists(bytes32 commitmentId);
    error CommitmentNotFound(bytes32 commitmentId);
    error BidWindowClosed(bytes32 commitmentId);
    error InvalidOfferHash();
    error OfferAlreadyRegistered(bytes32 commitmentId, bytes32 offerHash);
    error OfferNotRegistered(bytes32 commitmentId, bytes32 offerHash);
    error InvalidSettlementHash();
    error InvalidCaptureAmount();
    error CaptureExceedsReservation(uint128 capturedCents, uint128 reservedCents);
    error CommitmentAlreadySettled(bytes32 commitmentId);

    event CoalitionCommitted(
        bytes32 indexed commitmentId,
        bytes32 indexed poolIdHash,
        bytes32 termsHash,
        bytes32 fundingRoot,
        uint32 unitCount,
        uint128 reservedCents,
        uint64 committedAt,
        uint64 bidClosesAt
    );

    event MerchantOfferRegistered(
        bytes32 indexed commitmentId,
        bytes32 indexed offerHash,
        uint64 registeredAt
    );

    event RainSettlementAttested(
        bytes32 indexed commitmentId,
        bytes32 indexed acceptedOfferHash,
        bytes32 indexed rainSettlementHash,
        uint128 capturedCents,
        uint128 releasedCents,
        uint64 settledAt
    );

    event OperatorNominated(address indexed currentOperator, address indexed pendingOperator);
    event OperatorTransferred(address indexed previousOperator, address indexed nextOperator);

    modifier onlyOperator() {
        if (msg.sender != operator) revert Unauthorized();
        _;
    }

    constructor(address initialOperator) {
        if (initialOperator == address(0)) revert ZeroAddress();
        operator = initialOperator;
        emit OperatorTransferred(address(0), initialOperator);
    }

    /// @notice Derives the chain- and deployment-specific identifier used by every later step.
    function computeCommitmentId(
        bytes32 poolIdHash,
        bytes32 termsHash,
        bytes32 fundingRoot,
        uint32 unitCount,
        uint128 reservedCents,
        uint64 bidClosesAt
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                COMMITMENT_DOMAIN,
                block.chainid,
                address(this),
                poolIdHash,
                termsHash,
                fundingRoot,
                unitCount,
                reservedCents,
                bidClosesAt
            )
        );
    }

    /// @notice Freezes the aggregate funded terms onchain before any offer is accepted.
    function commitCoalition(
        bytes32 poolIdHash,
        bytes32 termsHash,
        bytes32 fundingRoot,
        uint32 unitCount,
        uint128 reservedCents,
        uint64 bidClosesAt
    ) external onlyOperator returns (bytes32 commitmentId) {
        if (
            poolIdHash == bytes32(0) || termsHash == bytes32(0) ||
            fundingRoot == bytes32(0) || unitCount == 0 || reservedCents == 0
        ) revert InvalidCommitment();
        if (bidClosesAt <= block.timestamp || bidClosesAt > block.timestamp + 30 days) {
            revert InvalidBidWindow();
        }

        commitmentId = computeCommitmentId(
            poolIdHash,
            termsHash,
            fundingRoot,
            unitCount,
            reservedCents,
            bidClosesAt
        );
        if (commitments[commitmentId].committedAt != 0) {
            revert CommitmentAlreadyExists(commitmentId);
        }

        uint64 committedAt = uint64(block.timestamp);
        commitments[commitmentId] = Commitment({
            poolIdHash: poolIdHash,
            termsHash: termsHash,
            fundingRoot: fundingRoot,
            acceptedOfferHash: bytes32(0),
            rainSettlementHash: bytes32(0),
            reservedCents: reservedCents,
            capturedCents: 0,
            committedAt: committedAt,
            bidClosesAt: bidClosesAt,
            settledAt: 0,
            unitCount: unitCount
        });

        emit CoalitionCommitted(
            commitmentId,
            poolIdHash,
            termsHash,
            fundingRoot,
            unitCount,
            reservedCents,
            committedAt,
            bidClosesAt
        );
    }

    /// @notice Registers the integrity commitment for an offer POOL validated offchain.
    function registerMerchantOffer(
        bytes32 commitmentId,
        bytes32 offerHash
    ) external onlyOperator {
        Commitment storage commitment = commitments[commitmentId];
        if (commitment.committedAt == 0) revert CommitmentNotFound(commitmentId);
        if (commitment.settledAt != 0) revert CommitmentAlreadySettled(commitmentId);
        if (block.timestamp > commitment.bidClosesAt) revert BidWindowClosed(commitmentId);
        if (offerHash == bytes32(0)) revert InvalidOfferHash();
        if (registeredOffers[commitmentId][offerHash]) {
            revert OfferAlreadyRegistered(commitmentId, offerHash);
        }

        registeredOffers[commitmentId][offerHash] = true;
        emit MerchantOfferRegistered(commitmentId, offerHash, uint64(block.timestamp));
    }

    /// @notice Records the operator's final Rain-settlement digest against the winning offer.
    function attestRainSettlement(
        bytes32 commitmentId,
        bytes32 acceptedOfferHash,
        bytes32 rainSettlementHash,
        uint128 capturedCents
    ) external onlyOperator {
        Commitment storage commitment = commitments[commitmentId];
        if (commitment.committedAt == 0) revert CommitmentNotFound(commitmentId);
        if (commitment.settledAt != 0) revert CommitmentAlreadySettled(commitmentId);
        if (!registeredOffers[commitmentId][acceptedOfferHash]) {
            revert OfferNotRegistered(commitmentId, acceptedOfferHash);
        }
        if (rainSettlementHash == bytes32(0)) revert InvalidSettlementHash();
        if (capturedCents == 0) revert InvalidCaptureAmount();
        if (capturedCents > commitment.reservedCents) {
            revert CaptureExceedsReservation(capturedCents, commitment.reservedCents);
        }

        uint64 settledAt = uint64(block.timestamp);
        commitment.acceptedOfferHash = acceptedOfferHash;
        commitment.rainSettlementHash = rainSettlementHash;
        commitment.capturedCents = capturedCents;
        commitment.settledAt = settledAt;

        emit RainSettlementAttested(
            commitmentId,
            acceptedOfferHash,
            rainSettlementHash,
            capturedCents,
            commitment.reservedCents - capturedCents,
            settledAt
        );
    }

    function getCommitment(bytes32 commitmentId) external view returns (Commitment memory) {
        Commitment memory commitment = commitments[commitmentId];
        if (commitment.committedAt == 0) revert CommitmentNotFound(commitmentId);
        return commitment;
    }

    function isOfferRegistered(
        bytes32 commitmentId,
        bytes32 offerHash
    ) external view returns (bool) {
        return registeredOffers[commitmentId][offerHash];
    }

    function nominateOperator(address nextOperator) external onlyOperator {
        if (nextOperator == address(0)) revert ZeroAddress();
        pendingOperator = nextOperator;
        emit OperatorNominated(operator, nextOperator);
    }

    function acceptOperator() external {
        if (msg.sender != pendingOperator) revert Unauthorized();
        address previousOperator = operator;
        operator = msg.sender;
        pendingOperator = address(0);
        emit OperatorTransferred(previousOperator, msg.sender);
    }
}
