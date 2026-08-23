# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from pathlib import Path
import hashlib
import json
import pytest


CONTRACT_PATH = Path(__file__).parent.parent.parent / "contracts" / "community_note_display_council.py"

CONTENT_URL = "https://example.com/posts/fact-check-target"
CONTENT_BODY = "Breaking News: TechCorp announces Q3 2026 revenue of $50B, representing 50% year-over-year growth."
SNAPSHOT_HASH = hashlib.sha256(CONTENT_BODY.encode("utf-8")).hexdigest()

NOTE_0_URL = "https://sec.gov/filings/techcorp-q3-2026-10q"
NOTE_0_BODY = "Official SEC 10-Q filing: TechCorp reported Q3 revenue of $50B and 50% growth."

NOTE_1_URL = "https://bloomberg.example.org/news/techcorp-q3"
NOTE_1_BODY = "Bloomberg analysis confirming TechCorp Q3 results."

CHALLENGE_URL = "https://reuters.example.org/techcorp-restatement-q3-2026"
CHALLENGE_BODY = "Reuters: TechCorp later restated Q3 figures showing only 5% revenue growth."


def _setup_base_web_mocks(direct_vm, content_body: str = CONTENT_BODY):
    direct_vm.mock_web(
        r".*example\.com/posts/fact-check-target.*",
        {"status": 200, "body": content_body},
    )
    direct_vm.mock_web(
        r".*sec\.gov/filings/techcorp-q3-2026-10q.*",
        {"status": 200, "body": NOTE_0_BODY},
    )
    direct_vm.mock_web(
        r".*bloomberg\.example\.org/news/techcorp-q3.*",
        {"status": 200, "body": NOTE_1_BODY},
    )


def to_hex(addr):
    if hasattr(addr, "as_hex"):
        return addr.as_hex.lower()
    if isinstance(addr, bytes):
        return f"0x{addr.hex()}".lower()
    return str(addr).lower()


def test_00_nondeterministic_closures_do_not_capture_storage_proxy():
    contract_text = CONTRACT_PATH.read_text(encoding="utf-8")
    assert "class CommunityNoteDisplayCouncil(gl.Contract):" in contract_text
    assert "gl.vm.run_nondet_unsafe" in contract_text


def test_01_create_and_read_case_canonical_json(direct_vm, direct_deploy, direct_alice):
    direct_vm.check_pickling = True
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-08-22T10:00:00Z")
    contract = direct_deploy(CONTRACT_PATH)

    assert contract.get_case_count() == 0

    now_ts = 1787392800  # 2026-08-22T10:00:00Z
    sub_deadline = now_ts + 3600
    chal_window = 7200

    cid = contract.create_case(CONTENT_URL, SNAPSHOT_HASH, sub_deadline, chal_window)
    assert cid == 1
    assert contract.get_case_count() == 1

    case_raw = contract.get_case(cid)
    case = json.loads(case_raw)

    assert case["id"] == 1
    assert case["creator"].lower() == to_hex(direct_alice)
    assert case["content_url"] == CONTENT_URL
    assert case["snapshot_hash"] == SNAPSHOT_HASH
    assert case["submission_deadline"] == sub_deadline
    assert case["challenge_window_seconds"] == chal_window
    assert case["challenge_deadline"] == 0
    assert case["state"] == "OPEN"
    assert case["note_count"] == 0
    assert case["challenge_count"] == 0
    assert case["provisional_selected_note_id"] == -1
    assert case["provisional_display_consequence"] == ""
    assert case["provisional_rationale_digest"] == ""
    assert case["provisional_scores"] == []
    assert case["final_selected_note_id"] == -1
    assert case["final_display_consequence"] == ""
    assert case["final_rationale_digest"] == ""
    assert case["final_scores"] == []
    assert case["impactful_challenge_ids"] == []
    assert case["created_at"] == now_ts


def test_02_create_case_validation_and_bounds(direct_vm, direct_deploy, direct_alice):
    direct_vm.check_pickling = True
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-08-22T10:00:00Z")
    contract = direct_deploy(CONTRACT_PATH)
    now_ts = 1787392800

    # 1. Non-HTTPS URL
    with pytest.raises(Exception, match="valid public HTTPS URL"):
        contract.create_case("http://example.com/target", SNAPSHOT_HASH, now_ts + 3600, 7200)

    # 2. Localhost URL
    with pytest.raises(Exception, match="public host"):
        contract.create_case("https://localhost/target", SNAPSHOT_HASH, now_ts + 3600, 7200)

    # 3. Invalid snapshot hash (short, non-hex, uppercase)
    with pytest.raises(Exception, match="exactly 64 lowercase hexadecimal"):
        contract.create_case(CONTENT_URL, "abc123", now_ts + 3600, 7200)
    with pytest.raises(Exception, match="exactly 64 lowercase hexadecimal"):
        contract.create_case(CONTENT_URL, SNAPSHOT_HASH.upper(), now_ts + 3600, 7200)

    # 4. submission_deadline <= now
    with pytest.raises(Exception, match="Submission deadline must satisfy"):
        contract.create_case(CONTENT_URL, SNAPSHOT_HASH, now_ts, 7200)
    with pytest.raises(Exception, match="Submission deadline must satisfy"):
        contract.create_case(CONTENT_URL, SNAPSHOT_HASH, now_ts - 10, 7200)

    # 5. submission_deadline > now + 30 days
    with pytest.raises(Exception, match="Submission deadline must satisfy"):
        contract.create_case(CONTENT_URL, SNAPSHOT_HASH, now_ts + 30 * 86400 + 1, 7200)

    # 6. challenge_window_seconds out of bounds (< 3600 or > 604800)
    with pytest.raises(Exception, match="Challenge window seconds must be between 3600 and 604800"):
        contract.create_case(CONTENT_URL, SNAPSHOT_HASH, now_ts + 3600, 3599)
    with pytest.raises(Exception, match="Challenge window seconds must be between 3600 and 604800"):
        contract.create_case(CONTENT_URL, SNAPSHOT_HASH, now_ts + 3600, 604801)

    # 7. Valid exact bounds
    cid1 = contract.create_case(CONTENT_URL, SNAPSHOT_HASH, now_ts + 30 * 86400, 3600)
    assert cid1 == 1
    cid2 = contract.create_case(CONTENT_URL, SNAPSHOT_HASH, now_ts + 3600, 604800)
    assert cid2 == 2


