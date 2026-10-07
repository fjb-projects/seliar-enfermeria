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

- [x] **C1 — Audited service closure.** Delegated single-writer route: extend the existing episode state, snapshot allowlists, service/store, server function, and tests; generate only additive migration 0011 and matching snapshot/journal offline. Add server-owned `closedAt` plus `draft | closed` state, a dedicated close operation/receipt and `closed` audit action. Require a fresh active EFA/admin actor and owner/admin authorization; lock the episode before receipt lookup, enforce expected version, hash actor/action/payload/version intent, and preserve exact operation replay. A real close advances version once, captures before/after including state/timestamp, and creates a recipient-only owner notice for administrator corrections. New no-change closes of already-closed episodes keep their prior `closedAt` and version while recording only a stable receipt; replays return the current episode plus original applied version. Existing corrections after closure remain allowed without reopening or changing closure time. Test real guard state and verify closure makes no guard/child mutation; do not infer closure from calls/dispatches or restrict children. Keep migration generated, additive, and unapplied. Commit: `5f2f287a87f825c27cb4728ebabdeb7a1286bd79`.
- [x] **C2 — Active-guard workspace and closure recovery.** Delegated route across the episode route, panel, a focused workspace component, typed close queue/client, tests, and this task file. Load the signed-in user's own open guard for EFA writers; keep the existing active-account readonly guard-history access for revoked EFA users, without granting writes. Show only episodes originating from that open guard in this workspace, active first and most recent event first within each state, with visible `Activo`/`Cerrado` text and soft neutral state styling. Make a clean blank `Nuevo episodio` form and explicit `Guardar borrador` action, with explicit edit/cancel rather than silent form reset. Add independently confirmed `Cerrar servicio`, persisting a frozen stable operation before sending, preserving exact replay and distinguishing confirmed server mutation from local queue cleanup. No reopen/cascade/child restriction; existing corrections after closure remain available. Group child tools around the selected episode and protect unsent main/child editors when changing workspace section or episode; do not mount unseen queues eagerly. Keep actionable errors and recovery visible, and label internal `draft` as `Activo`. Tests must exercise production-bound selector, close submission/queue receipt paths and editor-preservation behavior; SSR/fake tests do not claim browser touch/IndexedDB proof. Checks: focused episode panel/workspace/client/queue/route tests; full test, typecheck, build, scoped lint/format and diff checks. No database or migration work in C2.
- [x] **H1 — Compact account header.** Current bounded route: `PrivateAccountShell` and focused component tests. Keep the account name visible in a compact summary; reveal email, roles, admin navigation, and logout on fine-pointer mouse hover or the accessible `Cuenta` toggle. Keyboard focus must not force the panel open, toggling closed must work while the toggle retains focus, and pointer leave must not hide a focused action. Touch relies on the button, not synthetic hover. Reduce padding/gaps while retaining 44px action targets and keep logout errors visible outside the collapsible content. No auth or route changes.
- [x] **V1 — Final integration checks.** Delegated route: full tests/typecheck/build, scoped lint/format and independent production-binding checks. Parent spot checks and selective commits; report browser/IndexedDB/PostgreSQL limits and migration instruction honestly.

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

Exploration is complete. C1 is committed as `5f2f287a87f825c27cb4728ebabdeb7a1286bd79` and independently verified PASS by the parent. C2 implementation is locally complete and awaiting parent verification; the task checkbox remains open until that check. The route uses the existing active-account guard read and existing episode/child APIs; no migration or server authorization changes were made.

### C2 verification observed

- RED: the initial focused run failed because the new close-operation helper and workspace component were not yet implemented; the five pre-existing client tests passed. After implementation, the focused suite passed.
- `npm.cmd run test -- src/lib/efa-episodes.client.test.ts src/lib/efa-episodes.queue.test.ts src/components/EfaEpisodeWorkspace.test.tsx src/components/EfaEpisodePanel.test.tsx src/routes/episodios-efa.test.tsx` — 32/32 tests passed across five files.
- `npm.cmd run test` — 257/257 tests passed across 44 files.
- `npm.cmd run typecheck` — passed.
- `npm.cmd run build` — passed. Existing Vite path-plugin and TanStack validator deprecation warnings remain; route scanning also warned that the new route test file does not export a `Route`, and excluded it from the generated route tree.
- Scoped ESLint over all ten changed TypeScript/TSX files — no errors; three `react-refresh/only-export-components` warnings for testable exported selection/load helpers in the workspace and route modules.
- Scoped Prettier check and `git diff --check` over the C2 surfaces — passed.
- No database, browser-auth session, or real IndexedDB operation was used. SSR and fake-store tests do not prove device-level IndexedDB durability, touch/focus behavior, or PostgreSQL behavior. The close migration from C1 remains unapplied.
- C2 adds 92 lines for the workspace, 67 for its tests, and 34 for route-loader tests; the episode panel received a broader workspace integration/refactor. Parent verification and selective commit remain pending. Preserve unrelated user changes and staged bootstrap deletions.

