# Community Note Display Council Verification

Status: in progress. This document records attempted Studionet cases; failed attempts are retained and never counted as successful journeys.

## Release boundary

- Network: GenLayer Studionet (chain ID `61999`)
- RPC: `https://studio.genlayer.com/api`
- Contract: `0x5971D0c80Ae1F57497Cc30Ad0f5e0A86e47D0AB1`
- Deployment transaction: `0xf7d7553ae5dc0eca705687aab49a5024c10a92d971e7cf431392cb0711db9910`
- Deployed source commit: `b6f28eda2e515236384cac24c18f8038f1a2c093`
- Deployed source SHA-256: `8a96e546e485b3dd4b34750f1b15ae58a2f7937187f1d3135bc8ee8e11e2a0d5`
- Locked deployer/upgrader: `0x277bF20771129ae224042d23b0311C1AC5a9AC1b`
- Deployment evidence: `FINALIZED`, execution `SUCCESS`, consensus `Accepted`; deployed-code readback matched the source hash.

## Live evidence ledger

| ID | Purpose | Actor | Method / arguments | Transaction | Terminal evidence | Authoritative readback | Result |
|---|---|---|---|---|---|---|---|
| DEP-01 | Exact-source release deployment | `0x277b...AC1b` deployer/upgrader | Deploy exact reviewed source | `0xf7d7553ae5dc0eca705687aab49a5024c10a92d971e7cf431392cb0711db9910` | `FINALIZED / SUCCESS / Accepted` | Code SHA-256 `8a96...a0d5`; `get_case_count=0`; initial reputation `0` | PASS |
| CASE-01A | Reject expired-at-execution case creation | `0x277b...AC1b` creator | `create_case(https://example.com/community-note-release-1, b*64, 1787345800, 3600)` | `0x7bf63c57ffadf3c8a5d1f40b27647f2aef03ca34b23c29a8670415940c649ca6` | `FINALIZED / rollback` | Case count remained `0`; case `1` absent | PASS (expected rejection) |
| CASE-01B | Create valid release case | `0x277b...AC1b` creator | `create_case(https://example.com/community-note-release-1, b*64, 1787350000, 3600)` | `0x43b1991a64eff9b10385358d06b1b475ec757cf026b487fb8d59546760a10e3b` | `FINALIZED / return` | Case count `1`; case `1` `OPEN`; all supplied fields matched | PASS |
| NOTE-01 | Submit candidate note | `0x277b...AC1b` note author | `submit_note(1, The source article provides the central claim and enough context for community review., [https://example.com/community-note-source-1])` | `0x335075cb9477f393688a3a4eaac6749f093a1169b4edcbe8576f6a9dbd134f33` | `FINALIZED / return` | Note count `1`; note `0` text, URL, author and digest matched; case remained `OPEN` | PASS |
| LOCK-01A | Reject lock before deadline | `0x277b...AC1b` caller | `lock_case(1)` | `0x8a7ab859cfecdf626c6e3d6cf0f993435fc38a0f1e0ef704e85986fbebc94188` | `FINALIZED / rollback` | Case remained `OPEN`; note state unchanged | PASS (expected rejection) |
| LOCK-01B | Repeated pre-deadline rejection | `0x277b...AC1b` caller | `lock_case(1)` | `0x47f0591d0afd076b777b607f5b41b479d4ae11dd578b4cdeb78e0142a2a7d954` | `FINALIZED / rollback` | Case remained `OPEN`; no state drift | PASS (expected rejection) |
| LOCK-01C | Permissionless post-deadline lock | `0x34b9...9D78` Codex-browser Studio account | `lock_case(1)` | `0xdbbbecc67626c0a38cbeaf2918f367b97b7b48882ff9f9100da7b9b798272005` | `FINALIZED / SUCCESS / leader return` | Case `1` changed `OPEN -> LOCKED`; `locked_at=1787465787`; note unchanged | PASS |
| EVAL-01A | Fail safely when evidence URL cannot be fetched | `0x34b9...9D78` Codex-browser Studio account | `evaluate_case(1)` | `0x103d9cf0cb2b073083473dd0f04756f936ba7381e72f34f9f6284d0d443941f8` | `FINALIZED / ERROR / leader rollback`; HTTP `404` while fetching the content URL | Case `1` remained `LOCKED`; no provisional result or state mutation | PASS (expected safe failure) |
| CASE-02 | Create fetchable-evidence happy-path case | `0x34b9...9D78` Codex-browser Studio account | `create_case(https://example.com/, 13f5...25c, 1787466267, 3600)` | `0xf86fc2bbc416c0d981a10b9a767d7d052e12a430371c620e16f713ad51b89ef6` | `FINALIZED / SUCCESS / leader return` | Case count `2`; case `2` `OPEN`; URL, SHA-256 snapshot, deadline and challenge window matched | PASS |
| NOTE-02 | Submit note for happy-path case | `0x34b9...9D78` Codex-browser Studio account | `submit_note(2, This note explains that Example Domain is reserved for documentation examples and should not be used for operational claims., [https://example.com/])` | `0xc2bd23530b5397f108b4efc095356cc2c6d7d62928024e8f77080ed1e92aef42` | `FINALIZED / SUCCESS / MAJORITY_AGREE`; 3 agree, 2 idle | Note count `1`; note `0` author/text/source/digest matched; case `2` remained `OPEN` | PASS |
| LOCK-02 | Lock happy-path case after deadline | `0x34b9...9D78` Codex-browser Studio account | `lock_case(2)` | `0x945bb94455809cd22cfccf3772c488998a3102cd8f4caaaa2ed92a5c5c589f4a` | `FINALIZED / SUCCESS / MAJORITY_AGREE`; leader return | Case `2` changed `OPEN -> LOCKED`; `locked_at=1787468846`; note count remained `1` | PASS |
| EVAL-02 | Consensus evaluation of fetchable evidence | `0x34b9...9D78` Codex-browser Studio account | `evaluate_case(2)` | `0x6ddf816368841ea1006398785d84ff56ab3ca75f47fb0330aefaef9c646c39aa` | `FINALIZED / SUCCESS / MAJORITY_AGREE` after 3 rounds and 2 rotations; leader return | Case `2` changed `LOCKED -> CHALLENGE`; selected note `0`; consequence `DISPLAY`; score `9900`; rationale digest set; challenge deadline `1787472512` | PASS |
| CHAL-02A | Submit independent challenge | `0x22A2...2FB1` Codex-browser Studio account | `submit_challenge(2, The selected note may overstate how the page should be interpreted because the page only describes the reserved documentation purpose of Example Domain., [https://example.com/])` | `0x3ba626c147b8944ed8681ec1324acb490333ed5e19ce6f96743b5bf33e31e2ae` | `FINALIZED / SUCCESS / MAJORITY_AGREE`; leader return | Challenge count `1`; challenge `0` actor/reason/source matched; case remained `CHALLENGE` | PASS |
| CHAL-02B | Reject duplicate/replayed challenge from same actor | `0x22A2...2FB1` Codex-browser Studio account | Replay the exact `submit_challenge` arguments from CHAL-02A | `0x7fd916d2b837acb7d880c3cbb7800abfdef2537646830044fe54595e98a6cc4b` | `FINALIZED / ERROR / MAJORITY_AGREE`; leader rollback: `Sender has already submitted a challenge for this case` | Challenge count remained `1`; case remained `CHALLENGE` | PASS (expected rejection) |
| CHAL-02C | Reject malformed challenge source | `0xeF5D...5902` Codex-browser Studio account | `submit_challenge(2, Invalid source URL boundary test., [not-a-url])` | `0xffc30a97605bbb66b31e9fd4e83e1878d0ea5d26b45403f5ce88ed0483410381` | `FINALIZED / ERROR / MAJORITY_AGREE`; leader rollback: `Challenge sources must contain 10-600 characters` | Challenge count remained `1`; case remained `CHALLENGE` | PASS (expected rejection) |
| CHAL-02D | Submit second unique challenge | `0xeF5D...5902` Codex-browser Studio account | `submit_challenge(2, The note should explicitly distinguish documentation-only use from real-world operational use., [https://example.com/])` | `0x0f656e33d72222c5d677bd0f7b178f0a1389219c280a483778e173da7c7f4d3a` | `FINALIZED / SUCCESS / MAJORITY_AGREE`; leader return | Challenge count `2`; challenge `1` actor/reason/source matched | PASS |
| CHAL-02E | Submit third unique challenge and reach cap | `0x34b9...9D78` Codex-browser Studio account | `submit_challenge(2, The selected note should make clearer that Example Domain is intended for illustrative documentation examples., [https://example.com/])` | `0x5ce5a73616fe9361a557cad6b6311a3e8cd28d03085a92388e7ffc23e066d153` | `FINALIZED / SUCCESS / MAJORITY_AGREE`; leader return | Challenge count `3`; challenge `2` actor/reason/source matched | PASS |
| CHAL-02F | Reject fourth challenge at cap | `0xfd79...e0f2` Codex-browser Studio account | `submit_challenge(2, Fourth challenge should be rejected by the per-case challenge cap., [https://example.com/])` | `0x6346777a7759fa135abad6f710326ccbc89295649a1b3136b08372f81c078117` | `FINALIZED / ERROR / MAJORITY_AGREE`; leader rollback: `Maximum challenge count reached for this case` | Challenge count remained `3`; case remained `CHALLENGE` | PASS (expected rejection) |
| RESOLVE-02A | Reject resolution before challenge deadline | `0xfd79...e0f2` Codex-browser Studio account | `resolve_challenges(2)` | `0xcd7504bbcf7bb0d3e146969bb42afc4ecf361f2896afdce431f827ee74b841a8` | `FINALIZED / ERROR / MAJORITY_AGREE`; leader rollback: `Challenge deadline has not passed yet` | Case remained `CHALLENGE`; `resolved_at=0`; challenge count remained `3` | PASS (expected rejection) |
| RESOLVE-02B | First post-deadline consensus attempt | `0xfd79...e0f2` Codex-browser Studio account | `resolve_challenges(2)` | `0x6d656cf4fec7ee4e26b17545c61b4a033fce965aee9645f15d262c27a0770598` | `FINALIZED / MAJORITY_DISAGREE`; exhausted 4 proposing rounds; leader rollback | Case remained `CHALLENGE`; `resolved_at=0`; challenge and provisional state unchanged | RETAINED FAILED ATTEMPT (not PASS) |
| RESOLVE-02C | Second post-deadline consensus attempt | `0xfd79...e0f2` Codex-browser Studio account | `resolve_challenges(2)` | `0x3136d092bafe700f789749abff60145108d22de8de07e3db1b531f27a651a8a0` | `FINALIZED / MAJORITY_DISAGREE`; leader returned successfully but final votes were 2 agree / 3 disagree after 4 rounds | Case remained `CHALLENGE`; `resolved_at=0`; challenge and provisional state unchanged | RETAINED FAILED ATTEMPT (not PASS) |
| RESOLVE-02D | Bounded final post-deadline retry | `0xfd79...e0f2` Codex-browser Studio account | `resolve_challenges(2)` | `0xda4a47003a59135667ea20d896d39c46acf56825f6c2510563e874737eff8334` | `FINALIZED / MAJORITY_DISAGREE`; leader rollback: `Unchanged outcome cannot contain impactful challenge IDs`; final votes 3 disagree / 2 idle | Case remained `CHALLENGE`; `resolved_at=0`; challenge and provisional state unchanged | RETAINED FAILED ATTEMPT (not PASS) |