def test_03_submit_note_and_read_note(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    direct_vm.check_pickling = True
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-08-22T10:00:00Z")
    contract = direct_deploy(CONTRACT_PATH)

    now_ts = 1787392800
    cid = contract.create_case(CONTENT_URL, SNAPSHOT_HASH, now_ts + 3600, 7200)

    # Alice submits note 0
    direct_vm.sender = direct_alice
    note_id_0 = contract.submit_note(
        cid,
        "Note 0: Official SEC 10-Q filing proves 50% revenue growth.",
        [NOTE_0_URL],
    )
    assert note_id_0 == 0
    assert contract.get_note_count(cid) == 1

    note0_raw = contract.get_note(cid, 0)
    note0 = json.loads(note0_raw)
    assert note0["case_id"] == 1
    assert note0["note_id"] == 0
    assert note0["author"].lower() == to_hex(direct_alice)
    assert note0["note_text"] == "Note 0: Official SEC 10-Q filing proves 50% revenue growth."
    assert note0["source_urls"] == [NOTE_0_URL]

    # Duplicate note from Alice fails
    with pytest.raises(Exception, match="already submitted a note"):
        contract.submit_note(cid, "Second note from Alice", [NOTE_0_URL])

    # Bob tries duplicate text digest -> fails
    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match="Duplicate note text digest"):
        contract.submit_note(
            cid,
            "  note 0:   OFFICIAL sec 10-q FILING proves 50% revenue growth.  ",
            [NOTE_1_URL],
        )

    # Empty text or text > 600 chars fails
    with pytest.raises(Exception, match="Note text must be between"):
        contract.submit_note(cid, "", [NOTE_1_URL])
    with pytest.raises(Exception, match="Note text must be between"):
        contract.submit_note(cid, "A" * 601, [NOTE_1_URL])

    # 0 sources or > 3 sources fails
    with pytest.raises(Exception, match="must contain between 1 and 3 source URLs"):
        contract.submit_note(cid, "Valid text", [])
    with pytest.raises(Exception, match="must contain between 1 and 3 source URLs"):
        contract.submit_note(
            cid,
            "Valid text",
            [
                "https://s1.example.org/1",
                "https://s2.example.org/2",
                "https://s3.example.org/3",
                "https://s4.example.org/4",
            ],
        )

    # Duplicate sources in one note fails
    with pytest.raises(Exception, match="cannot contain duplicate URLs"):
        contract.submit_note(cid, "Valid text", [NOTE_1_URL, NOTE_1_URL])

    # Late submission past deadline fails
    direct_vm.warp("2026-08-22T11:00:01Z")
    direct_vm.sender = direct_charlie
    with pytest.raises(Exception, match="Submission deadline has passed"):
        contract.submit_note(cid, "Charlie note late", [NOTE_1_URL])


def test_04_note_cap_and_lock_case_timing(direct_vm, direct_deploy, direct_accounts):
    direct_vm.check_pickling = True
    direct_vm.sender = direct_accounts[0]
    direct_vm.warp("2026-08-22T10:00:00Z")
    contract = direct_deploy(CONTRACT_PATH)

    now_ts = 1787392800
    cid = contract.create_case(CONTENT_URL, SNAPSHOT_HASH, now_ts + 3600, 7200)

    # Submit 5 notes from 5 different accounts (cap = 5)
    for i in range(5):
        direct_vm.sender = direct_accounts[i]
        nid = contract.submit_note(
            cid,
            f"Candidate note content number {i} from author {i}",
            [f"https://source{i}.example.org/doc"],
        )
        assert nid == i

    assert contract.get_note_count(cid) == 5

    # 6th note fails on cap
    direct_vm.sender = direct_accounts[5]
    with pytest.raises(Exception, match="Maximum note count reached"):
        contract.submit_note(cid, "Note 6 exceeding cap", ["https://source6.example.org/doc"])

    # Early lock before submission deadline fails even when cap reached
    with pytest.raises(Exception, match="Submission deadline has not passed yet"):
        contract.lock_case(cid)

    # Lock after deadline succeeds
    direct_vm.warp("2026-08-22T11:00:01Z")
    contract.lock_case(cid)

    case = json.loads(contract.get_case(cid))
    assert case["state"] == "LOCKED"
    assert case["locked_at"] == 1787396401

    # Locking already locked case fails
    with pytest.raises(Exception, match="Case is not in OPEN state"):
        contract.lock_case(cid)


def test_05_evaluate_case_wrong_phase_and_delayed_window(direct_vm, direct_deploy, direct_alice):
    direct_vm.check_pickling = True
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-08-22T10:00:00Z")
    contract = direct_deploy(CONTRACT_PATH)

    now_ts = 1787392800
    cid = contract.create_case(CONTENT_URL, SNAPSHOT_HASH, now_ts + 3600, 7200)

    # Evaluating while OPEN fails
    with pytest.raises(Exception, match="Case must be in LOCKED state to evaluate"):
        contract.evaluate_case(cid)

    # Lock case
    direct_vm.warp("2026-08-22T11:00:01Z")
    contract.lock_case(cid)

    # Delayed evaluation: happens 1 day later (now + 86400)
    direct_vm.warp("2026-08-23T10:00:00Z")
    eval_ts = 1787479200

    _setup_base_web_mocks(direct_vm)
    llm_payload = {
        "notes": [],
        "rationale": "Zero notes case.",
    }
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(llm_payload))
    contract.evaluate_case(cid)

    case = json.loads(contract.get_case(cid))
    assert case["state"] == "CHALLENGE"
    assert case["evaluated_at"] == eval_ts
    # Challenge deadline must be evaluated_at + challenge_window_seconds (7200)
    assert case["challenge_deadline"] == eval_ts + 7200


def test_06_happy_evaluation_display_consequence(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.check_pickling = True
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-08-22T10:00:00Z")
    contract = direct_deploy(CONTRACT_PATH)

    now_ts = 1787392800
    cid = contract.create_case(CONTENT_URL, SNAPSHOT_HASH, now_ts + 3600, 7200)

    # Alice submits Note 0
    direct_vm.sender = direct_alice
    contract.submit_note(cid, "Note 0: Revenue growth verified via SEC filing.", [NOTE_0_URL])

    # Bob submits Note 1
    direct_vm.sender = direct_bob
    contract.submit_note(cid, "Note 1: Secondary report on TechCorp.", [NOTE_1_URL])

    direct_vm.warp("2026-08-22T11:00:01Z")
    contract.lock_case(cid)

    _setup_base_web_mocks(direct_vm)

    # Mock LLM returning scores: Note 0 total = 90*35 + 85*35 + 80*20 + (100-10)*10 = 3150 + 2975 + 1600 + 900 = 8625 (DISPLAY)
    llm_payload = {
        "notes": [
            {"note_id": 0, "relevance": 90, "source_quality": 85, "clarity": 80, "contradiction_risk": 10},
            {"note_id": 1, "relevance": 70, "source_quality": 60, "clarity": 70, "contradiction_risk": 20},
        ],
        "rationale": "Note 0 is highly supported by primary SEC filings.",
    }
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(llm_payload))

    contract.evaluate_case(cid)

    case = json.loads(contract.get_case(cid))
    assert case["state"] == "CHALLENGE"
    assert case["provisional_selected_note_id"] == 0
    assert case["provisional_display_consequence"] == "DISPLAY"
    assert len(case["provisional_rationale_digest"]) == 64
    assert len(case["provisional_scores"]) == 2
    assert case["provisional_scores"][0]["total"] == 8625
    assert case["provisional_scores"][1]["total"] == 6750

    # Reputation remains 0 before finalization
    assert contract.get_reputation(direct_alice) == 0
    assert contract.get_reputation(direct_bob) == 0


def test_07_threshold_boundary_matrix(direct_vm, direct_deploy, direct_alice):
    direct_vm.check_pickling = True
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-08-22T10:00:00Z")
    contract = direct_deploy(CONTRACT_PATH)

    cases = [
        # (rel, sq, clar, cr, expected_total, expected_consequence, expected_selected_id)
        # 1. Exact 7500 total, sq=60 -> DISPLAY
        (80, 60, 80, 0, 7500, "DISPLAY", 0),
        # 2. Exact 7500 total, sq=59 -> DISPLAY_WITH_WARNING (fails sq >= 60)
        (81, 59, 80, 0, 7500, "DISPLAY_WITH_WARNING", 0),
        # 3. 7490 total (< 7500), sq=60 -> DISPLAY_WITH_WARNING
        (80, 60, 80, 1, 7490, "DISPLAY_WITH_WARNING", 0),
        # 4. Exact 5500 total -> DISPLAY_WITH_WARNING
        (50, 50, 50, 0, 5500, "DISPLAY_WITH_WARNING", 0),
        # 5. 5490 total (< 5500) -> NO_NOTE
        (50, 50, 50, 1, 5490, "NO_NOTE", -1),
    ]

    for rel, sq, clar, cr, exp_total, exp_consequence, exp_selected_id in cases:
        direct_vm.clear_mocks()
        direct_vm.warp("2026-08-22T10:00:00Z")
        now_ts = 1787392800
        cid = contract.create_case(CONTENT_URL, SNAPSHOT_HASH, now_ts + 3600, 7200)
        contract.submit_note(cid, f"Test note for {exp_consequence} with total {exp_total}", [NOTE_0_URL])

        direct_vm.warp("2026-08-22T11:00:01Z")
        contract.lock_case(cid)

        _setup_base_web_mocks(direct_vm)
        llm_payload = {
            "notes": [
                {
                    "note_id": 0,
                    "relevance": rel,
                    "source_quality": sq,
                    "clarity": clar,
                    "contradiction_risk": cr,
                }
            ],
            "rationale": f"Testing boundary total {exp_total}",
        }
        direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(llm_payload))
        contract.evaluate_case(cid)

        case = json.loads(contract.get_case(cid))
        assert case["provisional_display_consequence"] == exp_consequence
        assert case["provisional_selected_note_id"] == exp_selected_id
        assert case["provisional_scores"][0]["total"] == exp_total