### H1 verification observed

- RED: the initial `npm.cmd run test -- src/components/PrivateAccountShell.test.tsx` failed because the current shell had no collapsed toggle or interaction reducer; the test also surfaced an incomplete `react-start` mock, which was corrected before the production-behavior RED was observed.
- GREEN: `npm.cmd run test -- src/components/PrivateAccountShell.test.tsx` — 3/3 tests passed. Coverage checks the initially collapsed rendered shell, mouse expansion, preserving visibility while focus remains inside, explicit toggle-close, and no touch-pointer hover expansion. The component uses the same tested reducer for pointer, focus, and toggle events.
- `npm.cmd run test` — 260/260 tests passed across 45 files.
- `npm.cmd run typecheck` and `npm.cmd run build` — passed. Build retains the existing Vite path-plugin and TanStack validator warnings and route scan warning for the test file under `src/routes`.
- Scoped ESLint — no errors; one `react-refresh/only-export-components` warning because the reducer is exported for direct deterministic testing. Scoped Prettier check and `git diff --check` — passed.
- SSR and reducer tests do not prove browser hover/touch/focus behavior or visual spacing. No credentials, browser session, network, database, or migration was used. H1 remains open pending parent verification; C2 remains open pending its own parent verification.

### C2 targeted correction tracking

- Parent review found four close-path gaps: incomplete close receipt validation; automatic resend after confirmed cleanup failure or mismatched receipt; stale client permission after IndexedDB awaits and before conflict cleanup; and delayed adoption of a server-confirmed closed episode until after a fallible refresh.
- Correction acceptance: validate close action, operation/entity identity, applied/current versions, closed state, closure timestamp and result flags; persist a terminal queue state before cleanup and fence any storage-write failure in memory; re-read the active session for the queued actor before close/rebase side effects; adopt the confirmed close DTO before refresh and preserve it against stale list results.
- Test plan: controller-level receipt/reconcile/retry regressions, delayed storage/session authorization regression, and confirmed-close merge tests bound to the panel's actual close lifecycle. Run focused RED/GREEN, then normalize all C2/H1 files and execute the full checks once. C2/H1 remain open pending parent recheck.

### H1 implementation tracking

- H1 is now active after C2's local verification. Allowed surfaces are the private account shell, its focused tests, and this task document only.
- Acceptance: initially collapsed SSR summary; pointer-type-gated mouse hover; keyboard/touch `Cuenta` toggle with `aria-expanded`/`aria-controls`; pointer/focus exit does not conceal focused actions; reduced shell spacing without smaller action targets; account name and error feedback remain visible.
- Verification plan: focused component tests first, then full tests, typecheck, build, scoped ESLint/Prettier, and `git diff --check`. No browser interaction proof is assumed from SSR tests.

### Approved visual refinement and final local verification

- The private-account disclosure now lives in the shared `WorkflowHeader` account slot next to the logo; private pages opt into a compact mobile logo while public-header defaults remain unchanged. The collapsed button exposes only the exact stored `session.user.name` and a decorative chevron; email, roles, administrator link, and logout stay in the animated disclosure. Fine-pointer mouse capability is still required for hover; keyboard/touch use the accessible toggle, and a focused account action is not hidden on pointer exit. Logout errors remain outside the disclosure.
- Episode cards now use compact neutral/sky state surfaces, short action labels, lucide icons with text, and 44px minimum targets. The bounded active-guard list is titled `Servicios de esta guardia` for both admins and EFA users. Its card actions are individually identified by soft sky (workspace), indigo (history), amber (edit), and slate (close) surfaces in light and dark themes; state text and colors remain separate. Each workspace section has its own soft contrasting surface and icon. The redundant `Área de trabajo abierta` label is gone; an icon-labeled control collapses/expands the workspace while preserving mounted section editors. The workspace heading receives focus and reduced-motion-safe scrolling only when opened by the user.
- Test-first evidence for the UI refinement: `WorkflowHeader.test.tsx` and account-shell assertions first failed because the account slot/compact logo was unsupported; the workspace collapse reducer assertion first failed because no production-bound toggle existed. After implementation, the focused suite passed 49/49 across seven files. These SSR/reducer tests do not prove real browser hover, touch, keyboard focus, visual transitions, or IndexedDB durability.
- Final checks after normalization: `npm.cmd run test` — 274/274 across 46 files; `npm.cmd run typecheck` — passed; `npm.cmd run build` — passed. Build retains existing Vite path-plugin/TanStack validator deprecation warnings and route-scan warning for `src/routes/episodios-efa.test.tsx`. Scoped ESLint — zero errors, six existing `react-refresh/only-export-components` warnings; scoped Prettier check and `git diff --check` — passed.
- Parent readback follow-up: the EfaEpisodePanel SSR suite now asserts the active-guard title, absence of history-only/open-state copy, and that each action label is rendered inside its matching semantic-soft-color button. `npm.cmd run test -- src/components/EfaEpisodePanel.test.tsx` — 6/6 passed; `npm.cmd run typecheck` — passed after the follow-up.
- A build attempt initially exposed a server/client import-protection error from statically importing close helpers from `efa-episodes.client.ts`; the component now obtains those helpers through its existing `createClientOnlyFn` loader. The final build above passed. The local migration remains unapplied; no browser, database, network, or credentials were used. C2/H1 checkboxes remain open for parent verification.

