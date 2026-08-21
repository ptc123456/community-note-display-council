# Community Note Display Council — Approved Specification

Status: `SPEC_APPROVED`
Submission category: `PROJECT`
Technical slug: `community-note-display-council`
Network: Studionet only

## 1. Locked product baseline

Build an end-to-end GenLayer dApp that ranks competing community-note candidates for one public content snapshot, decides whether a note should be displayed, and updates non-transferable, app-local author reputation only after finalization.

The authoritative state flow is:

`OPEN -> LOCKED -> EVALUATED -> CHALLENGE -> FINALIZED`

The three final display consequences are `DISPLAY`, `DISPLAY_WITH_WARNING`, and `NO_NOTE`. The system is contextual evidence ranking, not a universal truth oracle, censorship authority, or real-world identity/reputation system.

## 2. Six trust answers

1. Actors and manipulation risk: a case creator may frame a content snapshot; note authors may promote their own note and sources; challengers may submit adversarial evidence; no one of them may choose the winning note or final display consequence.
2. Consensus-critical decision: rank all eligible notes against the same immutable content snapshot and rubric, select at most one note, and determine the normalized display consequence.
3. Consequence: persist the selected note ID, display consequence, bounded score breakdown, rationale digest, final case state, and app-local reputation updates.
4. Bound evidence: canonical content URL plus declared SHA-256 snapshot digest; bounded note text and public source URLs frozen before evaluation; bounded challenge reason and public source URLs frozen before re-evaluation; all evidence is tied to one case and submission index.
5. Why no single actor decides: every interested actor can influence inputs, while GenLayer validators independently fetch and assess the same frozen evidence and must agree on the selected note and display consequence.
6. Safe insufficiency result: unavailable, digest-mismatched, malformed, or insufficient evidence and validator disagreement leave the case retryable without selecting a note, finalizing, or updating reputation.

## 3. Actors and authorization

- Case creator: any address; creates only the case and cannot choose the verdict, winner, or reputation result.
- Note author: submission sender; one note per address per case.
- Challenger: any address; one challenge per address per case, subject to the global challenge cap.
- Evaluator/finalizer trigger: permissionless after the applicable deterministic phase/deadline checks.
- Contract: sole authority for phase transitions, selected note, display consequence, and reputation.

No admin override, unilateral verdict method, hidden moderation key, value custody, token, stake, payout, or transferable reputation is in scope.

## 4. Deterministic bounds

- Maximum notes per case: 5.
- Note text: 1–600 UTF-8 characters.
- Source URLs per note: 1–3; HTTPS only; bounded length; normalized and deduplicated.
- Challenges per case: maximum 3; one per address.
- Challenge reason: 1–300 UTF-8 characters.
- Source URLs per challenge: 1–3 with the same URL controls.
- Content URL: one HTTPS canonical URL.
- Snapshot digest: exactly 32-byte SHA-256 represented in the public API using the current supported bytes/string form verified before implementation.
- Deadlines: submission and challenge deadlines are immutable per case, ordered strictly, and enforced by contract-supported time semantics verified against the current runtime.
- Duplicate note: reject equal normalized text digest within a case.
- All caps and lengths are constructor/config constants recorded in views; no mutable policy system in the MVP.

## 5. State machine

### OPEN

Create case and accept bounded note submissions until the submission deadline or cap. Reaching the cap does not permit early unilateral evaluation; locking is permissionless only once the deadline is reached.

### LOCKED

No more notes. A permissionless evaluation call fetches the frozen content and note sources, validates the content snapshot digest, runs the rubric, and attempts consensus.

### EVALUATED

Persist the provisional selected note, display consequence, score breakdown, and rationale digest. Reputation is unchanged.

### CHALLENGE

The phase opens immediately after a successful provisional evaluation. Accept bounded challenges until the immutable challenge deadline. A permissionless resolution call re-evaluates the complete frozen note set together with every valid challenge source. Zero challenges preserve the provisional result after the window; one or more challenges require the same substantive consensus standard for the final result.

### FINALIZED

Persist the final result exactly once and update reputation exactly once. No later evidence, challenge, evaluation, or mutation is accepted.

## 6. Rubric, consequence, and tie-break

Each note receives integer fields from 0–100:

- relevance;
- source quality;
- clarity;
- contradiction risk, where higher is worse.

Deterministic total:

`35% relevance + 35% source quality + 20% clarity + 10% (100 - contradiction risk)`

Decision bands:

- `DISPLAY`: winning total >= 75 and source quality >= 60.
- `DISPLAY_WITH_WARNING`: winning total >= 55 but the `DISPLAY` conditions are not met.
- `NO_NOTE`: no eligible note reaches 55 or evidence is substantively insufficient.

