# Feature: efa-mobile-hygiene

Branch: `feat/efa-mobile-hygiene` (chained on `feat/efa-call-finalize-cta`, unpushed)

## Objective
Let the guard record, per active mobile, the period that starts when the mobile asks by radio for "higiene y reposición" and ends when it is declared "disponible" again by handheld radio (handy). Two CTAs inside each mobile card, re-editable. Open periods at guard close are marked "no informado" without blocking the close.

## Facts (verified by explorer, path:line may shift)
- Mobile catalog: `efa_base` (`src/db/schema.ts:140`). A mobile is "active" when its base is selected in an open guard via append-only `efa_guard_base_event` (`schema.ts:326`; `efa-guards.server.ts:125-143`, `setBases` ~188). No stored status.
- `efa_mobile_arrival` (`schema.ts:350-386`) is per ROLE (unique guardId+baseId+role), so it cannot hold hygiene periods. Create/update/delete in `src/lib/efa-mobile-arrivals.server.ts` (~262/437/518) use `expectedVersion`, `clientOperationId` replays, request hash, audit table `efa_mobile_arrival_audit` (jsonb before/after, allowlisted keys check), receipts `efa_mobile_arrival_operation`; migration `drizzle/0021_efa_mobile_arrivals.sql` has append-only triggers (hand-written SQL). Functions: `efa-mobile-arrivals.functions.ts` (zod strict, `requireEfa`). UI: `EfaMobileArrivalPanel.tsx` one `<article aria-label="Móvil …">` per base (~415), role rows (~299), mounted in `EfaGuardPanel.tsx` (~927 open guard, ~1151 historical/admin). State loaded in `src/routes/guardia-efa.tsx` (~31). No offline queue for arrivals (online, stable operation ids).
- Precedent for one-open-period tables: `efa_staffing_movement` (`schema.ts:510-549`) with a partial unique index (one open per parent) and a time-order check.
- Latest migration is `drizzle/0022_efa_participation_capture.sql` (+ `drizzle/meta/0022_snapshot.json`, `_journal.json`). Migrations are applied only with explicit user authorization (`docs/efa-access-setup.md`); the journal may not match the real DB.
- Nothing in `src` mentions higiene/reposición/handy today.

## Decisions (user-approved)
- Period is per MOBILE (base) and guard, not per role and not tied to a dispatch/service.
- New table `efa_mobile_hygiene_period` modeled on `efa_staffing_movement` + the arrivals pattern: guardId, baseId, baseNameSnapshot, requestedAt, availableAt (nullable = open), `notInformed` flag/status, note, clientCreationKey, version, createdByUserId, createdAt/updatedAt, deletedAt (soft delete), plus `_audit` and `_operation` tables with append-only triggers like 0021.
- Constraints: unique (guardId, clientCreationKey); `availableAt >= requestedAt`; partial unique index one open (availableAt null, not deleted, not notInformed) period per (guardId, baseId); several closed periods per mobile per guard allowed.
- Times: "Ahora" (server time) or manual (`datetime-local`), editable later (radio calls are often logged after the fact). Validate both times inside the guard window; mobile still selected; guard open for writes (as arrivals).
- CTAs inside each mobile card: "Solicitó higiene y reposición" (opens a period) and "Disponible (handy)" (closes the open period); plus edit/delete of a period (soft delete) with expectedVersion. Only in the open guard; historical/admin guards read-only list.
- Closing the guard does NOT block: any open period is marked "no informado" (availableAt stays null, `notInformed` true) inside the same close transaction, with audit.
- First version is ONLINE only (no offline queue), like mobile arrivals.
- The migration file is written but NEVER applied by the agent: do not run `db:migrate`, `drizzle-kit push` or any DB command.

## Constraints
- UI copy Spanish (neutral, simple, nurses); code/comments/identifiers English.
- Permissions same as arrivals: role `efa` + guard owner for writes; admin read.
- Hand-write SQL for triggers/checks like 0021; keep the drizzle journal/snapshot consistent with how 0021/0022 did it (generate with drizzle-kit ONLY if it works offline without a DB connection; otherwise hand-write following the 0022 files; report which).
- Never push; never rewrite published history (Lovable-connected repo). ~400 authored changed lines per task is a planning heuristic only.

