// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title Merchant and person registry
/// @notice Bank-maintained registry of merchants (zone, category, hourly baseline) and the
///         wallet -> personId mapping that all per-person caps in DalgubeolPay key on.
contract MerchantRegistry is AccessControl {
    bytes32 public constant BANK_ROLE = keccak256("BANK_ROLE");

    struct Merchant {
        uint32 zoneId;
        uint32 categoryId;
        bool active;
        uint256 slotBaseline; // baseline hourly sales in won
    }

    error ZeroAddress();
    error ZeroPerson();
    error PersonAlreadyLinked(bytes32 personId, address existingWallet);

    event MerchantRegistered(address indexed merchant, uint32 zoneId, uint32 categoryId, uint256 slotBaseline);
    event MerchantActiveSet(address indexed merchant, bool active);
    event PersonSet(address indexed wallet, bytes32 indexed personId);

    mapping(address => Merchant) private _merchants;
    mapping(address => bytes32) private _personOf;
    /// @dev One wallet per person: the wallet currently linked to a personId.
    mapping(bytes32 => address) public walletOf;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function register(address m, uint32 zoneId, uint32 categoryId, uint256 slotBaseline)
        external
        onlyRole(BANK_ROLE)
    {
        if (m == address(0)) revert ZeroAddress();
        _merchants[m] = Merchant({zoneId: zoneId, categoryId: categoryId, active: true, slotBaseline: slotBaseline});
        emit MerchantRegistered(m, zoneId, categoryId, slotBaseline);
    }

    function setActive(address m, bool active) external onlyRole(BANK_ROLE) {
        _merchants[m].active = active;
        emit MerchantActiveSet(m, active);
    }

    function setPerson(address wallet, bytes32 personId) external onlyRole(BANK_ROLE) {
        if (wallet == address(0)) revert ZeroAddress();
        if (personId == bytes32(0)) revert ZeroPerson();
        address existing = walletOf[personId];
        if (existing != address(0) && existing != wallet) revert PersonAlreadyLinked(personId, existing);
        walletOf[personId] = wallet;
        _personOf[wallet] = personId;
        emit PersonSet(wallet, personId);
    }

    function get(address m) external view returns (Merchant memory) {
        return _merchants[m];
    }

    function personOf(address wallet) external view returns (bytes32) {
        return _personOf[wallet];
    }
}
