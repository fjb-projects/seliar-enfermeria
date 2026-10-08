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

Initial forecast: 700–1100 authored changed lines across three coherent units. This is advisory; preserve clear code and meaningful tests. A1/A2 and C1/C2 are recorded as reviewable slices below. C2 is 422 authored source/test lines; its receipt-gated creation and navigation behavior form one coherent source proof. A size exception is required before any future oversized PR containing C2. No PR is being opened.

RDD is off by clone-local preference. The risk assessment was unassessable/high; independent review of C closed, with the parent rerunning the scoped checks. Preserve unrelated staged/unstaged files and Lovable history. Engram mirror is pending because the runtime session is unregistered and prohibits agent-attributed memory writes.

## Tasks

- [x] A1 — Shared transaction-bound communication creation. Branch `codex/efa-first-call-08-atomic-create`. Communication server/core and regression tests preserve public API behavior and owner-scoped idempotency. Independent review passed after correcting global key lookup; parent reran all three backend files with 41 passing tests. Typecheck, formatting and diff check passed.
- [x] A2 — Optional atomic episode/first-call creation and immutable receipt. Branch `codex/efa-first-call-09-linked-create`. Episode server/functions and tests verify rollback, authorization/audits, exact retry idempotency, mismatched child keys, legacy hash/replay and absence of manufactured call data. All three backend files passed 41 tests, typecheck, formatting and diff check; independent verification passed. No live PostgreSQL integration check was available.
- [x] B — Durable offline payload and proof. Branch `codex/efa-first-call-10-offline`. Intent and child key persist unchanged; legacy entries retain their old payload. Incomplete/wrong proof pauses the operation and retains its queue entry. Focused tests: 39 passed; typecheck, formatting and diff check passed. Independent review closed both identity findings; parent reran the focused command.
- [x] C — Default option and call continuation. C1 Stepper behavior committed as `9bffae4` on `codex/efa-first-call-11-ui` (269 insertions, 9 deletions; 278 authored lines). C2 EpisodePanel behavior committed as `07bf86a` on `codex/efa-first-call-12-continuation` (422 source/test lines; 448 authored lines including task progress). C2 is a coherent receipt-gated atomic creation/navigation proof; its size exception is required before a future oversized PR. No PR is open.

## Checks and progress

Use meaningful observed RED → GREEN for behavior regressions, then normalize final source bytes before functional checks. Each task runs its focused Vitest files, typecheck and diff check; production build at UI closure. Independent verification reviews risky behavior and runs focused tests. The parent completed isolated mocked-browser QA at 390px and 320px; this proves the user flow and viewport behavior, not live database/auth integration. Database transaction fault-injection tests do not substitute for real PostgreSQL integration; record availability honestly.

Backend implementation and independent verification are complete. One coherent slicing pass separates shared communication creation (404 authored source/test lines) from episode integration (414 source/test lines). Documentation increases both ranges; preserve their behavior/proof rather than making artificial splits. A size exception is recommended and required before opening an oversized PR; no PR or remote publication is requested. Initial forecast is now exceeded by the backend and remaining offline/UI work.

A1 committed as `d5e19f5` on `codex/efa-first-call-08-atomic-create`, 452 authored changed lines including the initial task document. A2 closes on `codex/efa-first-call-09-linked-create`. These ranges have been structurally checked for independent imports; intermediate revision compilation was not separately run.

A2 committed as `44a71f8`, 418 authored changed lines. B committed as `9ac52de`, 243 authored changed lines, on `codex/efa-first-call-10-offline`. C1 committed as `9bffae4`, 278 authored lines; C2 committed as `07bf86a`, 448 authored lines, on `codex/efa-first-call-12-continuation`. The five work units total 1,839 authored changed lines, including task progress and excluding generated artifacts. Local implementation is complete; live PostgreSQL integration remains unverified. Publication remains outside the authorized scope.

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
- The worker created no commit; the parent-created A1/A2 commits are recorded above.

### B progress — offline intent and receipt proof

