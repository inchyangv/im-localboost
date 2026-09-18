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
    /// @notice Pays `amount` to `merchant` (part of it optionally from credit) and grants a bonus
    ///         computed on-chain. Never reverts because of caps or the risk tier: only the bonus shrinks.
    function payWithBoost(
        address merchant,
        uint256 amount,
        uint256 useCredit,
        Attestation calldata att,
        bytes calldata sig
    ) external {
        // 1. payer must be linked to a person
        bytes32 personId = registry.personOf(msg.sender);
        if (personId == bytes32(0)) revert UnregisteredPayer();

        // 2. attestation: signer, binding, expiry, replay
        _verify(att, sig);
        if (att.payer != msg.sender || att.merchant != merchant || att.amount != amount) revert AttestationMismatch();
        if (block.timestamp > att.deadline) revert AttestationExpired();
        if (usedNonce[att.nonce]) revert NonceUsed();

        // 3. merchant must be active
        MerchantRegistry.Merchant memory m = registry.get(merchant);
        if (!m.active) revert MerchantInactive();

        // 4. settle the payment (cash part via allowance, credit part from the pool)
        if (useCredit > _credit[personId]) revert InsufficientCredit();
        if (useCredit > amount) revert CreditExceedsAmount();
        usedNonce[att.nonce] = true;
        uint256 cash = amount - useCredit;
        if (cash > 0) token.safeTransferFrom(msg.sender, merchant, cash);
        if (useCredit > 0) {
            _credit[personId] -= useCredit;
            token.safeTransfer(merchant, useCredit);
        }

        // 5-6. bonus from the cash part, clamped in SPEC order, then tier handling and counters
        (uint256 boost, uint256 pendingId) = _grantBoost(personId, merchant, m, cash, att.tier);

        // 7.
        emit Paid(msg.sender, personId, merchant, m.zoneId, amount, useCredit, boost, att.tier, pendingId);
    }

    /// @dev Steps 5 and 6 of payWithBoost. Tier 2 and above: no bonus and no counter updates.
    function _grantBoost(
        bytes32 personId,
        address merchant,
        MerchantRegistry.Merchant memory m,
        uint256 cash,
        uint8 tier
    ) private returns (uint256 boost, uint256 pendingId) {
        if (tier >= 2) return (0, 0);

        uint64 epoch = _hourEpoch();
        uint64 day = _day();
        boost = _computeBoost(personId, merchant, m, cash, epoch, day);

        slotVolume[merchant][epoch] += cash;
        if (boost == 0) return (0, 0);

        zoneBudget[m.zoneId] -= boost;
        personDay[personId][day] += boost;
        zoneHourSpent[m.zoneId][epoch] += boost;
        pairDay[personId][merchant] = day;
        if (tier == 0) {
            _credit[personId] += boost;
        } else {
            pendingId = nextPendingId++;
            pendings[pendingId] = Pending({
                personId: personId,
                zoneId: m.zoneId,
                amount: boost,
                releaseAt: uint64(block.timestamp + caps.pendingDelay),
                status: 0
            });
        }
    }

    /// @notice Credits a pending bonus once its hold period has elapsed. Callable by anyone.
    function release(uint256 pendingId) external {
        Pending storage p = pendings[pendingId];
        if (p.status != 0 || p.amount == 0) revert NotPending();
        if (block.timestamp < p.releaseAt) revert NotReleasable();
        p.status = 1;
        _credit[p.personId] += p.amount;
        emit PendingReleased(pendingId, p.personId, p.amount);
    }

    // ---------------------------------------------------------------- BANK
    /// @notice Returns a pending bonus to its zone budget. Allowed at any time while still pending.
    function clawback(uint256 pendingId) external onlyRole(BANK_ROLE) {
        Pending storage p = pendings[pendingId];
        if (p.status != 0 || p.amount == 0) revert NotPending();
        p.status = 2;
        zoneBudget[p.zoneId] += p.amount;
        emit PendingClawedBack(pendingId, p.zoneId, p.amount);
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

    /// @notice Bonus a tier-0 payment would earn right now. Mirrors step 5 of payWithBoost.
    function quoteBoost(address payer, address merchant, uint256 amount, uint256 useCredit)
        external
        view
        returns (uint256 boost)
    {
        bytes32 personId = registry.personOf(payer);
        if (personId == bytes32(0) || useCredit > amount) return 0;
        MerchantRegistry.Merchant memory m = registry.get(merchant);
        return _computeBoost(personId, merchant, m, amount - useCredit, _hourEpoch(), _day());
    }

    // ---------------------------------------------------------------- internals
    /// @dev Step 5: bonus-eligible base is clamped in this order: pair/day, slot cap, rate,
    ///      per-tx cap, person daily cap, zone hourly cap, zone budget. Never reverts.
    function _computeBoost(
        bytes32 personId,
        address merchant,
        MerchantRegistry.Merchant memory m,
        uint256 base,
        uint64 epoch,
        uint64 day
    ) internal view returns (uint256 boost) {
        if (pairDay[personId][merchant] == day) return 0;

        uint256 slotCap = (m.slotBaseline * caps.slotCapBps) / 10000;
        uint256 volume = slotVolume[merchant][epoch];
        uint256 remainSlot = volume >= slotCap ? 0 : slotCap - volume;
        if (base > remainSlot) base = remainSlot;

        boost = (base * rates[m.zoneId][epoch]) / 10000;
        boost = _min(boost, caps.perTxBoost);
        boost = _min(boost, _remaining(caps.personDailyBoost, personDay[personId][day]));
        boost = _min(boost, _remaining(zoneHourlyCap[m.zoneId], zoneHourSpent[m.zoneId][epoch]));
        boost = _min(boost, zoneBudget[m.zoneId]);
    }

    function _remaining(uint256 cap, uint256 used) private pure returns (uint256) {
        return used >= cap ? 0 : cap - used;
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }

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