Tie-break order: higher total, higher source quality, higher relevance, higher clarity, lower contradiction risk, then lower immutable submission index.

Consensus must independently rederive and agree on the exact selected note ID (or none) and normalized display consequence. Schema, ranges, arithmetic, or rationale shape alone never constitute consensus. Score tolerance is allowed only when it cannot change the winner, tie-break order, or decision band. Tests cover below/exactly-on/above each threshold and score-drift cases that would change the winner.

## 7. Evidence and AI safety

- Treat fetched pages, note text, challenge text, and metadata as untrusted prompt-injection input.
- Separate instructions from quoted evidence; require a closed JSON schema and closed verdict set.
- Fetch the canonical content and public source URLs inside nondeterministic execution using the current official web-render API.
- Independently re-fetch/re-evaluate in validator logic and compare consequential fields.
- Snapshot-digest mismatch, all-source failure, malformed model output, or incompatible validator outcome cannot create a substantive denial or final result.
- Partial source availability may proceed only when the returned result explicitly identifies the usable sources and still satisfies the minimum source-quality rule.
- Store bounded note text because the 600-character cap satisfies the baseline while preventing long harmful payloads; never store fetched page bodies on-chain.
- Store only bounded structured scores and a digest of free-form rationale on-chain. The frontend may show fetched previews as untrusted, non-authoritative content.

## 8. Reputation semantics

Reputation is a signed app-local integer keyed only by wallet address, non-transferable, non-economic, and never used as authorization or eligibility.

- Final `DISPLAY` selected author: +2.
- Final `DISPLAY_WITH_WARNING` selected author: +1.
- Challenger whose submitted evidence changes either the selected note or display consequence from the provisional result: +1, once per finalized case even if multiple challenges were submitted by that address.
- No negative scores in the MVP; non-winners remain unchanged.

The UI and documentation must disclose that wallet addresses are pseudonymous, Sybil resistance is not provided, and reputation represents only this app's finalized evidence history.

## 9. Frontend requirements

- Case feed and case creation.
- Side-by-side note comparison with source previews clearly marked untrusted.
- Submission, lock/evaluate, challenge, challenge resolution, and permissionless finalize paths.
- Score breakdown, consequence, rationale digest, timeline, and reputation profile.
- Real GenLayerJS reads/writes against the verified Studionet deployment only.
- Transaction states: signing, submitted, consensus, finalized, execution success/error, authoritative readback, retry/reconciliation.
- Explicit EIP-6963 wallet selector supporting exactly detected MetaMask, OKX Wallet, and Rabby providers; bind every request/write to the selected provider object.
- Connect opens the selector and sends no account request until provider choice.
- Every full reload starts disconnected; no session restoration or automatic account request.
- Accessible modal focus, cancellation, rejection, account/chain change, provider switch, no-provider, and multi-provider behavior.

## 10. Required verification

Contract tests include happy paths plus: dead content URL, snapshot mismatch, all/partial source failure, malformed AI JSON, prompt injection, duplicate note, per-author duplicate, cap, late submission, unauthorized/early transitions, conflicting notes, ties, threshold boundaries, winner-changing score drift, validator disagreement, challenge cap/duplicate/late challenge, no-challenge finalization, challenge changes result, repeated finalize, and exactly-once reputation.

Frontend tests include selected-provider call isolation, chooser zero-RPC open/cancel, all wallet lifecycle cases, transaction terminal classification, finalized execution error, delayed readback, refresh/reconciliation without replay, direct-route reload, phase deadlines, and every advertised write journey.

Local tests never replace user-executed Studionet Studio tests or final Vercel wallet E2E. Anonymous approval remains mandatory at `PRE_DEPLOY`, `POST_DEPLOY_TEST`, and `POST_GITHUB_VERCEL_FINAL` for the exact applicable revision/evidence package.

## 11. Implementation boundaries

- Prefer one Intelligent Contract; add no backend, token, database, indexer, relayer, second contract, governance module, or new dependency unless a verified acceptance criterion cannot be met otherwise.
- Use current official GenLayer contract header, dependency declaration, APIs, storage/public types, time semantics, and GenLayerJS behavior; do not copy historical versions.
- Claude implements code in scoped prompts with at most two attempts per work item. Codex owns this specification, review, independent verification, Git, deployment guidance, release, and submission.
- No source, address, environment, repository, deployment, or decision from another Task may be reused.

## 12. Acceptance boundary

The specification is approved because it preserves every baseline feature while resolving the missing authority, evidence, challenge, tie-break, safe-failure, and reputation semantics with the smallest complete design. Material scope or product-direction changes require a new user instruction.
