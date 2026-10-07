# Expanded EFA MVP

Implement the next EFA operational workflows without changing public forms or external integrations. The first work unit records observed staffing-period facts, distinct from planned coverage, using anonymous roles rather than personal identities.

**Status:** Local implementation and final integration documentation complete; operational rollout remains pending database migration and live browser/database verification.
**Engram mirror:** Pending; the runtime did not provide an authorized registered session identity, so no memory write is attempted.
**Delivery strategy:** `ask-on-risk`; the user selected a feature-branch chain on 2026-10-07. Keep each work unit as a reviewable block; do not publish a PR or push without separate authorization.
**Forecast:** More than 400 authored changed lines across the expanded feature; generated migration artifacts are excluded. Slicing is by behavior, not by code compression.

## Objective and problem

Record actual, time-bounded EFA staffing and handovers so the operational history reflects what occurred. Current guard/account records are individual-owned and cannot represent several anonymous people in the same role, same-day shift changes, transfer departure/arrival, or temporary absence/return without conflating those observations with future plans.

## Scope and constraints

- Task 10A adds an anonymous observed staffing-period lifecycle for nurse, driver, and doctor roles; multiple concurrent periods per role and same-day handovers are valid.
- Record start/end, optional cause (`medical_request`, `coordination`, `temporary`, `other`), and require a description for `other`.
- Transfers record departure from origin and arrival at destination as separate timestamps. Temporary departures record departure and return separately.
- No person names, account foreign keys, or inference of absence from missing data. A staffing period is an observed fact, not a plan.
- EFA writes require current EFA/admin authorization; only administrators may correct another owner's historical guard completion under existing authorization rules. Staffing observations are anonymous, so authorization is role-based and not person ownership.
- Keep validation, service authorization, audit/idempotency, and UI behavior consistent with existing EFA server-function patterns. Preserve all preexisting staged, dirty, and untracked files.
- Do not access or migrate a remote database. Do not modify public Forms/Drive code. Do not commit; the parent owns commit and delivery choice.
- Source and documentation language defaults to English; existing UI may continue in neutral Spanish.

## Work units and acceptance

### 10A — Observed staffing periods (current task)

**Route:** delegated direct. Trigger: unfamiliar EFA data/auth flow and coordinated schema, service, server-function, route/panel, migration, and test changes across multiple non-trivial files.
**Authorized surfaces:** `src/db/schema.ts`, generated forward migration and metadata, `src/lib/efa-staffing*.ts(x)`, `src/components/EfaGuardPanel.tsx` and focused test, `src/routes/guardia-efa.tsx`.

- [x] Persist anonymous role periods and lifecycle events with constraints, audit history, and idempotent writes.
- [x] Enforce current server-side EFA/admin authorization and prevent invalid time/order/state transitions.
- [x] Show observed staffing and lifecycle controls in the mobile-first guard view; never present missing data as confirmed absence or a plan as actual coverage.
- [x] Add deterministic service/UI coverage for roles, concurrent periods, handovers, cause requirements, transfer and temporary timestamps, authorization, audit, and replay.
- [x] Generate a forward-only Drizzle migration; do not apply it to any database.
- [x] Run `npm run typecheck`, `npm run test -- src/lib/efa-staffing.server.test.ts src/components/EfaGuardPanel.test.tsx`, `npm run build`, and `git diff --check`; record exact outcomes.

**10A implementation and verification evidence:** Added `efa_staffing_period`, `efa_staffing_movement`, and `efa_staffing_audit`; observed personnel have no names or account foreign key. Periods reference the guard context, while audit authors remain authenticated actors. A transfer stores origin departure and destination arrival independently; temporary movements store departure and return independently. Partial unique keys support request replay and prevent multiple unfinished movements in one anonymous period, while separate periods may overlap for the same role. Admin/EFA authorization is rechecked in the service and ordinary EFA writers are limited to their own guard. The UI explicitly distinguishes observed facts from plans and says missing observations do not confirm absence.

