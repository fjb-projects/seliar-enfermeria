# Feature: efa-coordination

Branch: `feat/efa-coordination` (from `origin/main` 927b3c7, unpushed)

## Objective
Add an admin-only route `/coordinacion-efa` listing every EFA guard from every user, distinguishable per user, with per-guard service totals and details. It is the base for future statistics. `/guardia-efa` shows only the current user's own guards, admin or not.

## Problem / Why
The admin history in `/guardia-efa` shows only a status pill plus dates (`EfaGuardPanel.tsx:1032-1045`), the owner as a raw `ownerUserId` (:1064), and no services at all. Mixing "my guards" with oversight in one component makes both worse and blocks growing statistics.

## Facts (verified by explorer, path:line may shift)
- Admin route pattern: `src/routes/admin-usuarios.tsx:20-29` (`beforeLoad`, `readSession`, `isAdministrator` → redirect `/panel`), and server functions call `requireAdministrator` (`src/lib/access.ts:15-38`). Newer `beforeLoad` style: `guardia-efa.tsx:17-22` (`navigationSessionQueryOptions`, `SessionLoadError`). Pages wrap content in `PrivateAccountShell`.
- A new private path must be registered in `src/lib/private-ui.ts:9-16`, `src/components/SeliarNavigationProvider.tsx:95` and `src/components/SeliarMobileNav.tsx:35-47`. Nav gating: `PrivateAccountShell.tsx:148-151` and `src/lib/efa-panel-quick-actions.ts:5-64` (`summary.isAdmin`).
- Service pattern: `createXService(store)` with `transaction(tx)`, `drizzleStore`, exported singleton; `*.functions.ts` holds zod plus `createServerFn` plus role checks and lazy `createServerOnlyFn` import. Tests use in-memory fake stores in `*.server.test.ts`.
- `efaGuards.list` (`efa-guards.server.ts:165-171`) passes `null` owner for admins → `listGuards` (:330-334) returns all. Callers of `listEfaGuards`: `guardia-efa.tsx`, `episodios-efa.tsx:13-26`, `EfaGuardPanel.tsx`, `EfaObservationPanel.tsx:494,1011,1093`.
- `user` (`schema.ts:20-28`) has `name` and `email`; no name helper exists. `efaEpisode.originGuardId` has a composite FK to `efa_guard` (`schema.ts:891-909`); state is `draft|closed` plus `cancelledAt`. `efaDispatch` (`:1221-1299`) links by `episodeId`. Arrivals, hygiene and staffing have a direct `guardId`.
- Admin-only history pieces in `EfaGuardPanel.tsx`: title/subtitle (:1020-1024), "Responsable" (:1064), end-time correction form (:1126-1170, `correctEfaGuardEnd` requires admin), and admin edit rights on observations/staffing (:1105, :1195).
- `recharts` plus `src/components/ui/chart.tsx` are installed and unused. No list pagination or URL filters exist yet.

## Decisions (user-approved)
- Route name `/coordinacion-efa` (flat file `src/routes/coordinacion-efa.tsx`), admin only.
- `/guardia-efa` history becomes "Mis guardias" for everyone.
- Admin oversight lives in a separate server module so it can grow with statistics.
- The end-time correction moves to the new view.

## Constraints
- UI copy in neutral Spanish; code, comments and identifiers in English.
- No schema change or migration expected; never run DB commands.
- Never push; never rewrite published history (Lovable-connected repo).
- About 400 authored changed lines per task is a planning heuristic only.
- Delivery strategy: `ask-on-risk`; forecast exceeds 400 lines, so propose two chained PRs (T1–T2, T3–T5) before opening any PR.