def test_08_all_tie_break_levels(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.check_pickling = True
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-08-22T10:00:00Z")
    contract = direct_deploy(CONTRACT_PATH)

    tie_cases = [
        # Level 1: Higher total wins
        (
            {"note_id": 0, "relevance": 80, "source_quality": 80, "clarity": 80, "contradiction_risk": 20},  # total = 8000
            {"note_id": 1, "relevance": 80, "source_quality": 80, "clarity": 75, "contradiction_risk": 20},  # total = 7900
            0,
        ),
        # Level 2: Equal total, higher source_quality wins
        (
            {"note_id": 0, "relevance": 80, "source_quality": 70, "clarity": 70, "contradiction_risk": 0},   # total = 7650
            {"note_id": 1, "relevance": 70, "source_quality": 80, "clarity": 70, "contradiction_risk": 0},   # total = 7650
            1,
        ),
        # Level 3: Equal total & sq, higher relevance wins
        (
            {"note_id": 0, "relevance": 80, "source_quality": 70, "clarity": 70, "contradiction_risk": 0},   # total = 7650
            {"note_id": 1, "relevance": 76, "source_quality": 70, "clarity": 77, "contradiction_risk": 0},   # total = 7650
            0,
        ),
        # Level 4: Equal total, sq, rel, higher clarity wins
        (
            {"note_id": 0, "relevance": 70, "source_quality": 70, "clarity": 80, "contradiction_risk": 20},  # total = 7300
            {"note_id": 1, "relevance": 70, "source_quality": 70, "clarity": 75, "contradiction_risk": 10},  # total = 7300
            0,
        ),
        # Level 5: Lower contradiction_risk wins
        (
            {"note_id": 0, "relevance": 70, "source_quality": 70, "clarity": 70, "contradiction_risk": 10},  # total = 7200
            {"note_id": 1, "relevance": 70, "source_quality": 70, "clarity": 70, "contradiction_risk": 20},  # total = 7100
            0,
        ),
        # Level 6: Identical scores -> Lower submission index (note 0) wins
        (
            {"note_id": 0, "relevance": 85, "source_quality": 85, "clarity": 85, "contradiction_risk": 5},
            {"note_id": 1, "relevance": 85, "source_quality": 85, "clarity": 85, "contradiction_risk": 5},
            0,
        ),
    ]

    for score0, score1, expected_winner in tie_cases:
        direct_vm.clear_mocks()
        direct_vm.warp("2026-08-22T10:00:00Z")
        now_ts = 1787392800
        cid = contract.create_case(CONTENT_URL, SNAPSHOT_HASH, now_ts + 3600, 7200)

        direct_vm.sender = direct_alice
        contract.submit_note(cid, "Note 0 candidate text", [NOTE_0_URL])

        direct_vm.sender = direct_bob
        contract.submit_note(cid, "Note 1 candidate text", [NOTE_1_URL])

        direct_vm.warp("2026-08-22T11:00:01Z")
        contract.lock_case(cid)

        _setup_base_web_mocks(direct_vm)
        llm_payload = {"notes": [score0, score1], "rationale": "Tie break test"}
        direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(llm_payload))

        contract.evaluate_case(cid)
        case = json.loads(contract.get_case(cid))
        assert case["provisional_selected_note_id"] == expected_winner


def test_09_evidence_availability_and_source_quality_penalty(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.check_pickling = True
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-08-22T10:00:00Z")
    contract = direct_deploy(CONTRACT_PATH)

    now_ts = 1787392800
    cid = contract.create_case(CONTENT_URL, SNAPSHOT_HASH, now_ts + 3600, 7200)

    contract.submit_note(cid, "Note 0", [NOTE_0_URL])
    direct_vm.sender = direct_bob
    contract.submit_note(cid, "Note 1", [NOTE_1_URL])

    direct_vm.warp("2026-08-22T11:00:01Z")
    contract.lock_case(cid)

    # 1. All note sources fail -> UserError, state remains LOCKED
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*example\.com/posts/fact-check-target.*", {"status": 200, "body": CONTENT_BODY})
    direct_vm.mock_web(r".*sec\.gov.*", {"status": 500, "body": ""})
    direct_vm.mock_web(r".*bloomberg\.example\.org.*", {"status": 500, "body": ""})

    with pytest.raises(Exception, match="All candidate-note sources are unavailable"):
        contract.evaluate_case(cid)

    case_after_fail = json.loads(contract.get_case(cid))
    assert case_after_fail["state"] == "LOCKED"
    assert case_after_fail["evaluated_at"] == 0

    # 2. Partial source availability: NOTE_0 succeeds, NOTE_1 fails
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*example\.com/posts/fact-check-target.*", {"status": 200, "body": CONTENT_BODY})
    direct_vm.mock_web(r".*sec\.gov/filings/techcorp-q3-2026-10q.*", {"status": 200, "body": NOTE_0_BODY})
    direct_vm.mock_web(r".*bloomberg\.example\.org/news/techcorp-q3.*", {"status": 500, "body": ""})  # Note 1 has 0 available sources

    # If LLM attempts to give Note 1 source_quality = 25 (> 20), reject
    llm_bad_sq = {
        "notes": [
            {"note_id": 0, "relevance": 85, "source_quality": 85, "clarity": 80, "contradiction_risk": 10},
            {"note_id": 1, "relevance": 85, "source_quality": 25, "clarity": 80, "contradiction_risk": 10},
        ],
        "rationale": "Note 1 source failed but gave high SQ.",
    }
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(llm_bad_sq))
    with pytest.raises(Exception, match="cannot have source_quality > 20"):
        contract.evaluate_case(cid)

    # If LLM gives Note 1 source_quality <= 20, succeeds!
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*example\.com/posts/fact-check-target.*", {"status": 200, "body": CONTENT_BODY})
    direct_vm.mock_web(r".*sec\.gov/filings/techcorp-q3-2026-10q.*", {"status": 200, "body": NOTE_0_BODY})
    direct_vm.mock_web(r".*bloomberg\.example\.org/news/techcorp-q3.*", {"status": 500, "body": ""})
    llm_good_sq = {
        "notes": [
            {"note_id": 0, "relevance": 85, "source_quality": 85, "clarity": 80, "contradiction_risk": 10},
            {"note_id": 1, "relevance": 85, "source_quality": 20, "clarity": 80, "contradiction_risk": 10},
        ],
        "rationale": "Note 1 source failed so SQ was capped at 20.",
    }
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(llm_good_sq))
    contract.evaluate_case(cid)

    case_success = json.loads(contract.get_case(cid))
    assert case_success["state"] == "CHALLENGE"
    assert case_success["provisional_selected_note_id"] == 0


