# Expanded EFA MVP

Implement the next EFA operational workflows without changing public forms or external integrations. The first work unit records observed staffing-period facts, distinct from planned coverage, using anonymous roles rather than personal identities.

**Status:** Task 10A implementation in progress; no task is complete until its work-unit commit and applicable checks are recorded.
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
- No remote database was accessed, and no migration was applied. Commit/work-unit identity and any native review are pending parent ownership; 10A remains in progress until that boundary is recorded.

**Independent-verifier follow-up:** The operational plan allows completing a record started during a guard after that guard closes. New staffing periods are now rejected once the guard is closed, while an existing period can still be completed under the existing owner/admin authorization. The service also requires each new departure to be at or after the previous completed arrival/return, and the period exit to be at or after the last completed arrival/return. In the UI, pending request IDs and payload fingerprints are retained across failed/uncertain actions and cleared only after the write and refresh succeed; changing the payload obtains a new ID.

The guard UI now separates `canCreate` (which is false for a closed guard) from `canEdit` (existing owner/admin access). An unfinished staffing period on a closed guard still exposes its exit control, and a pending transfer/temporary movement still exposes arrival/return completion.

- Test-first evidence: the added regression tests initially produced 3 failures (closed-guard entry, cross-event chronology, and missing stable-operation helper). A subsequent assertion-only mismatch was corrected to match the service's Spanish error text.
- `npm run test -- src/lib/efa-staffing.server.test.ts src/components/EfaGuardPanel.test.tsx`: exit 0; 2 files, 13 tests after the closed-guard UI correction (parent spot check).
- `npm run typecheck`: exit 0.
- `git diff --check`: exit 0.
- Closed-guard UI test-first evidence: the focused component test initially failed because the existing active period's exit action was hidden; after splitting create/edit capabilities, `npm run test -- src/components/EfaGuardPanel.test.tsx` passed (1 file, 5 tests). `npm run typecheck` and `git diff --check` also passed (exit 0).
- This follow-up did not change the migration or access unrelated files.

### 10B — Planned patterns and exceptions

- [ ] Model planned coverage separately from observed periods, including reusable patterns and dated exceptions.
- [ ] Preserve the distinction in UI, persistence, and tests.

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

Complete 10A as one cohesive behavior unit, observe its focused checks, and hand off without committing or changing the parent-owned access-foundation plan.
