# Community Note Display Council

Community Note Display Council is a GenLayer dApp that ranks competing contextual notes for a frozen public-content snapshot, resolves evidence challenges through validator consensus, and records the final display consequence and app-local reputation on Studionet.

## Verified links

- [Live app](https://community-note-display-council.vercel.app)
- [GitHub repository](https://github.com/ptc123456/community-note-display-council)
- [Studionet contract](https://explorer-studio.genlayer.com/address/0x3aB3Cf65F7BBD86bf998aCAcCc743Dd0Fdc82992): `0x3aB3Cf65F7BBD86bf998aCAcCc743Dd0Fdc82992`
- [Deployment transaction](https://explorer-studio.genlayer.com/transactions/0x8123a9711312342118347513f45d4926bbd80cd5cfcff229f3c9fbb6ce23d54f)
- [Verification ledger](docs/VERIFICATION.md)

The production deployment is live. Its required independent-wallet E2E result is recorded separately in the verification ledger after the user completes the numbered matrix.

## Trust problem

Case creators, note authors, and challengers can all benefit from framing evidence in their favor. None of them can select the winning note, display consequence, or reputation result. The contract freezes bounded evidence, applies deterministic lifecycle rules, and delegates the contextual ranking decision to GenLayer validator consensus.

## Why GenLayer is essential

The consequential decision requires validators to fetch a public page and submitted sources, assess competing notes under one rubric, and agree on the selected note and one of `DISPLAY`, `DISPLAY_WITH_WARNING`, or `NO_NOTE`. The resulting selection, scores, rationale digest, phase transition, and final reputation updates are recorded on-chain.

## How it works

1. Anyone creates a case with an HTTPS content URL, SHA-256 snapshot digest, submission deadline, and challenge window.
2. Wallets submit at most one bounded note per case with public sources.
3. After the deadline, anyone locks and evaluates the case. Validators independently fetch and assess the frozen evidence.
4. Wallets may submit up to three challenges during the challenge window.
5. After the window, anyone resolves challenges and finalizes the case. Reputation changes exactly once.

## Architecture

- `contracts/community_note_display_council.py` is the source of truth for evidence bounds, state transitions, consensus-backed decisions, final results, and reputation.
- `frontend/` is a Vite/React client. It performs authoritative Studionet reads, binds writes to the explicitly selected EIP-6963 provider, and reconciles finalized receipts with on-chain readback.
- There is no backend, database, indexer, relayer, token, or custody layer.

## Intelligent Contract

The main lifecycle is `OPEN -> LOCKED -> CHALLENGE -> EVALUATED -> FINALIZED`. Actors are permissionless, while duplicate submissions, deadlines, caps, and exactly-once finalization are enforced deterministically. Validators compare the selected note, consequence, tie-break-sensitive scores, and bounded result schema; malformed, unavailable, digest-mismatched, or non-consensus evidence fails closed without committing a verdict.

Public methods include `create_case`, `submit_note`, `lock_case`, `evaluate_case`, `submit_challenge`, `resolve_challenges`, `finalize_case`, the case/note/challenge/reputation views, and Root-slot `upgrade` recovery.

## Transaction lifecycle

The UI reports signature, submission, consensus finalization, execution result, and authoritative readback as separate stages. `FINALIZED` alone is not success: completion requires explicit execution `SUCCESS` and matching state readback. Unknown or conflicting receipt fields fail closed. A refresh can resume read-only reconciliation from a transaction hash without replaying the write.

## Run locally

Prerequisites: Node.js and npm, plus a browser with MetaMask, OKX Wallet, or Rabby configured for GenLayer Studionet.

```powershell
cd frontend
Copy-Item .env.example .env.local
# Set VITE_CONTRACT_ADDRESS=0x3aB3Cf65F7BBD86bf998aCAcCc743Dd0Fdc82992
npm ci
npm run dev
```

Opening the wallet chooser sends no account request. Every full reload intentionally returns to disconnected state.

## Tests and verification

```powershell
.\.venv\Scripts\python.exe -m pytest tests/direct -q
.\.venv\Scripts\genvm-lint.exe .\contracts\community_note_display_council.py
cd frontend
npm test
npm run build
```

Current verified results: 24 direct contract tests passed, GenVM lint passed all 3 checks, 19 frontend tests passed, and the production frontend build completed. The live matrix and transaction-level evidence are in [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Deployment

The release contract is on Studionet chain `61999`. The deployed source is `41881` bytes with SHA-256 `deda1181712d173def9e0fb2de99f44a6d5dc95e94e67a6445b6124a85d21809`, matching source commit `c3d81b6ccf0da69eea5234e54963b2ce118d66df`. Recovery uses the GenLayer Root code slot; an isolated exact-source rehearsal proved authorized replacement, unauthorized rejection, code readback, and storage preservation without mutating the release contract.

## Security and trust boundaries

- Fetched pages and user text are untrusted evidence, never instructions.
- HTTPS URLs, lengths, counts, schemas, score ranges, deadlines, and duplicate rules are bounded on-chain.
- Wallet writes use only the exact selected EIP-6963 provider with allowlisted RDNS values for MetaMask, OKX Wallet, and Rabby.
- Wallet addresses are pseudonymous. Reputation is non-transferable, non-economic, app-local history and is not Sybil-resistant.
- The frontend is not authoritative; consequential state comes from finalized contract readback.

## Known limitations

- Public-page availability and validator model variability can cause safe rollback or require a later permissionless retry.
- The MVP supports at most five notes and three challenges per case.
- Snapshot digests are supplied by the case creator; the contract verifies fetched bytes against the declared digest but does not establish real-world publisher identity.
- No token, payout, identity verification, moderation override, backend, or cross-chain support is included.
