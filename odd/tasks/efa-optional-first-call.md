# Open a service with its first call

New service creation offers Register first call, enabled by default. Saving creates the episode and its incoming call draft together and opens Calls with that draft selected. Disabling the option creates only the episode and keeps the current view. Existing episode edits keep their current behavior.

## Accepted scope

- Checkbox: `Registrar primera llamada`, checked for a new episode only.
- Checked CTA: `Abrir servicio y registrar llamada`; unchecked: `Abrir servicio`; editing: `Guardar cambios`.
- Initial call: incoming draft, explicitly pending completion. Its start/end/priority remain null; episode event time is separate. No artificial clinical or timing defaults.
- Episode, call, audit and creation receipts share a database transaction; a single immutable queued operation retries both without duplicating records.
- Old queued operations and prior creation hashes remain compatible. Verified linked-call identity is required before automatic navigation.
- Only the current confirmed creation may open/select the call. Older responses, changed episodes and dirty call editors must not be overwritten.
- Offline/pending/conflict/errors retain existing feedback and retry behavior. The option is locked with the submitted payload during an active operation.
- No database migration is planned; no remote operations or publication are authorized.

## Routing and delivery

Delegated direct for each task: source/service mapping, multi-file logic, tests and independent verification require bounded workers. Continue the previously chosen feature-branch-chain with `codex/efa-mobile-arrival-integrator` as integration tracker and `codex/efa-services-07-observation-feedback` as this feature's base (`cf6c712`).

Initial forecast: 700–1100 authored changed lines across three coherent units. This is advisory; preserve clear code and meaningful tests. One slicing pass will identify any oversized review unit, and no PR over 400 lines will be opened without a coherent split or explicit size exception.

RDD remains off by clone-local preference. Assessment failure is high risk; independent review and a parent reported-command spot check are required. Preserve unrelated staged/unstaged files and Lovable history. Engram mirror is pending because the runtime session is unregistered and prohibits agent-attributed memory writes.

## Tasks

- [x] A1 — Shared transaction-bound communication creation. Branch `codex/efa-first-call-08-atomic-create`. Communication server/core and regression tests preserve public API behavior and owner-scoped idempotency. Independent review passed after correcting global key lookup; parent reran all three backend files with 41 passing tests. Typecheck, formatting and diff check passed.
- [x] A2 — Optional atomic episode/first-call creation and immutable receipt. Branch `codex/efa-first-call-09-linked-create`. Episode server/functions and tests verify rollback, authorization/audits, exact retry idempotency, mismatched child keys, legacy hash/replay and absence of manufactured call data. All three backend files passed 41 tests, typecheck, formatting and diff check; independent verification passed. No live PostgreSQL integration check was available.
- [x] B — Durable offline payload and proof. Branch `codex/efa-first-call-10-offline`. Intent and child key persist unchanged; legacy entries retain their old payload. Incomplete/wrong proof pauses the operation and retains its queue entry. Focused tests: 39 passed; typecheck, formatting and diff check passed. Independent review closed both identity findings; parent reran the focused command.
- [ ] C — Default option and call continuation. Branch `codex/efa-first-call-11-ui`. Surfaces: EpisodePanel and CommunicationStepper and their tests. Verify checked/unchecked/edit flows, matching-operation navigation, initial-call selection and protection against stale responses or newer edits.

## Checks and progress

Use meaningful observed RED → GREEN for behavior regressions, then normalize final source bytes before functional checks. Each task runs its focused Vitest files, typecheck and diff check; production build at final UI closure. Independent verification reviews risky behavior and runs focused tests. Runtime browser inventory was previously empty, so actual mobile/interactive QA is pending unless a browser becomes available. Database transaction code/fault-injection tests do not substitute for real PostgreSQL integration; record availability honestly.

Backend implementation and independent verification are complete. One coherent slicing pass separates shared communication creation (404 authored source/test lines) from episode integration (414 source/test lines). Documentation increases both ranges; preserve their behavior/proof rather than making artificial splits. A size exception is recommended and required before opening an oversized PR; no PR or remote publication is requested. Initial forecast is now exceeded by the backend and remaining offline/UI work.