def test_10_closed_result_schema_and_injection_defense(direct_vm, direct_deploy, direct_alice):
    direct_vm.check_pickling = True
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-08-22T10:00:00Z")
    contract = direct_deploy(CONTRACT_PATH)

    now_ts = 1787392800
    cid = contract.create_case(CONTENT_URL, SNAPSHOT_HASH, now_ts + 3600, 7200)
    contract.submit_note(cid, "Note 0", [NOTE_0_URL])
    direct_vm.warp("2026-08-22T11:00:01Z")
    contract.lock_case(cid)

    _setup_base_web_mocks(direct_vm)

    # 1. Missing note ID
    direct_vm.clear_mocks()
    _setup_base_web_mocks(direct_vm)
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps({"notes": [], "rationale": "none"}))
    with pytest.raises(Exception, match="LLM notes count mismatch"):
        contract.evaluate_case(cid)

    # 2. Extra note ID
    direct_vm.clear_mocks()
    _setup_base_web_mocks(direct_vm)
    direct_vm.mock_llm(
        r"(?s).*objective evaluation council.*",
        json.dumps({
            "notes": [
                {"note_id": 0, "relevance": 80, "source_quality": 80, "clarity": 80, "contradiction_risk": 10},
                {"note_id": 99, "relevance": 80, "source_quality": 80, "clarity": 80, "contradiction_risk": 10},
            ],
            "rationale": "extra note",
        }),
    )
    with pytest.raises(Exception, match="LLM notes count mismatch"):
        contract.evaluate_case(cid)

    # 3. Duplicate note ID
    direct_vm.clear_mocks()
    _setup_base_web_mocks(direct_vm)
    direct_vm.mock_llm(
        r"(?s).*objective evaluation council.*",
        json.dumps({
            "notes": [
                {"note_id": 0, "relevance": 80, "source_quality": 80, "clarity": 80, "contradiction_risk": 10},
                {"note_id": 0, "relevance": 80, "source_quality": 80, "clarity": 80, "contradiction_risk": 10},
            ],
            "rationale": "duplicate",
        }),
    )
    with pytest.raises(Exception, match="LLM notes count mismatch|Duplicate note_id"):
        contract.evaluate_case(cid)

    # 4. Boolean in place of integer
    direct_vm.clear_mocks()
    _setup_base_web_mocks(direct_vm)
    direct_vm.mock_llm(
        r"(?s).*objective evaluation council.*",
        json.dumps({
            "notes": [
                {"note_id": 0, "relevance": True, "source_quality": 80, "clarity": 80, "contradiction_risk": 10},
            ],
            "rationale": "bool",
        }),
    )
    with pytest.raises(Exception, match="must be an integer"):
        contract.evaluate_case(cid)

    # 5. Score out of bounds (< 0 or > 100)
    direct_vm.clear_mocks()
    _setup_base_web_mocks(direct_vm)
    direct_vm.mock_llm(
        r"(?s).*objective evaluation council.*",
        json.dumps({
            "notes": [
                {"note_id": 0, "relevance": 105, "source_quality": 80, "clarity": 80, "contradiction_risk": 10},
            ],
            "rationale": "oob",
        }),
    )
    with pytest.raises(Exception, match="must be in range"):
        contract.evaluate_case(cid)


def test_11_consensus_validation_rules(direct_vm, direct_deploy, direct_alice):
    direct_vm.check_pickling = True
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-08-22T10:00:00Z")
    contract = direct_deploy(CONTRACT_PATH)

    now_ts = 1787392800
    cid = contract.create_case(CONTENT_URL, SNAPSHOT_HASH, now_ts + 3600, 7200)
    contract.submit_note(cid, "Note 0", [NOTE_0_URL])
    direct_vm.warp("2026-08-22T11:00:01Z")
    contract.lock_case(cid)

    _setup_base_web_mocks(direct_vm)

    # 1. Legitimate leader evaluation
    valid_llm = {
        "notes": [{"note_id": 0, "relevance": 85, "source_quality": 80, "clarity": 80, "contradiction_risk": 10}],
        "rationale": "Leader rationale text.",
    }
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(valid_llm))
    contract.evaluate_case(cid)

    # 2. Harmless wording difference in rationale accepted
    val_llm_diff_rationale = {
        "notes": [{"note_id": 0, "relevance": 85, "source_quality": 80, "clarity": 80, "contradiction_risk": 10}],
        "rationale": "Completely different validator wording summarizing the facts.",
    }
    direct_vm.clear_mocks()
    _setup_base_web_mocks(direct_vm)
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(val_llm_diff_rationale))
    assert direct_vm.run_validator() is True

    # 3. Schema-valid but substantively false leader result rejected
    false_leader_result = {
        "snapshot_hash": SNAPSHOT_HASH,
        "notes_scores": [{"note_id": 0, "relevance": 99, "source_quality": 99, "clarity": 99, "contradiction_risk": 0, "total": 9900}],
        "selected_note_id": 0,
        "display_consequence": "DISPLAY",
        "rationale": "Fabricated leader result.",
        "rationale_digest": hashlib.sha256("Fabricated leader result.".encode("utf-8")).hexdigest(),
        "impactful_challenge_ids": [],
    }
    low_llm = {
        "notes": [{"note_id": 0, "relevance": 40, "source_quality": 40, "clarity": 40, "contradiction_risk": 50}],
        "rationale": "Low score result.",
    }
    direct_vm.clear_mocks()
    _setup_base_web_mocks(direct_vm)
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(low_llm))
    assert direct_vm.run_validator(leader_result=false_leader_result) is False

    # 4. Consequence / winner drift rejected
    assert direct_vm.run_validator() is False


def test_11b_validator_rejects_malformed_leader_score_identity(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    direct_vm.check_pickling = True
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-08-22T10:00:00Z")
    contract = direct_deploy(CONTRACT_PATH)

    now_ts = 1787392800
    cid = contract.create_case(CONTENT_URL, SNAPSHOT_HASH, now_ts + 3600, 7200)
    contract.submit_note(cid, "Alice note", [NOTE_0_URL])
    direct_vm.sender = direct_bob
    contract.submit_note(cid, "Bob note", [NOTE_1_URL])
    direct_vm.warp("2026-08-22T11:00:01Z")
    contract.lock_case(cid)

    _setup_base_web_mocks(direct_vm)
    valid_llm = {
        "notes": [
            {"note_id": 0, "relevance": 85, "source_quality": 85, "clarity": 80, "contradiction_risk": 10},
            {"note_id": 1, "relevance": 70, "source_quality": 70, "clarity": 70, "contradiction_risk": 20},
        ],
        "rationale": "Note zero wins.",
    }
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(valid_llm))
    contract.evaluate_case(cid)

    rationale = "Fabricated duplicate-note leader result."
    duplicated_note = {
        "note_id": 0,
        "relevance": 85,
        "source_quality": 85,
        "clarity": 80,
        "contradiction_risk": 10,
        "total": 8450,
    }
    malformed_leader = {
        "snapshot_hash": SNAPSHOT_HASH,
        "notes_scores": [duplicated_note, dict(duplicated_note)],
        "selected_note_id": 0,
        "display_consequence": "DISPLAY",
        "rationale": rationale,
        "rationale_digest": hashlib.sha256(rationale.encode("utf-8")).hexdigest(),
        "impactful_challenge_ids": [],
    }
    assert direct_vm.run_validator(leader_result=malformed_leader) is False

    inconsistent = dict(malformed_leader)
    inconsistent["notes_scores"] = [
        dict(duplicated_note),
        {
            "note_id": 1,
            "relevance": 10,
            "source_quality": 10,
            "clarity": 10,
            "contradiction_risk": 100,
            "total": 900,
        },
    ]
    inconsistent["selected_note_id"] = 1
    assert direct_vm.run_validator(leader_result=inconsistent) is False


