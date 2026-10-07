# Active-guard service workspace

Implement the approved UX changes to `/episodios-efa` and independent manual service closure, preserving audited data, permissions, local-operation recovery and the existing public forms.

## Authorized outcome

- Compact the private account header: collapsed identity summary, desktop mouse-hover expansion, accessible keyboard/touch toggle, reduced spacing without shrinking touch targets. Roles/account actions remain available under their existing permissions.
- Show a blank form titled `Nuevo episodio` with the save CTA `Guardar borrador`; remove redundant reset-style creation controls. Typing alone does not save to the DB. Existing edits remain explicit and must not be silently discarded.
- Group calls, dispatches, police coordination and observations into a clearly active workspace near the selected episode. Changing sections must preserve unsent state or explicitly protect it; never silently unmount and discard an editor.
- This workspace lists only episodes whose origin is the current user's active EFA guard. Show active services first, recent event date first within each state; use text plus soft background distinction for closed services. Historical data remains in DB and existing read APIs; a separate full-history/filter view is deferred until after MVP.
- Add an explicit `Cerrar servicio` action. It closes the episode itself, independently of calls, dispatches and the guard; no cascading child closure or new child-edit restriction. Existing correction permissions remain. No reopen/general void/reactivation workflow is added.
- Closing uses fresh permissions, owner/admin checks, optimistic versioning, stable operation identity, append-only audit and owner notices for real admin changes. Preserve durable local pending operations and exact receipt checks for the new operation.
- Keep legacy DB `draft` as the internal active state and introduce `closed` plus a server-owned closure timestamp. Do not infer closure from children or absence of observations.

## Delivery and constraints

- Branch `codex/efa-active-guard-workspace`, base `48a964d`; single writer, delegated tasks with exact edit surfaces.
- Forecast approximately 1,000–1,800 authored changed lines, generated snapshot excluded; coherent behavior/test units, advisory size budget only. Reuse agreed `feature-branch-chain`; no remote PR/push/publication.
- RDD explicitly OFF for this clone; no native review or mode changes. The latest read-only mode command encountered a filesystem permission error; retained user OFF preference is not overridden.
- No `.env`, credentials, authenticated browser sessions, network/DB connection or real migration execution. Additive migration generation offline only, never edit prior migration SQL/snapshots.
- Preserve unrelated working changes, including the external pending-spinner copy and intentional staged bootstrap untracking. Commit only exact feature paths.
- Engram mirror `odd/efa-active-guard-workspace/tasks` pending because the host did not register runtime identity; no memory tools or substitute session/CLI saves.

## Tasks

- [x] **C1 — Audited service closure.** Delegated single-writer route: extend the existing episode state, snapshot allowlists, service/store, server function, and tests; generate only additive migration 0011 and matching snapshot/journal offline. Add server-owned `closedAt` plus `draft | closed` state, a dedicated close operation/receipt and `closed` audit action. Require a fresh active EFA/admin actor and owner/admin authorization; lock the episode before receipt lookup, enforce expected version, hash actor/action/payload/version intent, and preserve exact operation replay. A real close advances version once, captures before/after including state/timestamp, and creates a recipient-only owner notice for administrator corrections. New no-change closes of already-closed episodes keep their prior `closedAt` and version while recording only a stable receipt; replays return the current episode plus original applied version. Existing corrections after closure remain allowed without reopening or changing closure time. Test real guard state and verify closure makes no guard/child mutation; do not infer closure from calls/dispatches or restrict children. Keep migration generated, additive, and unapplied.
- [ ] **C2 — Active-guard workspace and closure recovery.** Delegated route: typed client/queue, episode UI and tests. Safely persist/retry/restore close operations, differentiate confirmation from cleanup, restrict displayed list to active guard, order active/recent, distinguish state with text/background, simplify creation and group subsections while protecting editor state. Compact operational notices, technical help and audit detail without concealing errors. Keep current child workflows usable in any order.
- [ ] **H1 — Compact account header.** Delegated route: shared shell/component and tests. Desktop hover and keyboard access, explicit touch toggle, reduced spacing, unchanged roles/logout/admin navigation. Collapse must not hide focused controls or lose error feedback.
- [ ] **V1 — Final integration checks.** Delegated route: full tests/typecheck/build, scoped lint/format and independent production-binding checks. Parent spot checks and selective commits; report browser/IndexedDB/PostgreSQL limits and migration instruction honestly.