## Upgrade rehearsal

- Disposable contract: `0x590CdD262eD7446b97a8EC30E03c94350E636659`
- Deployment transaction: `0x3b8124bfe9c7a0d796bb63f494cd91ff269286986ab6afcc629fe25bab29550e`
- Seed-state transaction: `0xf159609ea20aca47275f19499ba92c2927a00c8679cb53092d1c95ab1e4c031a`
- Authorized V2 upgrade transaction: `0x05ac987f216ba361118ba9230e46951a39387ec144505fc543fed859927e76b5`
- V2 deployed-code SHA-256: `d4b5422978dfaae1af27ce67dc1d7518c4913f82e953779d3a34b95a19b7edee`
- Post-upgrade readback: `get_contract_version=v2.0.0`; case count and case `1` were unchanged byte-for-byte.
- Unauthorized V3 attempt: `0xa03b9e7cbc520a5bb6070ea1b04aa4aa1f58c1e85d71e650a5b78a6435f75d6d`, sent by `0xBf90Af1bc61314775d57B641b89c1f702a93b40D`.
- Unauthorized result: `FINALIZED / ERROR`, `SystemError: 6: forbidden`; V2 code hash, version, count, and case state remained unchanged.

## Pending release cases

The release matrix is not complete until post-deadline lock, evaluation, challenge/replay controls, challenge resolution, finalization, reputation, invalid-input/cap boundaries, safe evidence failure, and final Explorer/RPC reconciliation are recorded above. No pending row is a PASS.