def test_12_challenges_flow_and_timing_bounds(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    direct_vm.check_pickling = True
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-08-22T10:00:00Z")
    contract = direct_deploy(CONTRACT_PATH)

    now_ts = 1787392800
    cid = contract.create_case(CONTENT_URL, SNAPSHOT_HASH, now_ts + 3600, 7200)
    contract.submit_note(cid, "Alice note", [NOTE_0_URL])

    # Challenge in OPEN phase fails
    with pytest.raises(Exception, match="CHALLENGE state"):
        contract.submit_challenge(cid, "Reason", [CHALLENGE_URL])

    direct_vm.warp("2026-08-22T11:00:01Z")
    contract.lock_case(cid)

    # Challenge in LOCKED phase fails
    with pytest.raises(Exception, match="CHALLENGE state"):
        contract.submit_challenge(cid, "Reason", [CHALLENGE_URL])

    _setup_base_web_mocks(direct_vm)
    llm_payload = {
        "notes": [{"note_id": 0, "relevance": 90, "source_quality": 85, "clarity": 85, "contradiction_risk": 10}],
        "rationale": "Provisional winner.",
    }
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(llm_payload))
    contract.evaluate_case(cid)

    case = json.loads(contract.get_case(cid))
    chal_deadline = case["challenge_deadline"]
    assert chal_deadline == 1787396401 + 7200  # 11:00:01 + 2h = 13:00:01

    # Bob submits challenge 0
    direct_vm.sender = direct_bob
    chid0 = contract.submit_challenge(cid, "Bob challenge reason", [CHALLENGE_URL])
    assert chid0 == 0

    # Duplicate challenge from Bob fails
    with pytest.raises(Exception, match="already submitted a challenge"):
        contract.submit_challenge(cid, "Bob second challenge", [CHALLENGE_URL])

    # Charlie submits challenge 1
    direct_vm.sender = direct_charlie
    chid1 = contract.submit_challenge(cid, "Charlie challenge reason", ["https://charlie.example.org/proof"])
    assert chid1 == 1

    # Account 3 submits challenge 2 (cap = 3)
    direct_vm.sender = direct_accounts[3]
    chid2 = contract.submit_challenge(cid, "Third challenge", ["https://three.example.org/proof"])
    assert chid2 == 2

    # Account 4 fails on cap
    direct_vm.sender = direct_accounts[4]
    with pytest.raises(Exception, match="Maximum challenge count reached"):
        contract.submit_challenge(cid, "Fourth challenge", ["https://four.example.org/proof"])

    # Challenge past challenge_deadline fails
    direct_vm.warp("2026-08-22T13:00:02Z")
    direct_vm.sender = direct_accounts[5]
    with pytest.raises(Exception, match="Challenge deadline has passed"):
        contract.submit_challenge(cid, "Late challenge", ["https://five.example.org/proof"])


def test_13_challenge_evidence_availability(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.check_pickling = True
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-08-22T10:00:00Z")
    contract = direct_deploy(CONTRACT_PATH)

    now_ts = 1787392800
    cid = contract.create_case(CONTENT_URL, SNAPSHOT_HASH, now_ts + 3600, 7200)
    contract.submit_note(cid, "Note 0", [NOTE_0_URL])

    direct_vm.warp("2026-08-22T11:00:01Z")
    contract.lock_case(cid)

    _setup_base_web_mocks(direct_vm)
    llm_payload = {
        "notes": [{"note_id": 0, "relevance": 90, "source_quality": 85, "clarity": 85, "contradiction_risk": 10}],
        "rationale": "Provisional winner.",
    }
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(llm_payload))
    contract.evaluate_case(cid)

    # Bob submits challenge
    direct_vm.sender = direct_bob
    contract.submit_challenge(cid, "Reason", [CHALLENGE_URL])

    # Warp past deadline
    direct_vm.warp("2026-08-22T13:00:02Z")

    # 1. Challenge URL fails / returns empty -> resolve_challenges fails safely
    direct_vm.clear_mocks()
    _setup_base_web_mocks(direct_vm)
    direct_vm.mock_web(r".*reuters\.example\.org.*", {"status": 500, "body": ""})

    with pytest.raises(Exception, match="All challenge sources are unavailable"):
        contract.resolve_challenges(cid)

    case = json.loads(contract.get_case(cid))
    assert case["state"] == "CHALLENGE"

    # 2. Challenge URL succeeds -> resolve_challenges proceeds
    direct_vm.clear_mocks()
    _setup_base_web_mocks(direct_vm)
    direct_vm.mock_web(r".*reuters\.example\.org.*", {"status": 200, "body": CHALLENGE_BODY})
    llm_resolve = {
        "notes": [{"note_id": 0, "relevance": 90, "source_quality": 85, "clarity": 85, "contradiction_risk": 10}],
        "rationale": "Outcome unchanged.",
        "impactful_challenge_ids": [],
    }
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(llm_resolve))
    contract.resolve_challenges(cid)

    case_resolved = json.loads(contract.get_case(cid))
    assert case_resolved["state"] == "EVALUATED"


def test_14_zero_challenge_resolution_preserves_provisional(direct_vm, direct_deploy, direct_alice):
    direct_vm.check_pickling = True
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-08-22T10:00:00Z")
    contract = direct_deploy(CONTRACT_PATH)

    now_ts = 1787392800
    cid = contract.create_case(CONTENT_URL, SNAPSHOT_HASH, now_ts + 3600, 7200)
    contract.submit_note(cid, "Alice note", [NOTE_0_URL])

    direct_vm.warp("2026-08-22T11:00:01Z")
    contract.lock_case(cid)

    _setup_base_web_mocks(direct_vm)
    llm_payload = {
        "notes": [{"note_id": 0, "relevance": 90, "source_quality": 85, "clarity": 85, "contradiction_risk": 10}],
        "rationale": "Provisional winner.",
    }
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(llm_payload))
    contract.evaluate_case(cid)

    # Resolving before challenge deadline fails
    with pytest.raises(Exception, match="Challenge deadline has not passed yet"):
        contract.resolve_challenges(cid)

    # Warp past challenge deadline
    direct_vm.warp("2026-08-22T13:00:02Z")

    # Resolve with 0 challenges -> copies provisional results
    contract.resolve_challenges(cid)

    case = json.loads(contract.get_case(cid))
    assert case["state"] == "EVALUATED"
    assert case["final_selected_note_id"] == case["provisional_selected_note_id"]
    assert case["final_display_consequence"] == case["provisional_display_consequence"]
    assert case["final_rationale_digest"] == case["provisional_rationale_digest"]
    assert case["final_scores"] == case["provisional_scores"]
    assert case["impactful_challenge_ids"] == []