## Verification policy

- Meaningful deterministic Vitest RED before behavior implementation, then GREEN; no invented failure proof. Tests must cover actual production bindings, not unused helpers alone.
- Normalize changed files before final checks. Per unit: focused tests, full `npm.cmd run test`, `npm.cmd run typecheck`, `npm.cmd run build`, scoped ESLint/Prettier and `git diff --check`.
- Independent verification for server authorization/idempotency and async queue/editor boundaries; parent reruns one reported command and structurally reads one bounded source sample.
- SQL/snapshot inspection and fake transactions do not prove real PostgreSQL rollback/locks/concurrency. SSR/router tests do not prove browser touch/hover/focus or real IndexedDB durability.
- Each task closes with a selective local Conventional Commit and recorded identity; no AI attribution. Work-unit rollback must not include unrelated changes.

## Exploration evidence

- Existing episode state is `draft` only; SQL audit and operation allowlists admit `created`/`updated` only. Journal ends at index 10; next generated migration is 0011.
- Current episode cards and several independent child panels coexist; panels render after the entire list and conditional removal can discard unsent child state.
- The route supplies accessible episode history plus the user's active guard. Apply a display-scope filter without deleting data or changing existing read authorization.
- `Nuevo episodio` currently clears an already visible form; the actual persistence action is `Guardar borrador`. Account shell is currently fully expanded.

## Progress and next step

Exploration is complete. C1 implementation is present locally; its checkbox remains open pending parent verification. The service uses the episode row lock before operation lookup, fresh EFA/admin and owner checks, expected-version compare-and-swap, server closure time, before/after audit snapshots, stable operation hashing/replay, and recipient-only administrator notices. Closing leaves guard, call, dispatch, coordination, and observation records unchanged; corrections preserve `closed` and `closedAt`.

### C1 verification observed

- RED: before the close service method existed, the focused server suite showed the three new closure scenarios failing with `service.close is not a function` while the 12 prior server tests passed.
- GREEN: `npm.cmd run test -- src/db/schema.test.ts src/lib/efa-episodes.server.test.ts src/lib/efa-episodes.functions.test.ts` — 37/37 tests passed.
- `npm.cmd run test` — 250/250 tests passed across 42 files.
- `npm.cmd run typecheck` — passed after making the display DTO's new `closedAt` field optional for existing panel fixtures.
- `npm.cmd run build` — passed; existing Vite path-plugin and TanStack validator deprecation warnings remain.
- `npx.cmd --no-install eslint src/db/schema.ts src/db/schema.test.ts src/lib/efa-episodes.server.ts src/lib/efa-episodes.server.test.ts src/lib/efa-episodes.functions.ts src/lib/efa-episodes.functions.test.ts src/components/EfaEpisodePanel.tsx` — passed.
- `npm.cmd run db:generate -- --name=efa_episode_closure` — generated additive `0011`; a second run reported no schema changes. No database was connected and the migration remains unapplied.
- PostgreSQL transaction rollback, row-lock behavior, and deployed migration compatibility remain unverified against a live database. Parent verification and selective commit are pending; C2, H1, and V1 remain open.

- C1 independent closure: PASS; focused schema/service/API validators 37/37 plus typecheck. Parent service spot check passed 15/15 and structurally verified server-owned closedAt, preserved owner and isolated episode mutation. API handlers were inspected structurally, not authenticated in a browser. Fake-store tests do not prove real child integration or PostgreSQL locks/rollback.
- C1 rollback boundary: additive episode closure schema/service/API and corresponding types/tests; do not roll back independent call/dispatch workflows or prior migrations. Migration 0011 remains prepared, not applied. C2/H1/V1 remain pending.