- Test-first evidence: the first focused test run failed because `efa-staffing.server.ts` did not exist (1 failed suite, existing UI tests 2/2 passed). After implementation the focused command passed: 2 files, 9 tests.
- `npm run db:generate`: exit 0; generated `drizzle/0012_cute_scourge.sql`, `drizzle/meta/0012_snapshot.json`, and journal entry 12. Migration was not applied.
- `npm run typecheck`: exit 0.
- `npm run test -- src/lib/efa-staffing.server.test.ts src/components/EfaGuardPanel.test.tsx`: exit 0; 2 files, 9 tests.
- `npm run build`: exit 0. Existing warnings remain for `vite-tsconfig-paths`, the `episodios-efa.test.tsx` route filename, and legacy `inputValidator()` usage in unrelated public form modules.
- `git diff --check`: exit 0.
- Formatting: Prettier passed on all TypeScript/JSON/Markdown files. The first combined invocation could not infer a parser for the generated `.sql`; SQL remains the unmodified Drizzle-generated output.
- No remote database was accessed, and no migration was applied. Work-unit commit: `8f28bae` (`feat(efa): record anonymous observed staffing periods`). The clone-local review switch is off; native review is disabled/unmanaged. The high-risk/unassessable assessment of the dirty worktree did not replace the independent read-only verification described below.

**Independent-verifier follow-up:** The operational plan allows completing a record started during a guard after that guard closes. New staffing periods are now rejected once the guard is closed, while an existing period can still be completed under the existing owner/admin authorization. The service also requires each new departure to be at or after the previous completed arrival/return, and the period exit to be at or after the last completed arrival/return. In the UI, pending request IDs and payload fingerprints are retained across failed/uncertain actions and cleared only after the write and refresh succeed; changing the payload obtains a new ID.

The guard UI now separates `canCreate` (which is false for a closed guard) from `canEdit` (existing owner/admin access). An unfinished staffing period on a closed guard still exposes its exit control, and a pending transfer/temporary movement still exposes arrival/return completion.

- Test-first evidence: the added regression tests initially produced 3 failures (closed-guard entry, cross-event chronology, and missing stable-operation helper). A subsequent assertion-only mismatch was corrected to match the service's Spanish error text.
- `npm run test -- src/lib/efa-staffing.server.test.ts src/components/EfaGuardPanel.test.tsx`: exit 0; 2 files, 13 tests after the closed-guard UI correction (parent spot check).
- `npm run typecheck`: exit 0.
- `git diff --check`: exit 0.
- Closed-guard UI test-first evidence: the focused component test initially failed because the existing active period's exit action was hidden; after splitting create/edit capabilities, `npm run test -- src/components/EfaGuardPanel.test.tsx` passed (1 file, 5 tests). `npm run typecheck` and `git diff --check` also passed (exit 0).
- This follow-up did not change the migration or access unrelated files.
- Independent verification ran the full local suite (47 files, 281 tests), typecheck, and build before the scoped corrections. After the corrections, the parent reran the focused staffing and guard UI tests (2 files, 13 tests; exit 0). The earlier three consistency findings were corrected; the final UI completion gate was covered by the fifth component test.
- Commit `8f28bae` contains approximately 1,842 authored changed lines excluding generated SQL and snapshot. The user selected a feature-branch chain; this cohesive first work unit exceeds the approximately 400-line review slice heuristic and may require an explicit size exception or finer PR slicing before any PR is created. No PR or push was authorized.

### 10B — Planned patterns and exceptions

- [x] Model planned coverage separately from observed periods, including reusable configurable cycles and dated replacement exceptions.
- [x] Keep plan versions append-only and effective-dated; reject backdated exception revisions and reuse-safe idempotent writes.
- [x] Provide administrator-maintained plan editing and preview plus read-only EFA coverage preview for selected guard bases.
- [x] Preserve the distinction in persistence, UI, and deterministic tests; do not infer missing or overnight coverage.