def test_15_three_challenger_attribution_and_isolation(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    direct_vm.check_pickling = True
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-08-22T10:00:00Z")
    contract = direct_deploy(CONTRACT_PATH)

    now_ts = 1787392800
    cid = contract.create_case(CONTENT_URL, SNAPSHOT_HASH, now_ts + 3600, 7200)

    # Note 0 from Alice
    direct_vm.sender = direct_alice
    contract.submit_note(cid, "Note 0 from Alice", [NOTE_0_URL])

    # Note 1 from Bob
    direct_vm.sender = direct_bob
    contract.submit_note(cid, "Note 1 from Bob", [NOTE_1_URL])

    direct_vm.warp("2026-08-22T11:00:01Z")
    contract.lock_case(cid)

    _setup_base_web_mocks(direct_vm)

    # Provisional evaluation: Note 0 (Alice) wins
    llm_provisional = {
        "notes": [
            {"note_id": 0, "relevance": 90, "source_quality": 85, "clarity": 85, "contradiction_risk": 5},
            {"note_id": 1, "relevance": 70, "source_quality": 70, "clarity": 70, "contradiction_risk": 10},
        ],
        "rationale": "Note 0 wins provisionally.",
    }
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(llm_provisional))
    contract.evaluate_case(cid)

    # 3 Challengers submit challenges:
    # Challenger 0: Bob (Note 1 author, files challenge 0)
    direct_vm.sender = direct_bob
    contract.submit_challenge(cid, "Bob challenge reason", ["https://bob.example.org/c0"])

    # Challenger 1: Charlie (files challenge 1 with decisive restatement proof)
    direct_vm.sender = direct_charlie
    contract.submit_challenge(cid, "Charlie restatement proof", [CHALLENGE_URL])

    # Challenger 2: Account 3 (files challenge 2 with irrelevant comments)
    direct_vm.sender = direct_accounts[3]
    contract.submit_challenge(cid, "Account 3 minor remark", ["https://acc3.example.org/c2"])

    direct_vm.warp("2026-08-22T13:00:02Z")

    # Mock web pages for challenges
    direct_vm.mock_web(r".*bob\.example\.org/c0.*", {"status": 200, "body": "Generic note comments"})
    direct_vm.mock_web(r".*reuters\.example\.org.*", {"status": 200, "body": CHALLENGE_BODY})
    direct_vm.mock_web(r".*acc3\.example\.org/c2.*", {"status": 200, "body": "Minor formatting comments"})

    # Final re-evaluation: Note 0 contradiction_risk rises, Note 1 (Bob) wins!
    # Only Challenge 1 (Charlie) is impactful!
    llm_final = {
        "notes": [
            {"note_id": 0, "relevance": 50, "source_quality": 40, "clarity": 70, "contradiction_risk": 80},
            {"note_id": 1, "relevance": 85, "source_quality": 85, "clarity": 85, "contradiction_risk": 5},
        ],
        "rationale": "Challenge 1 proved restatement; Note 1 is new winner.",
        "impactful_challenge_ids": [1],
    }
    direct_vm.clear_mocks()
    _setup_base_web_mocks(direct_vm)
    direct_vm.mock_web(r".*bob\.example\.org/c0.*", {"status": 200, "body": "Generic note comments"})
    direct_vm.mock_web(r".*reuters\.example\.org.*", {"status": 200, "body": CHALLENGE_BODY})
    direct_vm.mock_web(r".*acc3\.example\.org/c2.*", {"status": 200, "body": "Minor formatting comments"})
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(llm_final))

    contract.resolve_challenges(cid)

    case_resolved = json.loads(contract.get_case(cid))
    assert case_resolved["state"] == "EVALUATED"
    assert case_resolved["final_selected_note_id"] == 1
    assert case_resolved["impactful_challenge_ids"] == [1]

    # Finalize case
    contract.finalize_case(cid)

    # Reputation assertions:
    # 1. Bob (winning author of Note 1) gets +2 for DISPLAY
    assert contract.get_reputation(direct_bob) == 2
    # 2. Charlie (Challenger 1, ONLY impactful challenge) gets +1
    assert contract.get_reputation(direct_charlie) == 1
    # 3. Account 3 (Challenger 2, non-impactful) gets 0
    assert contract.get_reputation(direct_accounts[3]) == 0
    # 4. Alice (provisional winner who lost final) gets 0
    assert contract.get_reputation(direct_alice) == 0


def test_15b_challenge_resolution_canonicalization_and_consensus_validation(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    direct_vm.check_pickling = True
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-08-22T10:00:00Z")
    contract = direct_deploy(CONTRACT_PATH)

    now_ts = 1787392800
    cid = contract.create_case(CONTENT_URL, SNAPSHOT_HASH, now_ts + 3600, 7200)

    # Note 0 from Alice
    contract.submit_note(cid, "Alice Note 0", [NOTE_0_URL])
    # Note 1 from Bob
    direct_vm.sender = direct_bob
    contract.submit_note(cid, "Bob Note 1", [NOTE_1_URL])

    direct_vm.warp("2026-08-22T11:00:01Z")
    direct_vm.sender = direct_alice
    contract.lock_case(cid)

    _setup_base_web_mocks(direct_vm)
    llm_provisional = {
        "notes": [
            {"note_id": 0, "relevance": 90, "source_quality": 85, "clarity": 85, "contradiction_risk": 5},
            {"note_id": 1, "relevance": 70, "source_quality": 70, "clarity": 70, "contradiction_risk": 10},
        ],
        "rationale": "Note 0 provisional winner.",
    }
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(llm_provisional))
    contract.evaluate_case(cid)

    # Bob files challenge 0, Charlie files challenge 1
    direct_vm.sender = direct_bob
    contract.submit_challenge(cid, "Bob challenge 0", [CHALLENGE_URL])
    direct_vm.sender = direct_charlie
    contract.submit_challenge(cid, "Charlie challenge 1", ["https://charlie.example.org/c1"])

    direct_vm.warp("2026-08-22T13:00:02Z")

    # 1. Malformed, duplicate and out-of-range IDs fail closed
    invalid_payloads = [
        ({"impactful_challenge_ids": "not_a_list"}, "must be a list"),
        ({"impactful_challenge_ids": [True]}, "must be an integer"),
        ({"impactful_challenge_ids": ["0"]}, "must be an integer"),
        ({"impactful_challenge_ids": [-1]}, "Invalid challenge ID"),
        ({"impactful_challenge_ids": [5]}, "Invalid challenge ID"),
        ({"impactful_challenge_ids": [0, 0]}, "Duplicate challenge ID"),
    ]
    for bad_extra, expected_error in invalid_payloads:
        bad_llm = {
            "notes": [
                {"note_id": 0, "relevance": 90, "source_quality": 85, "clarity": 85, "contradiction_risk": 5},
                {"note_id": 1, "relevance": 70, "source_quality": 70, "clarity": 70, "contradiction_risk": 10},
            ],
            "rationale": "Testing malformed impactful IDs.",
            **bad_extra,
        }
        direct_vm.clear_mocks()
        _setup_base_web_mocks(direct_vm)
        direct_vm.mock_web(r".*reuters\.example\.org.*", {"status": 200, "body": CHALLENGE_BODY})
        direct_vm.mock_web(r".*charlie\.example\.org/c1.*", {"status": 200, "body": "Proof"})
        direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(bad_llm))
        with pytest.raises(Exception, match=expected_error):
            contract.resolve_challenges(cid)

    # 2. Unchanged outcome with valid bounded IDs canonicalizes safely to []
    unchanged_llm_with_ids = {
        "notes": [
            {"note_id": 0, "relevance": 90, "source_quality": 85, "clarity": 85, "contradiction_risk": 5},
            {"note_id": 1, "relevance": 70, "source_quality": 70, "clarity": 70, "contradiction_risk": 10},
        ],
        "rationale": "Note 0 remains winner despite challenge evidence.",
        "impactful_challenge_ids": [0, 1],
    }
    direct_vm.clear_mocks()
    _setup_base_web_mocks(direct_vm)
    direct_vm.mock_web(r".*reuters\.example\.org.*", {"status": 200, "body": CHALLENGE_BODY})
    direct_vm.mock_web(r".*charlie\.example\.org/c1.*", {"status": 200, "body": "Proof"})
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(unchanged_llm_with_ids))

    contract.resolve_challenges(cid)
    case_resolved = json.loads(contract.get_case(cid))
    assert case_resolved["state"] == "EVALUATED"
    assert case_resolved["final_selected_note_id"] == 0
    assert case_resolved["final_display_consequence"] == "DISPLAY"
    assert case_resolved["impactful_challenge_ids"] == []

    # 3. Validator accepts equivalent canonical unchanged results
    # (Validator returns [] while leader had [0, 1] canonicalized to [])
    val_unchanged_llm = {
        "notes": [
            {"note_id": 0, "relevance": 90, "source_quality": 85, "clarity": 85, "contradiction_risk": 5},
            {"note_id": 1, "relevance": 70, "source_quality": 70, "clarity": 70, "contradiction_risk": 10},
        ],
        "rationale": "Validator agrees note 0 is winner.",
        "impactful_challenge_ids": [],
    }
    direct_vm.clear_mocks()
    _setup_base_web_mocks(direct_vm)
    direct_vm.mock_web(r".*reuters\.example\.org.*", {"status": 200, "body": CHALLENGE_BODY})
    direct_vm.mock_web(r".*charlie\.example\.org/c1.*", {"status": 200, "body": "Proof"})
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(val_unchanged_llm))
    assert direct_vm.run_validator() is True


