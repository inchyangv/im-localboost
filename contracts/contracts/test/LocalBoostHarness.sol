// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {LocalBoost} from "../LocalBoost.sol";

/// @dev Test-only harness exposing internal EIP-712 helpers. Not deployed by scripts.
contract LocalBoostHarness is LocalBoost {
    constructor(address token_, address registry_, Caps memory initialCaps)
        LocalBoost(token_, registry_, initialCaps)
    {}

    function exposedHash(Attestation calldata att) external view returns (bytes32) {
        return _hashAttestation(att);
    }

    function exposedVerify(Attestation calldata att, bytes calldata sig) external view returns (address) {
        return _verify(att, sig);
    }
}