## Resume checkpoint — 2026-08-23

- Studio/RPC rate-limit recovery: closed 29 unrelated editor tabs, retained only `community_note_display_council_release.py`, and restored all 20 hosted validators without changing source or on-chain state.
- Latest authoritative case `2` state: `CHALLENGE`; three challenges stored; challenge deadline `1787472512`; provisional note `0`, consequence `DISPLAY`, score `9900`.
- Latest attempted transaction: early `resolve_challenges(2)` negative control `0xcd7504bbcf7bb0d3e146969bb42afc4ecf361f2896afdce431f827ee74b841a8`, finalized rollback with no state drift.
- On-chain time observed at that terminal receipt: `1787469578`; happy-path resolution becomes eligible after `1787472512` (2,934 seconds later).
- Active Studio account at pause: `0xfd79e1773A558c21e496d587Fb66AA15e785e0f2` (Codex in-app browser only).
- Resume action: re-read case `2`; only when on-chain time is at or beyond `1787472512`, call `resolve_challenges(2)`, require terminal success and authoritative `EVALUATED` readback, then call `finalize_case(2)` and verify final fields plus all four actor reputation readbacks.
- Do not use the previously created SDK account for writes. Do not switch to Chrome or another wallet surface.

## Live defect checkpoint — 2026-08-23

- Three bounded post-deadline resolution attempts failed to reach consensus; no attempt mutated case `2`.
- Root cause observed in the exact deployed revision: the challenge-resolution prompt demonstrates non-empty `impactful_challenge_ids` even when the independently derived outcome can remain unchanged, while response validation rejects that combination. A leader that returned an otherwise valid unchanged result therefore rolled back; another valid leader result still failed validator agreement.
- Stop condition applied: do not spam or replay `resolve_challenges(2)`. Correct and locally verify the contract, obtain a new exact-revision `PRE_DEPLOY` approval, then use a replacement Studionet deployment and rerun the release matrix.
- The current release remains retained as failed live evidence and is not eligible for `POST_DEPLOY_TEST` approval, finalization, GitHub/Vercel release, or submission.