**10B implementation and verification evidence:** Added immutable cycle-plan versions and dated exceptions, with an explicit cycle anchor, 1–366-day cycle length, role-specific day slots, optional labels (including A/B/C/D), and arbitrary same-day multiple slots/handovers. Every plan and exception targets an existing Compensatorio catalog option by immutable `efa_base.id`; Móvil 15 and other mobile labels are catalog entries, not separate mobile entities or free-text plan targets. The admin editor exposes only the catalog selector, and the server resolves the display name and rejects unknown IDs; storage constraints allow only base targets with a non-null catalog FK. Forward migration 0015 converts legacy name-keyed mobile targets only when they match an existing normalized catalog name, preserves preexisting audit states unchanged, and raises before converting rows if a legacy target cannot be mapped. No fleet, plate, or mapping entity is introduced. Base display-name changes preserve plan and exception identity, and reusing an old name for another base does not attach prior records. Buenos Aires operational local dates (`America/Argentina/Buenos_Aires`) govern future effective dates and exception revisions; mutations now require a date strictly after the current operational day, preserving elapsed-day history, while exact idempotent replays remain safe. Admin date inputs enforce the next operational date as their minimum, and the EFA preview initializes its range from the Buenos Aires day rather than UTC. Slots explicitly store whether the end occurs the same or next day, supporting overnight and 24-hour coverage; preview includes explicit slots started on the preceding date when they overlap the selected range, including date-specific overnight exceptions, without duplicating them or inventing gaps. Preview returns and renders both calendar boundaries and still does not add an automatic 22:00–06:00 segment. Dated exceptions replace the full day's planned slots; an empty exception deliberately means no planned coverage. Plan and exception writes are append-only/audited, and reused operation IDs with different payloads are rejected. Anonymous role categories (`nurse`, `driver`, `doctor`) remain separate from actual observed staffing, with no roster/person identifiers. RED/GREEN evidence: the new strict-date and D+1 exception-overlap tests failed against prior behavior, then passed after correction. Verification from the preceding correction: focused tests passed (18/18), and typecheck, build, diff, and formatting checks passed. Catalog-target correction RED/GREEN: free-text/mobile target and unlisted-ID tests failed before changes; the renamed-base replay assertion exposed a stale display name, then all passed after resolving IDs through the catalog. Build retains existing Vite route-file and deprecated inputValidator warnings. Migration 0015 extends the committed 0013/0014 schema; it remains unapplied, and no remote database work was performed.

The admin account route uses a catalog-ID selector for all plan targets, with effective-version history, dated exception slots, and preview; there is no separate mobile editor. EFA guard users query a read-only preview by selected base ID; copy explicitly distinguishes planned coverage from observed staffing and mobile availability. Unchanged retries reuse the pending operation ID for plan and exception writes after uncertain responses.

- Test-first evidence: the correction's focused test run initially failed on missing immutable target identity, Buenos Aires date enforcement, overnight end boundaries, and retry-ID behavior (6 failing tests). After correction, the focused command passed: 3 files, 15 tests (plan service, admin editor, and guard panel).
- `npm run db:generate`: exit 0; the original forward-only `drizzle/0013_keen_risque.sql` remains unchanged, and the follow-up `drizzle/0014_condemned_the_spike.sql`, snapshot 0014, and journal entry 14 add the immutable base FK/identity constraints. Neither migration was applied.
- `npm run typecheck`: exit 0.
- `npm run test -- src/lib/efa-staffing-plan.server.test.ts src/components/AdminStaffingPlan.test.tsx src/components/EfaGuardPanel.test.tsx`: exit 0; 3 files, 10 tests.
- `npm run build`: exit 0. Existing warnings remain for vite-tsconfig-paths, the `episodios-efa.test.tsx` route filename, and legacy `inputValidator()` calls in unrelated modules.
- `npx prettier --check src/lib/efa-staffing-plan.server.db.ts`: exit 0.
- `git diff --check`: exit 0.
- No remote database access or migration application; no changes to migration 0012 or unrelated pre-existing work. Work-unit commits: `a189d54` (versioned planning) and `55cab08` (catalog-only correction). The clone-local receipt-driven review switch remains off; both units had independent read-only verification and focused parent spot checks.
- [x] Parent review and commit of 10B after the catalog-only target correction.
- Catalog-target RED/GREEN: the added rejection tests for free-text mobile targets and unknown catalog IDs, plus the catalog-only UI assertion, failed before implementation and passed afterward. A rename replay test then exposed a stale returned name; resolving replay output through the current catalog fixed it.
- `npm run db:generate`: exit 0; generated forward-only `drizzle/0015_whole_sway.sql`, snapshot 0015, and journal entry 15. The migration maps legacy name-keyed targets only when normalized names match existing catalog entries and raises otherwise. Migration remains unapplied.
- `npm run test -- src/lib/efa-staffing-plan.server.test.ts src/components/AdminStaffingPlan.test.tsx src/components/EfaGuardPanel.test.tsx`: exit 0; 3 files, 20 tests. `npm run typecheck`: exit 0. `npm run build`: exit 0 with existing route-file and `inputValidator()` warnings. `git diff --check`: exit 0. Prettier check on changed TS/JSON/Markdown files: exit 0.
- No remote database work or public Forms changes. No push or pull request was created.

### 11A — Shared institutional destination catalog