A1 committed as `d5e19f5` on `codex/efa-first-call-08-atomic-create`, 452 authored changed lines including the initial task document. A2 closes on `codex/efa-first-call-09-linked-create`. These ranges have been structurally checked for independent imports; intermediate revision compilation was not separately run.

A2 committed as `44a71f8`, 418 authored changed lines. B closes on `codex/efa-first-call-10-offline`; next is the default checkbox and selected-call continuation on C.

### A progress — atomic creation

- [x] Added paired optional `childCreateKey` and `direction: "incoming"` fields; requests without them retain the prior episode request hash shape.
- [x] Existing public communication creation and initial-call creation now share the transaction-bound creation core for actor/ownership/cancelled checks, request hashing, replay, draft insert, audit and operation receipt.
- [x] Receipt contract: `initialCall.creationReceipt` carries `communicationId`, `episodeId`, `ownerUserId`, `clientCreationKey`, `operationId` (equal to the child key), `direction: "incoming"`, `action: "created"`, `requestHash`, `appliedVersion: 1`, and `changed: true`; `initialCall.replayed` marks replay. Queue linking must validate these receipt identities, not mutable call fields.
- [x] Child creation receipts use the schema's owner-plus-key scope. Replay accepts the original receipt after the episode or call changes; the same owner's key bound to another episode is rejected, while another owner may independently use that key. Initial call timing and priority remain null.
- [x] Owner-scoped advisory locking matches the existing unique-key scope; a cross-owner key never attaches or invalidates another owner's communication.
- [x] Fault-injection coverage confirms rollback across episode/call records, audits and operation receipts when the child receipt insert fails. This is repository-adapter proof, not live PostgreSQL integration proof.
- [x] RED observed: the new first-call creation test failed because `initialCall` was absent. Final GREEN: focused suite passed 41 tests across the three requested files; `npm.cmd run typecheck`, scoped Prettier check, and `git diff --check` passed.
- Route: delegated direct (one writer), triggered by cross-service transaction reuse across multiple non-trivial files. Source/tests changed 818 authored lines (731 additions, 87 deletions), above the 400-line advisory. One slicing pass can separate the shared communication-create core and regression proof from the episode opt-in integration and rollback/replay proof; parent will derive commit boundaries. Task progress adds 13 lines.
- No live PostgreSQL integration check was run; rollback evidence comes from the transaction fault-injection adapter test.
- No commit was created; the parent owns work-unit commit and native review.

### B progress — offline intent and receipt proof

- [x] Backward-compatible client API: `createPendingCreate(guardId, form, makeId, { registerFirstCall: true })` opts in. Omitted/false options preserve legacy payloads; opt-in generates the child key once and freezes it with `direction: "incoming"` for reloads and retries. UI callers should pass `registerFirstCall: true` for the checked default and restore the checkbox from the frozen payload pair; old entries remain unchecked.
- [x] Queue validation requires paired child intent and verifies the parent create identity plus immutable `initialCall.creationReceipt` identity, action, version, direction and hash before completing/navigation. It deliberately does not compare mutable current call state, direction, timing or priority, so valid replay after edits/finalization/cancellation remains acceptable.
- [x] Parent episode ownership and origin guard must be present and exact; both current communication ID and immutable receipt communication ID must be nonempty and equal. Regression cases use matching parent operation IDs so each missing identity is independently rejected.
- [x] RED observed: focused tests failed because the client omitted the child fields and partial intent was accepted. GREEN: `npm.cmd run test -- src/lib/efa-episodes.client.test.ts src/lib/efa-episodes.queue.test.ts` passed 39 tests; `npm.cmd run typecheck`, scoped Prettier check and `git diff --check` passed.
- Authored source/test diff: 204 additions and 1 deletion (205 changed lines). No UI work, commit or live database test was performed in B.