## Tasks
- [x] T1 — Data layer: schema tables, SQL migration 0023 (not applied), audit/operation tables, constraints, triggers; schema tests.
- [x] T2 — Server layer: service + functions (request open, mark available, edit, delete, list per guard), idempotency/expectedVersion/audit, guard-close marks open periods "no informado"; tests alongside.
- [x] T3 — UI: two CTAs + period list/edit inside each mobile card, wiring in guard panel/route, "no informado" and duration display; tests alongside.

## Acceptance criteria
- Each active mobile card in an open guard shows the two CTAs and its periods (requested time, available time, duration, "No informado").
- Cannot open a second period while one is open; cannot set available before requested; edits use versioning.
- Closing a guard with an open period succeeds and marks it "no informado".
- Migration file exists, is NOT applied; summary of how to apply is in the task doc.
- `npx vitest run <touched tests>`, `npx tsc --noEmit -p .` (baseline 6 pre-existing errors: RouteTransition.tsx x2, SeliarMobileNav.tsx x2, router.tsx, routes/__root.tsx), `npm run build` pass; known pre-existing failing test `EfaObservationPanel.test.tsx` "keeps the neutral empty-history context in a compact read-only server render".

## Progress
- Route: delegated direct, one writer. T1-T3 done; migration NOT applied.
- Review assessment: pending.

## Evidence
- Commits: T1 `0c15b54`, T2 `c1287a6`, T3 `4456712`.
- T1: migration generated offline with `drizzle-kit generate --name efa_mobile_hygiene_periods` (no DB connection; `DATABASE_URL` empty), then the append-only/soft-delete triggers were appended by hand like 0021. `npx vitest run src/db/schema.test.ts`: 26 passed. No RED observed: schema, migration and tests were written before the first run. Not verifiable without a database: the partial unique index, CHECK constraints and triggers were only reviewed as SQL, never executed.

- T2: `npx vitest run src/lib/efa-mobile-hygiene src/lib/efa-guards src/lib/efa-labels.test.ts` passed (hygiene service 14 tests + functions 3, guards incl. 2 new close tests, labels 9). `npx tsc --noEmit -p .`: only the 6 baseline errors. No RED observed (tests written after implementation). Service rules: one open period per (guard, base) checked under the guard row lock, explicit times must be >= guard start and <= database now + 5 min drift, available >= requested, edits cannot clear an available time, guard close flags open periods `notInformed` (audit action `not_informed`, no operation receipt) after the guard row update in the same transaction. Only unit-tested against a fake store; the Drizzle layer (`efa-mobile-hygiene.server.db.ts` and the close query in `efa-guards.server.ts`) is type-checked, never run.

- T3: new `EfaMobileHygienePanel` rendered inside each selected mobile card (after the role rows) by `EfaMobileArrivalPanel` when `hygienePeriods`/`onHygieneChange` are passed; data loaded in `guardia-efa.tsx` and `EfaGuardPanel` (`initialHygiene`, refreshed with the guards). Writes reuse `onArrivalMutationStart` so base changes and guard close wait for pending hygiene writes. Tests are SSR (`renderToStaticMarkup`): they check markup, disabled states and pure helpers; no click, confirm dialog or server round trip was exercised. `EfaMobileHygienePanel.test.tsx` 9 passed, `EfaMobileArrivalPanel.test.tsx` 15 passed, `EfaGuardPanel.test.tsx` 4 passed / 11 failed with `No QueryClient set` (the same 11 fail on HEAD without these changes; the 2 new tests wrap the panel in a QueryClientProvider). `npx tsc --noEmit -p .`: 6 baseline errors only. `npm run build`: exit 0.

## How to apply the migration (not done)
Nothing was applied. When the user explicitly authorizes a target database (see `docs/efa-access-setup.md`):
1. Confirm the real schema/history of the target: the journal may not match the database.
2. Apply `drizzle/0023_efa_mobile_hygiene_periods.sql` through the authorized channel (`npm run db:migrate`, or run the SQL statements in order in the SQL editor; statements are separated by `--> statement-breakpoint`). `generate`/`push` do not create the triggers.
3. Apply it BEFORE deploying this branch: closing a guard now touches `efa_mobile_hygiene_period` in the same transaction, and `/guardia-efa` loads the periods, so both fail while the tables do not exist.

## Next step
Review the branch, then apply migration 0023 with explicit authorization BEFORE deploying (see "How to apply"). Review assessment of the three work units is still pending.
