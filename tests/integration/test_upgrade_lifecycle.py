"""Live GenLayer upgrade rehearsal.

Run only against a disposable localnet test deployment. This test intentionally
fails when no RPC is available; a skipped test must not be reported as evidence.
"""

from __future__ import annotations

import time
from pathlib import Path

from gltest import get_accounts, get_contract_factory
from gltest.assertions import tx_execution_failed, tx_execution_succeeded
from gltest.contracts.contract_factory import ContractFactory
from gltest.types import TransactionStatus


CONTRACT_PATH = Path(__file__).parents[2] / "contracts" / "community_note_display_council.py"
V2_CONTRACT_SOURCE = CONTRACT_PATH.read_text(encoding="utf-8") + """

    @gl.public.view
    def get_contract_version(self) -> str:
        return "v2.0.0"
"""


def test_genlayer_upgrade_lifecycle_live():
    accounts = get_accounts()
    assert len(accounts) >= 2, "Upgrade rehearsal requires distinct upgrader and unauthorized accounts"
    deployer, unauthorized = accounts[:2]
    assert deployer.address.lower() != unauthorized.address.lower()

    factory_v1 = get_contract_factory(contract_file_path=CONTRACT_PATH)
    contract_v1 = factory_v1.deploy(args=[], account=deployer)

    deadline = int(time.time()) + 3600
    create_receipt = contract_v1.create_case(
        args=["https://example.com/posts/fact-check-target", "a" * 64, deadline, 7200]
    ).transact(wait_transaction_status=TransactionStatus.FINALIZED)
    assert tx_execution_succeeded(create_receipt)
    assert contract_v1.get_case_count(args=[]).call() == 1
    case_v1_snapshot = contract_v1.get_case(args=[1]).call()

    factory_v2 = ContractFactory(
        contract_name="CommunityNoteDisplayCouncil",
        contract_code=V2_CONTRACT_SOURCE,
    )
    v2_before_upgrade = factory_v2.build_contract(contract_v1.address, account=deployer)

    rejected = contract_v1.connect(unauthorized).upgrade(
        args=[V2_CONTRACT_SOURCE.encode("utf-8")]
    ).transact(wait_transaction_status=TransactionStatus.FINALIZED)
    assert tx_execution_failed(rejected)
    assert contract_v1.get_case_count(args=[]).call() == 1
    assert contract_v1.get_case(args=[1]).call() == case_v1_snapshot

    try:
        v2_before_upgrade.get_contract_version(args=[]).call()
    except Exception:
        pass
    else:
        raise AssertionError("Unauthorized upgrade unexpectedly installed v2 code")

    upgraded = contract_v1.upgrade(
        args=[V2_CONTRACT_SOURCE.encode("utf-8")]
    ).transact(wait_transaction_status=TransactionStatus.FINALIZED)
    assert tx_execution_succeeded(upgraded)

    contract_v2 = factory_v2.build_contract(contract_v1.address, account=deployer)
    assert contract_v2.get_contract_version(args=[]).call() == "v2.0.0"
    assert contract_v2.get_case_count(args=[]).call() == 1
    assert contract_v2.get_case(args=[1]).call() == case_v1_snapshot