- [x] Add a normalized, versioned institutional destination catalog with administrator correction/deactivation/reactivation and EFA inline creation/listing.
- [x] Preserve catalog history through append-only, actor-attributed before/after audit; never delete catalog entries.
- [x] Expose only active choices to EFA and revalidate EFA/admin access on the server; catalog access must not grant access to another user's episodes.
- [x] Add focused service, server-function, admin UI, and schema/migration checks; keep the existing base catalog unchanged and do not add private-address or free-text mobile/fleet catalogs.
- [x] Generate a forward migration after 0015 and do not apply it to any database.
- [x] Parent review and commit of 11A; work-unit commit `bf8c168`.

**11A implementation and verification evidence:** Added `efa_institution` with stable UUID identity, NFKC/whitespace/case-normalized unique name, active state, optimistic version, and DB-managed create/update timestamps. `efa_institution_audit` records actor ID, DB timestamp, action, before/after state and version transition; the forward migration prohibits audit update/delete and catalog delete. Server-only service and server functions revalidate active EFA/admin roles against current account state; EFA callers list active choices and may create inline, while only administrators list all entries, inspect audit history, correct names, deactivate, or reactivate. `EfaInstitutionPicker` supplies the active-list/inline-create UI for the subsequent dispatch integration; `/admin-usuarios` now hosts the administrator catalog and visible history. The existing `efa_base` catalog was not modified. No episode query or private-address catalog was introduced.

