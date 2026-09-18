// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MerchantRegistry} from "./MerchantRegistry.sol";

/// @title LocalBoost
/// @notice Zone/hour dynamic bonus pool for a local currency. The contract alone computes bonus
///         amounts from on-chain rates and enforces every cap; the off-chain engine only publishes
///         rates and signs a risk tier. Payments never revert because of a tier or a cap.
contract LocalBoost is AccessControl, EIP712 {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------- roles
    bytes32 public constant CITY_ROLE = keccak256("CITY_ROLE");
    bytes32 public constant BANK_ROLE = keccak256("BANK_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant ATTESTER_ROLE = keccak256("ATTESTER_ROLE");

    // ---------------------------------------------------------------- types
    struct Caps {
        uint16 maxRateBps;        // 1500
        uint256 perTxBoost;       // 3000
        uint256 personDailyBoost; // 5000
        uint16 slotCapBps;        // 15000 = bonus-eligible up to 150% of baseline sales
        uint32 pendingDelay;      // prod 72h, demo 60s
        uint32 capsDelay;         // prod 24h, demo 60s
    }

    struct Attestation {
        address payer;
        address merchant;
        uint256 amount;
        uint8 tier;
        uint256 nonce;
        uint256 deadline;
    }

    struct Pending {
        bytes32 personId;
        uint32 zoneId;
        uint256 amount;
        uint64 releaseAt;
        uint8 status; // 0 pending, 1 released, 2 clawed back
    }

    bytes32 private constant ATTESTATION_TYPEHASH = keccak256(
        "Attestation(address payer,address merchant,uint256 amount,uint8 tier,uint256 nonce,uint256 deadline)"
    );

    // ---------------------------------------------------------------- errors
    error UnregisteredPayer();
    error BadSigner(address recovered);
    error AttestationMismatch();
    error AttestationExpired();
    error NonceUsed();
    error MerchantInactive();
    error InsufficientCredit();
    error CreditExceedsAmount();
    error RateTooHigh(uint32 zoneId, uint16 bps, uint16 maxRateBps);
    error BadEpoch();
    error LengthMismatch();
    error CapsNotProposed();
    error CapsNotReady();
    error NotPending();
    error NotReleasable();
    error ZeroAddress();

    // ---------------------------------------------------------------- events
    event Paid(
        address indexed payer,
        bytes32 indexed personId,
        address indexed merchant,
        uint32 zoneId,
        uint256 amount,
        uint256 useCredit,
        uint256 boost,
        uint8 tier,
        uint256 pendingId
    );
    event RatesSet(uint64 hourEpoch, uint32[] zoneIds, uint16[] bps);
    event BudgetDeposited(uint32 indexed zoneId, uint256 amount, address indexed from);
    event PendingReleased(uint256 indexed pendingId, bytes32 indexed personId, uint256 amount);
    event PendingClawedBack(uint256 indexed pendingId, uint32 indexed zoneId, uint256 amount);
    event CapsProposed(Caps caps);
    event CapsApplied(Caps caps);
    event AttesterSet(address indexed attester, bool ok);

    // ---------------------------------------------------------------- storage
    IERC20 public immutable token;
    MerchantRegistry public immutable registry;

    Caps public caps;
    Caps public pendingCaps;
    uint256 public capsReadyAt;

    mapping(uint32 => uint256) public zoneBudget;
    mapping(uint32 => uint256) public zoneHourlyCap;
    mapping(uint32 => mapping(uint64 => uint256)) public zoneHourSpent;
    mapping(uint32 => mapping(uint64 => uint16)) public rates;

    mapping(bytes32 => uint256) private _credit;
    mapping(bytes32 => mapping(address => uint64)) public pairDay;
    mapping(bytes32 => mapping(uint64 => uint256)) public personDay;
    mapping(address => mapping(uint64 => uint256)) public slotVolume;

    mapping(uint256 => bool) public usedNonce;
    mapping(address => bool) public attesters;

    uint256 public nextPendingId = 1;
    mapping(uint256 => Pending) public pendings;

    constructor(address token_, address registry_, Caps memory initialCaps) EIP712("LocalBoost", "1") {
        if (token_ == address(0) || registry_ == address(0)) revert ZeroAddress();
        token = IERC20(token_);
        registry = MerchantRegistry(registry_);
        caps = initialCaps;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ---------------------------------------------------------------- CITY
    function depositBudget(uint32 zoneId, uint256 amount) external onlyRole(CITY_ROLE) {
        token.safeTransferFrom(msg.sender, address(this), amount);
        zoneBudget[zoneId] += amount;
        emit BudgetDeposited(zoneId, amount, msg.sender);
    }

    function setZoneHourlyCap(uint32 zoneId, uint256 cap) external onlyRole(CITY_ROLE) {
        zoneHourlyCap[zoneId] = cap;
    }

    function proposeCaps(Caps calldata c) external onlyRole(CITY_ROLE) {
        pendingCaps = c;
        capsReadyAt = block.timestamp + caps.capsDelay;
        emit CapsProposed(c);
    }

    function applyCaps() external {
        if (capsReadyAt == 0) revert CapsNotProposed();
        if (block.timestamp < capsReadyAt) revert CapsNotReady();
        caps = pendingCaps;
        capsReadyAt = 0;
        delete pendingCaps;
        emit CapsApplied(caps);
    }

    // ---------------------------------------------------------------- ORACLE
    function setRates(uint64 hourEpoch, uint32[] calldata zoneIds, uint16[] calldata bps)
        external
        onlyRole(ORACLE_ROLE)
    {
        uint64 nowEpoch = _hourEpoch();
        if (hourEpoch != nowEpoch && hourEpoch != nowEpoch + 1) revert BadEpoch();
        if (zoneIds.length != bps.length) revert LengthMismatch();
        uint16 maxBps = caps.maxRateBps;
        for (uint256 i = 0; i < zoneIds.length; i++) {
            if (bps[i] > maxBps) revert RateTooHigh(zoneIds[i], bps[i], maxBps);
            rates[zoneIds[i]][hourEpoch] = bps[i];
        }
        emit RatesSet(hourEpoch, zoneIds, bps);
    }

    // ---------------------------------------------------------------- anyone
    function payWithBoost(
        address merchant,
        uint256 amount,
        uint256 useCredit,
        Attestation calldata att,
        bytes calldata sig
    ) external {
        (merchant, amount, useCredit, att, sig);
        revert("TODO");
    }

    function release(uint256 pendingId) external {
        (pendingId);
        revert("TODO");
    }

    // ---------------------------------------------------------------- BANK
    function clawback(uint256 pendingId) external onlyRole(BANK_ROLE) {
        (pendingId);
        revert("TODO");
    }

    function setAttester(address a, bool ok) external onlyRole(BANK_ROLE) {
        if (a == address(0)) revert ZeroAddress();
        attesters[a] = ok;
        emit AttesterSet(a, ok);
    }

    // ---------------------------------------------------------------- views
    function currentRate(uint32 zoneId) external view returns (uint16) {
        return rates[zoneId][_hourEpoch()];
    }

    function creditOf(bytes32 personId) external view returns (uint256) {
        return _credit[personId];
    }

    function quoteBoost(address payer, address merchant, uint256 amount, uint256 useCredit)
        external
        view
        returns (uint256 boost)
    {
        (payer, merchant, amount, useCredit, boost);
        revert("TODO");
    }

    // ---------------------------------------------------------------- internals
    function _hourEpoch() internal view returns (uint64) {
        return uint64(block.timestamp / 3600);
    }

    /// @dev KST day index: (timestamp + 9h) / 1 day.
    function _day() internal view returns (uint64) {
        return uint64((block.timestamp + 9 hours) / 1 days);
    }

    function _hashAttestation(Attestation calldata att) internal view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ATTESTATION_TYPEHASH,
                    att.payer,
                    att.merchant,
                    att.amount,
                    att.tier,
                    att.nonce,
                    att.deadline
                )
            )
        );
    }

    /// @dev Recovers the signer and requires it to be a registered attester.
    function _verify(Attestation calldata att, bytes calldata sig) internal view returns (address signer) {
        signer = ECDSA.recover(_hashAttestation(att), sig);
        if (!attesters[signer]) revert BadSigner(signer);
    }
}