### C1 verification observed

- RED: before the close service method existed, the focused server suite showed the three new closure scenarios failing with `service.close is not a function` while the 12 prior server tests passed.
- GREEN: `npm.cmd run test -- src/db/schema.test.ts src/lib/efa-episodes.server.test.ts src/lib/efa-episodes.functions.test.ts` — 37/37 tests passed.
- `npm.cmd run test` — 250/250 tests passed across 42 files.
- `npm.cmd run typecheck` — passed after making the display DTO's new `closedAt` field optional for existing panel fixtures.
- `npm.cmd run build` — passed; existing Vite path-plugin and TanStack validator deprecation warnings remain.
- `npx.cmd --no-install eslint src/db/schema.ts src/db/schema.test.ts src/lib/efa-episodes.server.ts src/lib/efa-episodes.server.test.ts src/lib/efa-episodes.functions.ts src/lib/efa-episodes.functions.test.ts src/components/EfaEpisodePanel.tsx` — passed.
- `npm.cmd run db:generate -- --name=efa_episode_closure` — generated additive `0011`; a second run reported no schema changes. No database was connected and the migration remains unapplied.
- PostgreSQL transaction rollback, row-lock behavior, and deployed migration compatibility remain unverified against a live database. C1 is locally committed; C2, H1, and V1 remain open.

- C1 independent closure: PASS; focused schema/service/API validators 37/37 plus typecheck. Parent service spot check passed 15/15 and structurally verified server-owned closedAt, preserved owner and isolated episode mutation. API handlers were inspected structurally, not authenticated in a browser. Fake-store tests do not prove real child integration or PostgreSQL locks/rollback.
- C1 rollback boundary: additive episode closure schema/service/API and corresponding types/tests; do not roll back independent call/dispatch workflows or prior migrations. Migration 0011 remains prepared, not applied. C2/H1/V1 remain pending.

## Final local closure — 2026-10-07

- C2 and H1 independently verified PASS. The close queue validates the complete receipt, pauses mismatches, fences confirmed cleanup from redispatch, revalidates the acting account immediately before close/rebase, and adopts confirmed closed state before fallible refresh.
- The private account disclosure now shares the branded header: compact mobile logo, exact stored account name and chevron, fine-pointer hover, keyboard/touch toggle, reduced-motion transition, and unchanged account actions. Public header defaults remain unchanged.
- `/episodios-efa` now shows `Servicios de esta guardia` only for the current own open guard, active services before closed services and most recent first. Cards expose text plus icons and distinct soft surfaces. The selected workspace is adjacent to its service, uses distinct section surfaces, and can collapse without unmounting visited child editors.
- Creation is presented as `Nuevo episodio`; `Guardar borrador` remains the explicit persistence action. `Cerrar servicio` is independent from calls, dispatches and guard closure. No full-history view, reopen, cascading close or automatic episode completion was added.
- Final verification: 274/274 tests across 46 files; typecheck and build passed; scoped ESLint reported zero errors and six existing-style Fast Refresh warnings; Prettier and `git diff --check` passed. Parent spot check passed 32/32 and independent focused verification passed 49/49.
- Limits: no authenticated browser/touch/hover visual session, real IndexedDB durability, PostgreSQL locks/rollback or migration execution was verified. Migration 0011 remains prepared and unapplied. RDD remains OFF; no remote operation or publication occurred. Engram mirror remains pending because no authoritative runtime session identity is registered.
- Rollback boundary for this unit: active-guard route/panel workspace, close client/queue recovery, shared private header slot/disclosure and their tests. Preserve C1 server/schema/migration and all pre-existing public forms.