## Tasks
- [x] T1 — `efaGuards.list` returns only the actor's own guards (also for admins); update the callers' tests. Route: delegated. Commit `8bbf597` refactor(efa): list only the actor's own guards. `listGuards` now takes a required owner id; callers (`episodios-efa.tsx`, `EfaObservationPanel.tsx`) already filtered by owner, so their behavior is unchanged.
- [x] T2 — Admin oversight service `src/lib/efa-guard-oversight.server.ts` plus `.functions.ts`: all guards with owner name and email, bases, and per-guard totals (episodes draft/closed/cancelled, dispatches, arrivals, hygiene periods) using grouped queries, not N+1. Admin only. Route: delegated. Commit `a456bd3` feat(efa): add admin guard oversight service. `currentGuardBases` was extracted from `withEvents` and is shared. `listGuards` uses a fixed 8 queries; `listGuardServices` returns episodes with their dispatches. Exported view types for T4: `EfaOversightGuardView`, `EfaOversightEpisodeView`, `EfaOversightDispatchRecord`, `EfaGuardServiceTotals`, `EfaGuardOwner`. About 710 changed lines (306 of them tests), above the 400-line heuristic because of the drizzle store and fixtures.
- [x] T3 — Route `/coordinacion-efa` with admin guard, path registrations and an admin-only nav entry. Route: delegated. Commits `1d88b03` style(efa): format navigation shell files with prettier (format-only, so T3 shows only behavior; those files failed prettier lint on base) and `277699e` feat(efa): add admin coordination route. `resolveCoordinationSession` (anonymous → `/login?returnTo=%2Fcoordinacion-efa`, non-admin → `/panel`, unavailable → `SessionLoadError`). Nav entry: `coordinate-guards` quick action (admin only, shows in the mobile nav) plus a "Coordinación EFA" button next to "Administrar cuentas" in the account header. `routeTree.gen.ts` edited by hand in generator order (the generator only runs inside the Vite plugin). Fixed the stale `PrivateAccountShell.test.tsx` (it failed on base: missing navigation provider mock).
- [x] T4 — Oversight list UI. Route: delegated. Commit `42a82bd` feat(efa): show all guards in the coordination view. `src/lib/efa-coordination-filters.ts` (pure `validateCoordinationSearch`, `filterOversightGuards`, `groupGuardsByOwner`, `listGuardOwners`; dates use the Buenos Aires calendar day); `EfaCoordinationPanel.tsx` (filters, "Agrupar por usuario" toggle, list section ready for a future statistics section) and `EfaCoordinationGuardCard.tsx` (status pill, open-guard accent, times, duration, bases, totals badges, lazy services via `useQuery`). `status` is optional in search so links need no search params. About 830 changed lines (about 360 tests), above the 400-line heuristic because the view, its filters and fixtures form one unit.
- [x] T5 — Move the end-time correction to `/coordinacion-efa`; clean admin branches from the `/guardia-efa` history; show names instead of IDs where they remain. Route: delegated. Commit `7527d32` refactor(efa): keep guard history owner-only and move end correction. Correction lives on closed guards in the coordination card and reloads with `router.invalidate()`. `/guardia-efa`: always "Mis guardias", no "Responsable" or correction form, summary shows date and time, base-change actor reads "por vos" / "por otra cuenta". `isAdmin` stays on `EfaGuardPanel` because `EfaObservationPanel` still takes it; the dead `isAdmin ||` edit branches were removed (same result for own guards). Arrivals and hygiene detail stay as totals only in the coordination view.

## Acceptance criteria
- A non-admin gets redirected from `/coordinacion-efa`, and its server functions refuse non-admins.
- An admin sees every user's guards, can tell them apart by user, and sees service totals per guard.
- `/guardia-efa` shows only the current user's guards, admin included.
- Typecheck, lint and tests pass.

## Checks
`rtk npm run typecheck` (or the repo equivalent), `rtk npm run lint`, `rtk npx vitest run <touched tests>`, then the full suite at closure.

## Progress
T1–T5 done. Slices: PR 1 = T1–T2 (`8bbf597`, `a456bd3`, `595e585`); PR 2 = T3–T5 (`1d88b03`, `277699e`, `42a82bd`, `7527d32`, plus this docs commit).

### Verification evidence (T1–T2)
- T1 RED: `expected [ 'guard-owner', 'guard-admin' ] to deeply equal [ 'guard-admin' ]`; GREEN: efa-guards.server.test.ts 17/17.
- T2 RED: `TypeError: currentGuardBases is not a function` (2 failing); GREEN after extraction.
- `npx tsc --noEmit`: exit 2 with only the 6 known base errors (RouteTransition.tsx:33,46; SeliarMobileNav.tsx:283,395; router.tsx:22; __root.tsx:124).
- `npx eslint <touched files>`: no issues (scoped; full `eslint .` was killed by the system for low memory).
- Focused vitest (efa-guards server/functions, efa-guard-oversight server/functions, episodios-efa, EfaGuardPanel, EfaObservationPanel): 47 passed, 12 failed — only the known base failures (11 EfaGuardPanel "No QueryClient set", 1 EfaObservationPanel "keeps the neutral empty-history context..."). After formatting: 30/30 in the non-panel files.
- Full `npm test`: skipped because of memory pressure on the machine (parent decision); pending.

Decisions: dispatch totals are `{ total, cancelled }` with total including cancelled; soft-deleted arrivals and hygiene periods are excluded.

### Verification evidence (T3–T5)
- T3 RED: quick actions `expected undefined` for `coordinate-guards`, `safePrivateReturnPath("/coordinacion-efa")` returned `/panel`, route test failed to import the missing module; GREEN after implementation.
- T4 RED: `Cannot find module './efa-coordination-filters'`; GREEN 8/8. Component tests were written right after the components (no separate RED).
- T5: `EfaGuardPanel.test.tsx` now renders inside a `QueryClientProvider`, so the 11 base "No QueryClient set" failures pass (15/15); correction tests added in `EfaCoordinationPanel.test.tsx`.
- `npx tsc --noEmit`: only the 6 known base errors (SeliarMobileNav lines moved to 307/452 after formatting).
- `npx eslint <touched files>`: 0 errors (fast-refresh warnings only).
- Focused vitest (12 files incl. efa-guard-oversight.server, efa-guards.server/functions, EfaGuardPanel, EfaPanelHome, episodios-efa): 78/78 passed.
- Full `npm test`: not run (memory pressure); pending.

Next: open PRs — T1–T2 and T3–T5 chained (user decision).
