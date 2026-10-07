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

- [x] Implement server-rechecked own-open-guard summary with aggregate-only data and explicit read-only fallback. `getEfaPanelSummary` rechecks an active session and the service reloads current account roles; queries are scoped to the caller-owned open guard and return counts only.
- [x] Render the three access/guard states, admin navigation, and accessible mobile-first CTAs. CTAs use `min-h-11`; the existing app has no dedicated catalog-management route, so the admin shortcut points to existing guard/base/staffing tools rather than inventing a route.
- [x] Verify behavior and private-payload exclusion with focused tests and required checks. Tests cover no guard, open own guard, an admin with only another user's guard, revoked EFA, inactive account, and omission of private episode fields.

**Observed checks:** focused Vitest command passed (3 files, 10 tests); `npm run typecheck` passed; `npm run build` passed with existing TanStack route-test and deprecated `inputValidator()` warnings; `git diff --check` passed. No live database, commit, or remote action was performed.

### P2 — Guard-to-episode handoff and context
- [ ] Align the guard and episode routes around the state-aware panel flow without weakening route permissions.

### P3 — Concise history cards and detail
- [ ] Improve panel/history presentation without adding sensitive records to the panel summary.

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
Complete P1 only, record observed checks, and leave P2, P3, and V1 open for the parent to route.