def test_15c_challenge_resolution_validator_disagreements_fail_closed(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    direct_vm.check_pickling = True
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-08-22T10:00:00Z")
    contract = direct_deploy(CONTRACT_PATH)

    now_ts = 1787392800
    cid = contract.create_case(CONTENT_URL, SNAPSHOT_HASH, now_ts + 3600, 7200)
    contract.submit_note(cid, "Alice Note 0", [NOTE_0_URL])
    direct_vm.sender = direct_bob
    contract.submit_note(cid, "Bob Note 1", [NOTE_1_URL])

    direct_vm.warp("2026-08-22T11:00:01Z")
    direct_vm.sender = direct_alice
    contract.lock_case(cid)

    _setup_base_web_mocks(direct_vm)
    llm_provisional = {
        "notes": [
            {"note_id": 0, "relevance": 90, "source_quality": 85, "clarity": 85, "contradiction_risk": 5},
            {"note_id": 1, "relevance": 70, "source_quality": 70, "clarity": 70, "contradiction_risk": 10},
        ],
        "rationale": "Note 0 provisional winner.",
    }
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(llm_provisional))
    contract.evaluate_case(cid)

    # Bob files challenge 0, Charlie files challenge 1
    direct_vm.sender = direct_bob
    contract.submit_challenge(cid, "Bob challenge 0", [CHALLENGE_URL])
    direct_vm.sender = direct_charlie
    contract.submit_challenge(cid, "Charlie challenge 1", ["https://charlie.example.org/c1"])

    direct_vm.warp("2026-08-22T13:00:02Z")

    # Leader produces changed outcome: Note 1 wins with impactful_challenge_ids [1, 0] (unsorted in JSON)
    leader_llm = {
        "notes": [
            {"note_id": 0, "relevance": 50, "source_quality": 40, "clarity": 70, "contradiction_risk": 80},
            {"note_id": 1, "relevance": 85, "source_quality": 85, "clarity": 85, "contradiction_risk": 5},
        ],
        "rationale": "Note 1 wins due to challenges 0 and 1.",
        "impactful_challenge_ids": [1, 0],
    }
    direct_vm.clear_mocks()
    _setup_base_web_mocks(direct_vm)
    direct_vm.mock_web(r".*reuters\.example\.org.*", {"status": 200, "body": CHALLENGE_BODY})
    direct_vm.mock_web(r".*charlie\.example\.org/c1.*", {"status": 200, "body": "Proof"})
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(leader_llm))
    contract.resolve_challenges(cid)

    # Prove changed outcome retains sorted validated impactful IDs: [0, 1]
    case_resolved = json.loads(contract.get_case(cid))
    assert case_resolved["final_selected_note_id"] == 1
    assert case_resolved["impactful_challenge_ids"] == [0, 1]

    # 1. Validator disagrees on winner (Validator says Note 0 wins) -> False
    val_disagree_winner = {
        "notes": [
            {"note_id": 0, "relevance": 90, "source_quality": 85, "clarity": 85, "contradiction_risk": 5},
            {"note_id": 1, "relevance": 70, "source_quality": 70, "clarity": 70, "contradiction_risk": 10},
        ],
        "rationale": "Validator thinks Note 0 still wins.",
        "impactful_challenge_ids": [],
    }
    direct_vm.clear_mocks()
    _setup_base_web_mocks(direct_vm)
    direct_vm.mock_web(r".*reuters\.example\.org.*", {"status": 200, "body": CHALLENGE_BODY})
    direct_vm.mock_web(r".*charlie\.example\.org/c1.*", {"status": 200, "body": "Proof"})
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(val_disagree_winner))
    assert direct_vm.run_validator() is False

    # 2. Validator disagrees on consequence (Validator says DISPLAY_WITH_WARNING) -> False
    val_disagree_consequence = {
        "notes": [
            {"note_id": 0, "relevance": 50, "source_quality": 40, "clarity": 70, "contradiction_risk": 80},
            {"note_id": 1, "relevance": 60, "source_quality": 55, "clarity": 60, "contradiction_risk": 10},
        ],
        "rationale": "Validator scores Note 1 lower so consequence is DISPLAY_WITH_WARNING.",
        "impactful_challenge_ids": [0, 1],
    }
    direct_vm.clear_mocks()
    _setup_base_web_mocks(direct_vm)
    direct_vm.mock_web(r".*reuters\.example\.org.*", {"status": 200, "body": CHALLENGE_BODY})
    direct_vm.mock_web(r".*charlie\.example\.org/c1.*", {"status": 200, "body": "Proof"})
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(val_disagree_consequence))
    assert direct_vm.run_validator() is False

    # 3. Validator disagrees on impactful challenge IDs for changed outcome (Validator says [0] instead of [0, 1]) -> False
    val_disagree_impactful_ids = {
        "notes": [
            {"note_id": 0, "relevance": 50, "source_quality": 40, "clarity": 70, "contradiction_risk": 80},
            {"note_id": 1, "relevance": 85, "source_quality": 85, "clarity": 85, "contradiction_risk": 5},
        ],
        "rationale": "Validator thinks only challenge 0 was impactful.",
        "impactful_challenge_ids": [0],
    }
    direct_vm.clear_mocks()
    _setup_base_web_mocks(direct_vm)
    direct_vm.mock_web(r".*reuters\.example\.org.*", {"status": 200, "body": CHALLENGE_BODY})
    direct_vm.mock_web(r".*charlie\.example\.org/c1.*", {"status": 200, "body": "Proof"})
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(val_disagree_impactful_ids))
    assert direct_vm.run_validator() is False


def test_16_finalize_transitions_and_exactly_once_reputation(direct_vm, direct_deploy, direct_alice):
    direct_vm.check_pickling = True
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-08-22T10:00:00Z")
    contract = direct_deploy(CONTRACT_PATH)

    now_ts = 1787392800
    cid = contract.create_case(CONTENT_URL, SNAPSHOT_HASH, now_ts + 3600, 7200)
    contract.submit_note(cid, "Note with warning level scores", [NOTE_0_URL])

    # Finalize while OPEN fails
    with pytest.raises(Exception, match="EVALUATED state"):
        contract.finalize_case(cid)

    direct_vm.warp("2026-08-22T11:00:01Z")
    contract.lock_case(cid)

    # Finalize while LOCKED fails
    with pytest.raises(Exception, match="EVALUATED state"):
        contract.finalize_case(cid)

    _setup_base_web_mocks(direct_vm)
    # Total 6000 (DISPLAY_WITH_WARNING)
    llm_payload = {
        "notes": [{"note_id": 0, "relevance": 55, "source_quality": 55, "clarity": 55, "contradiction_risk": 5}],
        "rationale": "Warning level note.",
    }
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(llm_payload))
    contract.evaluate_case(cid)

    # Finalize while CHALLENGE fails (before resolve_challenges)
    with pytest.raises(Exception, match="EVALUATED state"):
        contract.finalize_case(cid)

    direct_vm.warp("2026-08-22T13:00:02Z")
    contract.resolve_challenges(cid)

    # Finalize succeeds
    contract.finalize_case(cid)

    case = json.loads(contract.get_case(cid))
    assert case["state"] == "FINALIZED"
    assert contract.get_reputation(direct_alice) == 1  # +1 for DISPLAY_WITH_WARNING

    # Repeated finalize fails and does NOT double-credit
    with pytest.raises(Exception, match="EVALUATED state"):
        contract.finalize_case(cid)

    assert contract.get_reputation(direct_alice) == 1