- Test-first evidence: `src/lib/efa-institutions.server.test.ts` initially failed because the implementation module did not exist (one failed suite, zero tests); after implementation, the focused set passed: 6 files, 29 tests.
- `npm run db:generate`: exit 0; generated forward-only `drizzle/0016_efa_institutions.sql`, snapshot 0016, and journal entry 16. The migration was not applied.
- `npm run typecheck`: first run exposed a test-store audit result type mismatch and database text-action typing mismatch; both were corrected. Final run: exit 0.
- `npm run test -- src/lib/efa-institutions.server.test.ts src/lib/efa-institutions.functions.test.ts src/lib/efa-institutions.client.test.tsx src/components/AdminInstitutionCatalog.test.tsx src/routes/admin-usuarios.test.tsx src/db/schema.test.ts`: exit 0; 6 files, 29 tests.
- `npm run build`: exit 0. Existing warnings remain for `vite-tsconfig-paths`, deprecated `inputValidator()` calls, and route test files not exporting a route (the new `admin-usuarios.test.tsx` matches the repository's existing `episodios-efa.test.tsx` pattern).
- `git diff --check`: exit 0. No remote database was accessed, and no migration was applied.
- Independent verification correction: the EFA inline picker now explicitly states that its shared catalog is only for institutions/institutional destinations and that private addresses belong in the episode and must not be created here, matching the administrator guidance. Test-first evidence: the focused picker test failed before the copy existed and passed after the change. `src/lib/efa-institutions.server.ts` was formatted with Prettier without behavior changes.

### 11B — Per-dispatch institutional association

- [x] Use the shared active destination catalog for dispatch association; preserve historical references when a destination is later inactive.
- [x] Add dispatch association UI and validation without exposing another user's episode data or permitting arbitrary mobile/fleet free text.

**11B implementation and verification evidence:** Added nullable `efa_dispatch.institution_id` with a restrictive FK to the shared institution catalog; the association belongs to an individual dispatch, not its episode. Create/update server schemas accept only UUID or null, service writes require active choices for new associations, and an existing inactive association remains on reads and survives unrelated edits. Dispatch audit snapshots, optimistic version changes, operation hashing/replay, and frozen offline queue payloads include the institution ID. The dispatch UI uses `EfaInstitutionPicker` beside T4 arrival-at-destination; it only loads shared active choices and inline creation, while historical inactive destinations remain visible and are preserved unless the selection changes. Existing episode owner/admin access checks remain the gate before dispatch read/write; catalog access does not expose episode records. No private addresses or free-text mobile/fleet catalog were added.

- Test-first evidence: new dispatch service and server-function schema assertions failed before implementation because the institution association was not represented/accepted. After implementation, focused dispatch server/function/client/queue/component and schema coverage passed: 6 files, 58 tests. Queue and client tests confirm the selected catalog ID stays in frozen offline state.
- `npm run db:generate`: exit 0; generated forward-only `drizzle/0017_efa_dispatch_institution.sql`, snapshot 0017, and journal entry 17. The generated SQL adds a nullable FK with `ON DELETE restrict`; migration remains unapplied.
- `npm run test -- src/lib/efa-dispatches.server.test.ts src/lib/efa-dispatches.functions.test.ts src/lib/efa-dispatches.client.test.ts src/lib/efa-dispatches.queue.test.ts src/components/EfaDispatchStepper.test.tsx src/db/schema.test.ts`: exit 0; 6 files, 58 tests after the final regression additions.
- `npm run typecheck`: exit 0. `npm run build`: exit 0; existing route-test-file, vite-tsconfig-paths, and legacy `inputValidator()` warnings remain. `git diff --check`: exit 0.
- An initial build found that directly importing the `.client` picker from the route's server graph violates TanStack Start's import-protection boundary; dispatch UI now lazy-loads it via `createClientOnlyFn`.
- Independent verification follow-up: the first full-suite run failed in `EfaEpisodePanel.test.tsx` because its TanStack mock lacked `createServerOnlyFn`, newly reached through the institutions-functions module. Added a focused institutions-functions mock. Added service coverage proving two dispatches for the same episode can reference different active institutions and a non-transport dispatch can explicitly keep `institutionId: null`. Final `npm run test`: exit 0; 54 files, 316 tests. `npm run typecheck`, `npm run build`, `git diff --check`, and Prettier check on the five changed TS/TSX files all exited 0. Build retains the previously noted tooling warnings.
- No remote database was accessed; migration was not applied. Work-unit commit: `8618a63` (`feat(efa): link institutional destinations to dispatches`). No push or pull request was authorized.

### 12 — Correction notices and offline conflict handling

- [x] Verify administrator-created correction notices and track read state independently for each recipient.
- [x] Verify local draft queues remain scoped to the current user and retain pending operations safely.
- [x] Verify retries use idempotent operation identifiers so a lost response does not create duplicates.
- [x] Verify divergent local and server versions are shown for manual resolution; do not apply last-write-wins.
- [x] Close the stale reconciliation-list race with a deterministic regression; re-read persisted state before every dispatch and retain payload identity, owner fencing, and explicit pause behavior.
- [x] Inspect only demonstrated gaps; do not reimplement working flows or expand into deferred timestamp precision work.

**Task 12 implementation and verification evidence:** A new race regression first failed against the previous controller: reconciliation dispatched `op-b` from its stale `list()` snapshot after the `op-a` attempt changed B to `paused-conflict`. The controller now re-reads the exact owner/operation entry inside the in-flight fence immediately before eligibility checks and dispatch. It verifies the immutable payload and uses the persisted status/entry; stale paused entries are not sent. This also protects `enqueue` and manual `retry` paths because they converge on the same `attempt()` gate. Existing owner fencing, operation IDs, frozen payloads, manual pause states, receipt checks, and manual conflict selection remain intact. A queue test's deferred storage read was narrowed to its intended first read to preserve its fresh-actor assertion under the additional pre-dispatch read.

- RED: `npm run test -- src/lib/efa-episodes.queue.test.ts -t "rechecks a stale listed entry"` failed as expected (`confirmed, confirmed` instead of `confirmed, paused`; B dispatched).
- GREEN/focused: `npm run test -- src/lib/efa-episodes.queue.test.ts -t "rechecks a stale listed entry"` passed (1 test); `npm run test -- src/lib/efa-episodes.queue.test.ts src/components/EfaEpisodePanel.test.tsx` passed (2 files, 30 tests).
- Final local checks: `npm run test` passed (54 files, 317 tests); `npm run typecheck` passed; `git diff --check` passed. These are local automated tests/type checks, not real-browser or IndexedDB validation.
- Existing tests verify recipient-scoped correction notice read state and idempotent acknowledgement in `src/lib/efa-episodes.server.test.ts`; the panel test verifies generic unread notice rendering. Queue tests cover per-user reconciliation, frozen same-ID retry after uncertain transport, receipt validation, explicit conflict selection, and preservation of another uncertain operation. No test claims real browser storage or UI interaction behavior.
- Residual deferred issue: E3-A R3-001 remains. If IndexedDB itself fails while persisting a mismatched-receipt pause or confirmed-cleanup marker/deletion, the controller can only retain an in-memory fence; after reload, persisted `pending` state can still be resent. This task does not claim recovery if IndexedDB fails. Real-browser IndexedDB behavior remains unverified.
- E2-A timestamp formatting and C1-A2 submillisecond preservation remain explicitly out of scope; no timestamp contract changes were made. No Neon/remote database access or migrations occurred, and no public Forms/Drive work occurred. Work-unit commit: `ab285ba` (`fix(efa): recheck episode queue state before retry`). Independent read-only verification and a focused parent spot check passed.

### 13 — Cancellation and reactivation (scoped work units)

**Scope decision (2026-10-07):** The first implementation is limited to episodes, communications, and dispatches. Work is split into 13A communications, 13B dispatches, and 13C episodes. Police coordination/events, support requests, observations, and staffing are explicitly excluded from task 13.

#### 13A — Communication cancellation and reactivation (complete locally)

**Route:** delegated direct. Trigger: coordinated schema/migration, server lifecycle, UI, and deterministic test changes across multiple non-trivial files.
**Authorized surfaces:** `src/db/schema.ts`, `src/db/schema.test.ts`, `drizzle/0018_*.sql`, `drizzle/meta/0018_snapshot.json`, `drizzle/meta/_journal.json`, `src/lib/efa-communications.server.ts`, `src/lib/efa-communications.server.test.ts`, `src/lib/efa-communications.functions.ts`, `src/lib/efa-communications.functions.test.ts`, `src/lib/efa-communications.client.ts`, `src/lib/efa-communications.client.test.ts`, `src/lib/efa-communications.queue.ts`, `src/lib/efa-communications.queue.test.ts`, `src/components/EfaCommunicationStepper.tsx`, `src/components/EfaCommunicationStepper.test.tsx`, `src/components/EfaEpisodePanel.tsx`, `src/components/EfaEpisodePanel.test.tsx`, `src/routes/episodios-efa.tsx`, `src/routes/episodios-efa.test.tsx`.

- [x] Add communication-only cancellation/reactivation distinct from finalization, preserving each communication's prior `draft` or `finalized` state.
- [x] Preserve the communication row, its children, and linked dispatches; cancelled communications remain readable but cannot be edited/finalized until reactivated.
- [x] Recheck owner/admin authorization server-side; enforce optimistic version/CAS and idempotent operation receipts.
- [x] Audit before/after state, actor, and database time; administrative corrections notify the original owner, but never send a notice to the acting user.
- [x] Add an accessible compact action/confirmation UI without removing or rewriting original history.
- [x] Test authorization, state transitions, audit, replay, no-cascade preservation, administrative notice, and UI; generate but do not apply migration 0018.

**13A implementation and verification evidence:** Communication records now carry `cancelled_at` and `cancelled_from_state`; database constraints permit only valid draft/finalized/cancelled combinations, and immutable audit/operation actions include cancellation and reactivation. Server transitions lock and version-check the communication, reauthorize active EFA/admin access, record before/after states and DB time, use operation IDs/request hashes for replay, and notify only the original owner when an administrator acts. Cancellation is online-only; if the response is uncertain, the UI retains and reuses the exact operation ID for the same action/record/version. Cancelled items remain listed/readable, are labeled `Anulada`, and their fields/finalize controls are disabled until explicit reactivation restores the original status. Existing dispatch rows/links are not changed and no child delete or cascade is introduced. No new reason field is required.

- Test-first RED: the new service regression failed because the cancellation service action did not exist. GREEN: the new cancellation/reactivation tests then passed, covering draft and finalized restoration, audit actor/state/version, replay, admin notice recipient, self-notice avoidance, and denied revoked access.
- `npm run db:generate`: exit 0; generated `drizzle/0018_clammy_mystique.sql`, snapshot 0018, and journal entry 18. Migration is forward-only, remains unapplied, and no remote DB was accessed.
- `npm run test -- src/lib/efa-communications.server.test.ts src/lib/efa-communications.functions.test.ts src/lib/efa-communications.client.test.ts src/lib/efa-communications.queue.test.ts src/components/EfaCommunicationStepper.test.tsx src/db/schema.test.ts`: exit 0; 6 files, 58 tests.
- `npm run typecheck`: exit 0. `npm run build`: exit 0, with existing Vite path plugin, test-route file, and unrelated deprecated `inputValidator()` warnings. `git diff --check`: exit 0. Prettier check/write on changed TS, JSON, and Markdown sources completed successfully.
- No changes to dispatch/episode lifecycle, police coordination/events, support requests, observations, staffing, public Forms/Drive, or queue records. Lifecycle writes intentionally use online server operations; transient retries within the active screen are idempotent. Work-unit commit: `37e18a0`. Independent code review and a focused parent spot check passed; real PostgreSQL migration/locking and browser behavior remain unverified. The 13B task must prevent new dispatches from selecting cancelled communications while preserving preexisting historical links.

#### 13B — Dispatch cancellation and reactivation (complete locally)

- [x] Implement dispatch lifecycle transitions while preserving linked communications and dispatch history; retain the same server authorization, audit, version/CAS, idempotency, and notice invariants.
- [x] Keep dispatch lifecycle cancellation distinct from a finalized dispatch result of `cancelled`; restore the prior draft/finalized state without changing result or timestamps.
- [x] Prevent edits/finalization and contact-event writes while cancelled; keep the dispatch readable and offer explicit reactivation.
- [x] Reject new/changed dispatch links to currently cancelled communications while preserving preexisting links to communications cancelled later and allowing unrelated dispatch edits.
- [x] Generate forward-only migration 0019; test server authorization, admin notices, audit, replay, preservation, and origin-picker behavior.

**13B implementation and verification evidence:** Dispatches now store independent `cancelled_at` and `cancelled_from_state` lifecycle metadata. The `cancel` and `reactivate` service transitions reauthorize the active EFA actor and owner/admin scope, lock and compare the expected version, replay only an identical actor/action/request hash, and write versioned operation receipts plus actor-attributed before/after audits using database time. Administrator actions create an in-app notice for the original owner only (not the acting administrator). Cancelling preserves `draft` versus `finalized`, `finalized_at`, result (including the separate result value `cancelled`), recorded times, institution, communication link, and other relationships; no row or related record is deleted. Cancelled dispatches remain listed/readable, expose their values read-only, and cannot be edited, finalized, or receive new contact-event records until reactivation. Communication choices omit currently cancelled origins except when displaying the dispatch's pre-existing historical link; the server rejects creation or changing a link to a cancelled communication but permits unrelated edits when the link is unchanged.

- Test-first RED: the new lifecycle regression failed because `service.cancel` did not exist; the origin-link regression showed dispatch creation accepted an already-cancelled communication. GREEN: targeted lifecycle, communication-origin, authorization/notice, schema, function-input, client retry-ID, and picker tests passed.
- `npm run db:generate`: exit 0; generated forward-only `drizzle/0019_low_gamma_corps.sql`, snapshot 0019, and journal entry 19. It adds nullable lifecycle metadata and updates dispatch state/audit/operation action constraints. Migration remains unapplied; no remote DB was accessed.
- `npm run test -- src/lib/efa-dispatches.server.test.ts src/lib/efa-dispatches.functions.test.ts src/lib/efa-dispatches.client.test.ts src/lib/efa-dispatches.queue.test.ts src/components/EfaDispatchStepper.test.tsx`: exit 0; 5 files, 44 tests.
- `npm run test -- src/lib/efa-dispatches.server.test.ts src/lib/efa-dispatches.functions.test.ts src/lib/efa-dispatches.client.test.ts src/components/EfaDispatchStepper.test.tsx src/db/schema.test.ts`: exit 0; 5 files, 59 tests.
- `npm run typecheck`: exit 0. `npm run build`: exit 0; existing warnings remain for Vite's `vite-tsconfig-paths`, test files under routes that are not route modules, and deprecated `inputValidator()` calls in unrelated modules. `git diff --check`: exit 0.
- The first build attempt caught a server/client import-protection violation because the lifecycle retry helper was statically imported from a `.client.ts` module. The component now resolves that helper through the existing `createClientOnlyFn` dynamic loader, and the final production build passed.
- Correctness follow-up: origin validation now requests a `FOR UPDATE` lock for a new/changed communication link within the dispatch transaction. This serializes the state check with communication cancellation: either dispatch creation commits the link first, or a cancellation committed first is observed and rejects creation. The unchanged historical-link path remains unlocked and permits unrelated edits. The fake-store concurrency regression models this ordering but does not establish real PostgreSQL lock behavior.
- Concurrency regression evidence: RED without the lock request failed because the fake store observed no locked origin read; GREEN after adding the transaction-scoped lock passed `npm run test -- src/lib/efa-dispatches.server.test.ts` (1 file, 17 tests). `npm run typecheck`, `git diff --check`, and `npx prettier --check src/lib/efa-dispatches.server.ts src/lib/efa-dispatches.server.test.ts` passed after the correction. No migration was applied.
- No support request, police coordination/event, observation, staffing, episode, or public Forms/Drive lifecycle behavior was changed. No migration or remote database operation was performed. Work-unit commit: `1ac9999`. Independent code review and focused parent spot check passed; live PostgreSQL locking and browser behavior remain unverified.

#### 13C — Episode cancellation and reactivation (complete locally)

- [x] Add episode cancellation/reactivation as lifecycle metadata distinct from normal closure, preserving the prior `draft|closed` state and `closedAt`.
- [x] Keep cancelled episodes visible but uneditable/unclosable; explicitly reactivate to restore the exact previous state without changing or deleting children.
- [x] Block cancellation while any non-cancelled call or dispatch remains; serialize parent cancellation against call/dispatch creation and child reactivation with parent-row locks.
- [x] Recheck active owner/admin authorization server-side; enforce expected-version CAS, replay-safe operation receipts, actor/DB-time audit, and admin-only notices to the original owner.
- [x] Add accessible confirmation/status controls with an operation ID retained across uncertain retries; generate but do not apply forward-only migration 0020.

**13C implementation and verification evidence:** Episodes now have separate nullable cancellation timestamp/prior-state metadata; normal closure and cancellation retain distinct values, and reactivation clears only lifecycle metadata. Server-side cancellation locks the episode row before checking non-cancelled child records, performs versioned audit/operation writes, and sends an administrator notice only to the original owner. Child communication/dispatch creation checks the locked parent and rejects cancelled episodes; their reactivation locks parent before child, preventing a child from becoming active after the cancellation check. Existing children and historical links remain untouched. Cancelled episodes remain readable with a distinct status and cannot be edited or normally closed until reactivated. UI lifecycle retries retain the same operation ID for the same episode/version/action after an uncertain response.

- Test-first RED: new service tests failed because `service.cancel` did not exist. GREEN: focused cancellation, child gate/lock-order, dispatch/communication, and UI regression tests passed.
- `npm run db:generate`: exit 0; generated `drizzle/0020_ancient_kabuki.sql`, snapshot 0020, and journal entry 20. Migration is forward-only and unapplied; no remote DB was accessed.
- `npm run test -- src/lib/efa-episodes.server.test.ts src/lib/efa-episodes.functions.test.ts src/lib/efa-communications.server.test.ts src/lib/efa-dispatches.server.test.ts src/components/EfaEpisodePanel.test.tsx`: exit 0; 5 files, 59 tests. The broader schema-inclusive focused run passed 6 files, 80 tests.
- `npm run typecheck`: exit 0. `npm run build`: exit 0, retaining existing Vite path-plugin, route-test-file, and unrelated deprecated `inputValidator()` warnings. `git diff --check`: exit 0.
- No migration was applied and no live PostgreSQL locking was tested. The deterministic fakes assert parent-before-child lock requests; they do not prove PostgreSQL runtime behavior. Work-unit commit: `77aadcf` (`feat(efa): audit episode cancellation and reactivation`). Independent code review and focused parent spot check passed.

**Excluded from task 13:** Police coordination/events, support requests, observations, and staffing lifecycle changes.

### Final integration

- [x] Verify cross-workflow invariants and update the user-facing EFA workflow documentation as authorized. Evidence: reviewed lifecycle, queue/privacy, catalog, staffing-plan, and guard UI behavior; added `docs/efa-expanded-mvp-guide.md` without changing public Forms.
- [x] Record checks, remaining operational/database limitations, work-unit boundaries, and parent-selected delivery decisions. Evidence: local verification and pending operational checks are recorded below; delivery remains user-selected feature-branch chain, with no push or PR.

## Final integration evidence

- Full local test suite: 54 files, 335 tests passed. Typecheck, production build, `npx drizzle-kit check`, scoped lint (0 errors; 6 Fast Refresh warnings), and `git diff --check` passed. Full lint remains unverified: it stalled for more than four minutes.
- `npx prettier --check` and structural/link checks for the two edited Markdown files are recorded after readback.
- This session did not apply migrations 0012–0020; their actual status in the configured database is unverified. Neon migration execution and real PostgreSQL locking remain unverified; actual browser/IndexedDB behavior also remains unverified.
- Local implementation and documentation are complete. Operational rollout is pending the configured-environment migration and live browser/database verification. No push or PR was made. The user selected a feature-branch chain; Engram mirror remains pending because no registered session identity was available. Pre-existing dirty files were preserved.

## Next step

After the responsible operator confirms the target environment and database configuration, apply pending migrations using `npm run db:migrate`, then verify live locking and browser/IndexedDB behavior before institutional use.
