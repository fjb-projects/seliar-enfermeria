# Guided EFA Panel Flow

## Objective
Replace the private panel's generic links with a state-aware EFA start/continue path and clear read-only navigation for accounts without current EFA write access.

## Problem
The current `/panel` presents the same episode link to every account and hides the intended EFA flow behind a generic guard link. A user cannot tell whether to start a guard or continue recording attention, while read-only users may infer write access from navigation.

## Scope and constraints
- Keep the implementation in the existing TanStack Start route, server-function, and service boundaries.
- Determine current access on the server; recheck active account and roles for the panel summary.
- Return only the authenticated user's open-guard status and aggregate counts. Never return episode addresses, motives, records, or another user's guard data.
- No schema change, public Forms/Drive change, new forms, or deep-link contract.
- Preserve existing route-level read/write checks. Use the project's Spanish UI convention and mobile-first accessible controls.
- Preserve pre-existing unrelated changes and do not access a live database, commit, or perform remote work.

## States
| State | Primary action | Supporting content |
|---|---|---|
| EFA/admin, no own open guard | Iniciar guardia EFA | Three steps: open guard, optionally select bases, record attention. |
| EFA/admin, own open guard | Registrar o continuar atenciones | Own guard status, base count and active own-episode count when efficiently available; secondary Bases y dotación action. |
| Active account without current EFA/admin | Read-only consultation | Explain no current write access; retain routes to own guard and available episode history. Admin-only account/catalog links remain visible only to admins. |

## Tasks and evidence

### P1 — State-aware mobile-first panel
**Route:** delegated direct; multi-file UI, server summary, and focused security tests require one bounded writer.
**Allowed surfaces:** `odd/tasks/efa-panel-guided-flow.md`, `src/routes/panel.tsx`, `src/components/EfaPanelHome.tsx`, `src/components/EfaPanelHome.test.tsx`, `src/lib/efa-panel.server.ts`, `src/lib/efa-panel.server.test.ts`, `src/lib/efa-panel.functions.ts`, `src/lib/efa-panel.functions.test.ts`.
**Forecast:** P1 approximately 250–400 authored lines; full feature approximately 700–1,000 lines across P1–P3 and V1. `ask-on-risk` delivery strategy; `feature-branch-chain` retained from the prior EFA access-foundation plan, which records the user's acceptance. Do not open a PR or publish.

**Work-unit commit:** `d626228` (`P1` delivered; no P2 commit was created by this worker).

- [x] Implement server-rechecked own-open-guard summary with aggregate-only data and explicit read-only fallback. `getEfaPanelSummary` rechecks an active session and the service reloads current account roles; queries are scoped to the caller-owned open guard and return counts only.
- [x] Render the three access/guard states, admin navigation, and accessible mobile-first CTAs. CTAs use `min-h-11`; the existing app has no dedicated catalog-management route, so the admin shortcut points to existing guard/base/staffing tools rather than inventing a route.
- [x] Verify behavior and private-payload exclusion with focused tests and required checks. Tests cover no guard, open own guard, an admin with only another user's guard, revoked EFA, inactive account, and omission of private episode fields.

**Observed checks:** focused Vitest command passed (3 files, 10 tests); `npm run typecheck` passed; `npm run build` passed with existing TanStack route-test and deprecated `inputValidator()` warnings; `git diff --check` passed. No live database, commit, or remote action was performed.

### P2 — Guard-to-episode handoff and context
**Work-unit commit:** `1246a3d`.

- [x] Align the guard and episode panels around the guided flow without changing route permissions. The guard panel explains that episodes are the next step after starting a guard, makes base selection explicitly optional, and links to episode recording only when a guard is already open. The episode panel identifies the caller's open guard, clearly returns to the guard panel, and states once that its list is not the complete cross-guard history.
- [x] Add focused rendering assertions for both handoffs, the no-open-guard state without a premature episode CTA, and the single read-only scope notice. Tests observed RED before the UI update and GREEN afterward.

**Observed P2 checks:** `npm run test -- src/components/EfaGuardPanel.test.tsx src/components/EfaEpisodePanel.test.tsx` passed (2 files, 14 tests); `npm run typecheck` passed; `npm run build` passed with existing TanStack route-test and deprecated `inputValidator()` warnings; `git diff --check -- odd/tasks/efa-panel-guided-flow.md src/components/EfaGuardPanel.tsx src/components/EfaGuardPanel.test.tsx src/components/EfaEpisodePanel.tsx src/components/EfaEpisodePanel.test.tsx` passed. No route permission, server, schema, or deep-link behavior changed.

### P3 — Concise history cards and detail
#### P3a — Compact guard history
**Route:** delegated direct; one bounded UI/test/doc work unit.

- [x] Collapse historical and other-owner guard details by default; expand the current user's open guard so staffing remains immediately accessible. The native `details` disclosure shows “Ver detalles” or “Ocultar detalles” based on its state. The compact summary shows status/date, and the episode-recording action remains outside the disclosure.
- [x] Preserve base/declaration/version history, observation access, base-change history, staffing, coverage planning, and admin correction inside the details area without changing permissions or server/data behavior.
- [x] Add rendering assertions for collapsed historical/other-owner guards, expanded own-active details, state-aware disclosure labels, and the visible episode action. Test-first RED was observed before the active-guard expansion; GREEN followed the refinement.

**Observed P3a checks:** `npm run test -- src/components/EfaGuardPanel.test.tsx` passed (1 file, 9 tests); `npm run typecheck` passed; `npm run build` passed with existing TanStack route-test and deprecated `inputValidator()` warnings; `git diff --check -- odd/tasks/efa-panel-guided-flow.md src/components/EfaGuardPanel.tsx src/components/EfaGuardPanel.test.tsx` passed. No live database, commit, staging, or remote action was performed.

#### P3b — Episode history
- [ ] Improve episode history presentation, keeping existing history access and permission behavior intact.

### V1 — Integration and mobile validation
- [ ] Validate end-to-end navigation, state transitions, and narrow-screen layout with available local checks.

## Checks
- `npm run test -- src/lib/efa-panel.server.test.ts src/lib/efa-panel.functions.test.ts src/components/EfaPanelHome.test.tsx`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

## Persistence
Engram mirror is pending because this delegated worker has no authoritative registered session identity. The parent session should mirror the full current document after completing the feature.

## Next step
P1, P2, and P3a are complete. Route P3b episode history and V1 integration/mobile validation separately; do not broaden P3a into those follow-up tasks.