- [x] Backward-compatible client API: `createPendingCreate(guardId, form, makeId, { registerFirstCall: true })` opts in. Omitted/false options preserve legacy payloads; opt-in generates the child key once and freezes it with `direction: "incoming"` for reloads and retries. UI callers should pass `registerFirstCall: true` for the checked default and restore the checkbox from the frozen payload pair; old entries remain unchecked.
- [x] Queue validation requires paired child intent and verifies the parent create identity plus immutable `initialCall.creationReceipt` identity, action, version, direction and hash before completing/navigation. It deliberately does not compare mutable current call state, direction, timing or priority, so valid replay after edits/finalization/cancellation remains acceptable.
- [x] Parent episode ownership and origin guard must be present and exact; both current communication ID and immutable receipt communication ID must be nonempty and equal. Regression cases use matching parent operation IDs so each missing identity is independently rejected.
- [x] RED observed: focused tests failed because the client omitted the child fields and partial intent was accepted. GREEN: `npm.cmd run test -- src/lib/efa-episodes.client.test.ts src/lib/efa-episodes.queue.test.ts` passed 39 tests; `npm.cmd run typecheck`, scoped Prettier check and `git diff --check` passed.
- The initial B source/test diff was 204 additions and 1 deletion before verification corrections. No UI work or live database test was performed in B; its final parent-created commit is recorded above.

### C progress — default option and call continuation

- [x] New episode creation defaults `Registrar primera llamada` to checked; its 44px label is locked while an operation is submitted. The action label follows checked, unchecked and edit modes. Frozen queued payloads restore paired incoming intent, while legacy create payloads restore unchecked.
- [x] Checked create reaches the Calls workspace only after the queue returns a validated immutable child receipt for the currently selected operation, owner, guard and unchanged form snapshot. A workspace switch still uses its existing discard confirmation; declining leaves an explicit continuation action and the saved service remains in the list.
- [x] The create intent snapshots a navigation revision. Explicit panel actions advance it; after refresh, automatic opening is fenced against changed navigation, current owner/guard, operation selection and form. A valid receipt still leaves the explicit continuation available when a newer navigation wins.
- [x] Refresh clears the expected pending operation before the final auto-open check. The final gate accepts that cleared state only while the original operation remains selected, and rejects a different pending operation; a focused regression covers both states.
- [x] Verifier correction RED reproduced the cleared-pending false negative; focused EpisodePanel tests passed 10 tests and typecheck, Prettier and `git diff --check` passed. The production build was not repeated for this predicate-only correction; it passed immediately before it.
- [x] Calls auto-select the receipt communication once after fresh list loading. Selection aborts if the target or operation changes, the user selects/starts/edits/navigates, or another call operation becomes pending. It uses the latest listed call view and its permission/state; actual drafts alone display “pendiente de completar”.
- [x] A successful one-time initial-call selection now scrolls its accessible editor heading into view and focuses it. A pending focus request is cleared by editor interaction and applied only while the selected call and selection revision still match. Isolated browser QA confirmed the focused editor is visible.
- [x] Focus guard RED was observed after inverting its revision condition. The focused Stepper suite passed 9 tests; writer typecheck, Prettier and `git diff --check` passed. Parent reran the scoped tests after the final focus and EpisodePanel gate fixes.
- [x] RED observed: episode-panel tests failed on absent checkbox/CTA and Stepper tests failed because stale-selection eligibility was missing. The deferred refresh fence regression also failed when its revision guard was inverted, then passed after restoration. Four focused UI/client/queue files passed 56 tests; typecheck and production build passed. Build emitted existing Vite route-file and deprecated server-function warnings. Scoped Prettier and `git diff --check` passed.
- C1 Stepper source/test commit `9bffae4` contains 269 additions and 9 deletions (278 authored lines). C2 EpisodePanel source/test commit `07bf86a` contains 402 additions and 20 deletions (422 authored source/test lines; 448 with task progress). C2's create receipt, post-refresh navigation fence and continuation form one cohesive proof; a size exception is required before any future oversized PR. No PR is open.
- Actual isolated mocked-browser QA confirmed: checked create produced exactly one service and one incoming draft with null start/end/priority, then opened Calls with the draft selected and its focused editor heading visible; unchecked create produced one service and zero calls while staying in the current view; edits hide the checkbox; 390px and 320px viewports had no horizontal overflow, and the empty datetime input fit at 320px. A delayed post-create refresh released after navigation preserved the newer Despachos selection, and the explicit continuation opened the first call.
- Browser proof used a synthetic server boundary, not live database/auth. No subsequent call edit/save was covered. Screenshot: `C:/Users/Fernando/.codex/visualizations/2026/10/07/01a118ba-6430-7b90-9b4c-9b7bd317d1df/efa-first-call-mobile.jpg`. The temporary browser tab was closed, viewport override reset, foreground server stopped and port 4179 verified free. Only the seven owned temporary fixture files were removed.
- The full suite passed before the two final scoped fixes: 60 files, 386 tests. Afterward the EpisodePanel suite passed 10 tests and the Stepper suite passed 9; parent reran those scoped tests, and writer typecheck, formatting and diff check passed. Build passed before the predicate/focus corrections and was not repeated because they were limited eligibility/focus changes. Independent review of all C corrections is closed.