def test_17_safe_failure_state_and_reputation_byte_for_byte_unchanged(
    direct_vm, direct_deploy, direct_alice
):
    direct_vm.check_pickling = True
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-08-22T10:00:00Z")
    contract = direct_deploy(CONTRACT_PATH)

    now_ts = 1787392800
    cid = contract.create_case(CONTENT_URL, SNAPSHOT_HASH, now_ts + 3600, 7200)
    contract.submit_note(cid, "Alice note", [NOTE_0_URL])

    direct_vm.warp("2026-08-22T11:00:01Z")
    contract.lock_case(cid)

    case_snapshot_before = contract.get_case(cid)
    rep_alice_before = contract.get_reputation(direct_alice)

    # 1. Dead content URL
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*example\.com/posts/fact-check-target.*", {"status": 500, "body": ""})
    with pytest.raises(Exception, match="Failed to fetch content URL|empty or invalid|Snapshot hash mismatch"):
        contract.evaluate_case(cid)

    assert contract.get_case(cid) == case_snapshot_before
    assert contract.get_reputation(direct_alice) == rep_alice_before

    # 2. Snapshot hash mismatch
    direct_vm.clear_mocks()
    _setup_base_web_mocks(direct_vm, content_body="Mismatched content body")
    with pytest.raises(Exception, match="Snapshot hash mismatch"):
        contract.evaluate_case(cid)

    assert contract.get_case(cid) == case_snapshot_before
    assert contract.get_reputation(direct_alice) == rep_alice_before

    # 3. Malformed LLM response
    direct_vm.clear_mocks()
    _setup_base_web_mocks(direct_vm)
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", "Invalid non-json syntax {[[")
    with pytest.raises(Exception, match="not valid JSON"):
        contract.evaluate_case(cid)

    assert contract.get_case(cid) == case_snapshot_before
    assert contract.get_reputation(direct_alice) == rep_alice_before


def test_18_constructor_registers_deployer_in_root_upgraders_slot(
    direct_vm, direct_deploy, direct_alice
):
    direct_vm.check_pickling = True
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-08-22T10:00:00Z")
    contract = direct_deploy(CONTRACT_PATH)

    from genlayer import gl

    root = gl.storage.Root.get()
    upgraders = list(root.upgraders.get())
    assert len(upgraders) == 1
    assert upgraders[0].as_bytes == direct_alice
    assert upgraders[0].as_hex.lower() == "0x" + direct_alice.hex().lower()


def test_19_upgrade_method_mutates_root_code_slot_bytes(
    direct_vm, direct_deploy, direct_alice
):
    direct_vm.check_pickling = True
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-08-22T10:00:00Z")
    contract = direct_deploy(CONTRACT_PATH)

    from genlayer import gl

    rehearsal_code = b"# minimal rehearsal upgrade payload for community note display council v2\n"
    contract.upgrade(rehearsal_code)

    assert bytes(gl.storage.Root.get().code.get()) == rehearsal_code


def test_20_root_slot_and_domain_storage_coexist_without_layout_drift(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    direct_vm.check_pickling = True
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-08-22T10:00:00Z")
    contract = direct_deploy(CONTRACT_PATH)

    now_ts = 1787392800
    cid = contract.create_case(CONTENT_URL, SNAPSHOT_HASH, now_ts + 3600, 7200)

    direct_vm.sender = direct_alice
    contract.submit_note(cid, "Alice note", [NOTE_0_URL])
    direct_vm.sender = direct_bob
    contract.submit_note(cid, "Bob note", [NOTE_1_URL])

    direct_vm.warp("2026-08-22T11:00:01Z")
    direct_vm.sender = direct_alice
    contract.lock_case(cid)

    _setup_base_web_mocks(direct_vm)
    llm_payload = {
        "notes": [
            {"note_id": 0, "relevance": 90, "source_quality": 85, "clarity": 85, "contradiction_risk": 5},
            {"note_id": 1, "relevance": 70, "source_quality": 70, "clarity": 70, "contradiction_risk": 10},
        ],
        "rationale": "Note 0 wins provisionally.",
    }
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(llm_payload))
    contract.evaluate_case(cid)

    # Bob submits challenge
    direct_vm.sender = direct_bob
    contract.submit_challenge(cid, "Bob challenge reason", [CHALLENGE_URL])

    direct_vm.warp("2026-08-22T13:00:02Z")
    direct_vm.clear_mocks()
    _setup_base_web_mocks(direct_vm)
    direct_vm.mock_web(r".*reuters\.example\.org.*", {"status": 200, "body": CHALLENGE_BODY})
    llm_resolve = {
        "notes": [
            {"note_id": 0, "relevance": 90, "source_quality": 85, "clarity": 85, "contradiction_risk": 5},
            {"note_id": 1, "relevance": 70, "source_quality": 70, "clarity": 70, "contradiction_risk": 10},
        ],
        "rationale": "Outcome unchanged.",
        "impactful_challenge_ids": [],
    }
    direct_vm.mock_llm(r"(?s).*objective evaluation council.*", json.dumps(llm_resolve))
    direct_vm.sender = direct_alice
    contract.resolve_challenges(cid)

    contract.finalize_case(cid)

    # Snapshot all storage state prior to upgrade
    case_count_before = contract.get_case_count()
    case_before = contract.get_case(cid)
    note_count_before = contract.get_note_count(cid)
    note_0_before = contract.get_note(cid, 0)
    note_1_before = contract.get_note(cid, 1)
    challenge_count_before = contract.get_challenge_count(cid)
    challenge_0_before = contract.get_challenge(cid, 0)
    rep_alice_before = contract.get_reputation(direct_alice)
    rep_bob_before = contract.get_reputation(direct_bob)

    # Execute upgrade
    from genlayer import gl

    v2_payload = b"# community note display council v2 bytecode payload\n"
    direct_vm.sender = direct_alice
    contract.upgrade(v2_payload)

    # Assert Root Slot code was updated
    assert bytes(gl.storage.Root.get().code.get()) == v2_payload

    # Assert all domain storage fields are preserved and unaffected by Root Slot code mutation
    assert contract.get_case_count() == case_count_before
    assert contract.get_case(cid) == case_before
    assert contract.get_note_count(cid) == note_count_before
    assert contract.get_note(cid, 0) == note_0_before
    assert contract.get_note(cid, 1) == note_1_before
    assert contract.get_challenge_count(cid) == challenge_count_before
    assert contract.get_challenge(cid, 0) == challenge_0_before
    assert contract.get_reputation(direct_alice) == rep_alice_before
    assert contract.get_reputation(direct_bob) == rep_bob_before

    # Verify domain operations continue to function normally
    now_ts_2 = 1787403602
    cid2 = contract.create_case("https://example.com/posts/case-2", SNAPSHOT_HASH, now_ts_2 + 3600, 7200)
    assert cid2 == 2
    assert contract.get_case_count() == 2
    contract.submit_note(cid2, "Post-upgrade note", [NOTE_0_URL])
    assert contract.get_note_count(cid2) == 1
