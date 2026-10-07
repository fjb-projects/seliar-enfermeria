# Expanded EFA MVP

Implement the next EFA operational workflows without changing public forms or external integrations. The first work unit records observed staffing-period facts, distinct from planned coverage, using anonymous roles rather than personal identities.

**Status:** Task 10A complete locally; tasks 10B, 11, 12, 13, and final integration remain.
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

**10B implementation and verification evidence (commit pending):** Added immutable cycle-plan versions and dated exceptions, with an explicit cycle anchor, 1–366-day cycle length, role-specific day slots, optional labels (including A/B/C/D), and arbitrary same-day multiple slots/handovers. Base targets are keyed by immutable `efa_base.id` with a restrictive foreign key; display-name changes preserve plan and exception identity, and reusing an old name for another base does not match prior records. Mobile targets remain separately keyed by normalized mobile name. Buenos Aires operational local dates (`America/Argentina/Buenos_Aires`) govern future effective dates and exception revisions; mutations now require a date strictly after the current operational day, preserving elapsed-day history, while exact idempotent replays remain safe. Admin date inputs enforce the next operational date as their minimum, and the EFA preview initializes its range from the Buenos Aires day rather than UTC. Slots explicitly store whether the end occurs the same or next day, supporting overnight and 24-hour coverage; preview includes explicit slots started on the preceding date when they overlap the selected range, including date-specific overnight exceptions, without duplicating them or inventing gaps. Preview returns and renders both calendar boundaries and still does not add an automatic 22:00–06:00 segment. Dated exceptions replace the full day's planned slots; an empty exception deliberately means no planned coverage. Plan and exception writes are append-only/audited, and reused operation IDs with different payloads are rejected. Anonymous role categories (`nurse`, `driver`, `doctor`) remain separate from actual observed staffing, with no roster/person identifiers. RED/GREEN evidence: the new strict-date and D+1 exception-overlap tests failed against prior behavior, then passed after correction. Verification: focused tests pass (18/18); `npm run typecheck`, `npm run build`, `git diff --check`, and `npx prettier --check` all pass. Build retains existing Vite route-file and deprecated inputValidator warnings. No migration/schema change was needed for this correction; existing 0013/0014 files were not applied or modified.

The admin account route now includes a catalog-ID base selector, mobile editor, effective-version history, dated exception slots, and preview. EFA guard users query a read-only preview by selected base ID; copy explicitly distinguishes planned coverage from observed staffing and mobile availability. Unchanged retries reuse the pending operation ID for plan and exception writes after uncertain responses.

- Test-first evidence: the correction's focused test run initially failed on missing immutable target identity, Buenos Aires date enforcement, overnight end boundaries, and retry-ID behavior (6 failing tests). After correction, the focused command passed: 3 files, 15 tests (plan service, admin editor, and guard panel).
- `npm run db:generate`: exit 0; the original forward-only `drizzle/0013_keen_risque.sql` remains unchanged, and the follow-up `drizzle/0014_condemned_the_spike.sql`, snapshot 0014, and journal entry 14 add the immutable base FK/identity constraints. Neither migration was applied.
- `npm run typecheck`: exit 0.
- `npm run test -- src/lib/efa-staffing-plan.server.test.ts src/components/AdminStaffingPlan.test.tsx src/components/EfaGuardPanel.test.tsx`: exit 0; 3 files, 10 tests.
- `npm run build`: exit 0. Existing warnings remain for vite-tsconfig-paths, the `episodios-efa.test.tsx` route filename, and legacy `inputValidator()` calls in unrelated modules.
- `npx prettier --check src/lib/efa-staffing-plan.server.db.ts`: exit 0.
- `git diff --check`: exit 0.
- No remote database access or migration application; no changes to migration 0012 or unrelated pre-existing work. Work-unit commit remains pending; parent owns commit and delivery.

### 11 — EFA catalogs

- [ ] Add the required operational catalogs with role-gated maintenance, validation, audit, and focused checks.

### 12 — Correction notices and offline conflict handling

- [ ] Verify administrator-created correction notices and track read state independently for each recipient.
- [ ] Verify local draft queues remain scoped to the current user and retain pending operations safely.
- [ ] Verify retries use idempotent operation identifiers so a lost response does not create duplicates.
- [ ] Verify divergent local and server versions are shown for manual resolution; do not apply last-write-wins.
- [ ] The existing implementation is broad: inspect current behavior first and fix only gaps demonstrated by code or focused tests; do not reimplement working flows.

### 13 — Cancellation and reactivation

- [ ] Add explicit lifecycle transitions for cancellation/reactivation without destructive deletion or loss of history.

### Final integration

- [ ] Verify cross-workflow invariants and update the user-facing EFA workflow documentation as authorized.
- [ ] Record checks, remaining operational/database limitations, work-unit boundaries, and parent-selected delivery decisions.

## Next step

Implement 10B: future planned coverage patterns and dated exceptions, separate from the actual staffing periods completed in 10A. Keep existing user changes and public forms untouched.
