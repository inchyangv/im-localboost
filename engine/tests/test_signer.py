import json
from pathlib import Path

from eth_account import Account
from eth_account.messages import encode_typed_data

from engine.signer import ATTESTATION_TYPES, build_attestation, domain, sign_attestation_with

VECTOR = Path(__file__).resolve().parents[2] / "shared" / "test-vectors" / "attestation.json"


def _vector() -> dict:
    with VECTOR.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def test_signature_matches_hardhat_vector():
    v = _vector()
    sig = sign_attestation_with(
        v["signerKey"], v["domain"]["chainId"], v["domain"]["verifyingContract"], v["message"]
    )
    assert sig == v["signature"]
    assert len(bytes.fromhex(sig[2:])) == 65


def test_type_definition_matches_vector():
    v = _vector()
    assert ATTESTATION_TYPES == v["types"]
    assert domain(v["domain"]["chainId"], v["domain"]["verifyingContract"]) == v["domain"]


def test_recover_signer_from_vector():
    v = _vector()
    recovered = Account.recover_message(
        encode_typed_data(domain_data=v["domain"], message_types=v["types"], message_data=v["message"]),
        signature=v["signature"],
    )
    assert recovered == v["signer"]


def test_build_attestation_nonce_and_deadline():
    att = build_attestation("0x" + "11" * 20, "0x" + "22" * 20, 10000, 0, now=1_000_000)
    assert att["deadline"] == 1_000_120
    assert 0 <= att["nonce"] < 2**256
    other = build_attestation("0x" + "11" * 20, "0x" + "22" * 20, 10000, 0, now=1_000_000)
    assert other["nonce"] != att["nonce"]
