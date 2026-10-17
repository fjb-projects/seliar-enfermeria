# Feature: efa-quick-guard-end

Branch: `feat/efa-quick-guard-end` (chained on `feat/efa-coordination` bdc33ed, unpushed)

## Objective
Let an EFA user end their open guard quickly from any private screen, and warn them when they log out with a guard still open.

## Problem / Why
Ending a guard today takes 4 steps: /panel → "Bases y dotación" → "Terminar guardia" → confirm (`EfaGuardPanel.tsx:990-1009`). Logout never checks for an open guard (`SeliarNavigationProvider.tsx:143-158`), so guards are left open on the server.

## Facts (verified by explorer, path:line may shift)
- `endEfaGuard({guardId, expectedVersion})` (`src/lib/efa-guards.functions.ts:14,66-71`, EFA role) → `service.end` (`efa-guards.server.ts:253-281`). It uses DB `now()` and never blocks on drafts or open hygiene (it marks hygiene "not informed").
- Page button gating: `activeWorkspaceState.canClose` = no pending arrivals and no membership sync (`src/lib/efa-guard-mobile-workspace.ts:111-119`). Confirmation uses `EfaActionConfirmation.tsx`, keyed by `userId:guardId:version` (`EfaGuardPanel.tsx:755-792`). After success: invalidate `["efa-panel-summary"]` and show "La guardia terminó manualmente." (`:670-687`).
- The shell gets `summary.openGuard` from `SeliarNavigationProvider` (`navigation-query-options.ts:32-38`, key `["efa-panel-summary", userId]`, staleTime 30s). It is only `{startedAt, baseCount, activeEpisodeCount}`, with no id or version (`efa-panel.server.ts:21-29`), and is non-null only for EFA writers. The summary is treated as undefined when stale or errored (`SeliarNavigationProvider.tsx:164`).
- Logout is rendered in 3 places, all calling `navigation.logout()`:
  - the desktop dropdown (`SeliarMobileNav.tsx:316-356`);
  - the mobile bottom nav, a 3-column grid that hides on scroll (`:461-471`, `:146-183`);
  - the `PrivateAccountShell` header (`:164-171`).
- `SeliarMobileNav` and `SeliarNavigationProvider` have no tests.

## Decisions (user-approved)
- An "active guard" strip with a "Terminar" button inside the same mobile bottom-nav container, above the 3 buttons, so it hides with the nav. It is visible only when the user has an open guard. On desktop it is a compact element in the top nav.
- Always confirm with a modal that shows the start time, so a mis-tap never ends the guard.
- Fetch the fresh guard (id and version) at confirm time; do not widen the panel summary.
- On `/guardia-efa`, respect the page's `canClose` (pending arrivals), so the shell control does not bypass it.
- Logout with an open guard shows a dialog: "Terminar guardia y salir" / "Salir sin terminar" / "Cancelar".

## Constraints
- UI copy in neutral Spanish; code in English. Never push. No DB commands. About 400 lines per task is a heuristic only.

## Tasks
- [x] T1 — Shared quick-end hook/controller plus confirmation modal; active-guard strip in the mobile bottom nav and the desktop top nav. Route: delegated (writer trigger: 2+ non-trivial files). Commit `3864064` `feat(efa): end the open guard from the navigation`.
  - Pure helpers in `src/lib/efa-quick-guard-end.ts`: visibility, copy, target key, `findOwnOpenGuard`, error mapping, `runQuickGuardEnd` (fresh `listEfaGuards()` id/version, then `endEfaGuard`).
  - `useQuickGuardEnd` lives in `SeliarNavigationProvider` (exposed as `quickGuardEnd` plus a stale-tolerant `openGuard`), so the strip does not vanish when the 30s summary goes stale. The UI is in `src/components/EfaQuickGuardEnd.tsx`: mobile strip, desktop element, confirmation (reuses `EfaActionConfirmation`), and a page-end spacer.
  - `/guardia-efa` canClose choice: the strip is hidden on `/guardia-efa` (`QUICK_GUARD_END_HIDDEN_PATHS`), because the page already has a gated "Terminar guardia" button.
  - Feedback: a shell `Toaster id="seliar-shell"` in `__root.tsx` and `toast(..., { toasterId })`, so the `/control-guardia` Toaster does not duplicate them. After ending, it invalidates `["efa-panel-summary"]` and `router.invalidate()`.
  - Bottom space: `WorkflowShell` reserves `pb-24` for the nav. A `h-12 md:hidden` spacer after `<Outlet/>` covers the extra strip height.
  - RED: the helper test failed with "Cannot find module './efa-quick-guard-end'". GREEN: 13/13 passed. Render tests: `EfaQuickGuardEnd.test.tsx` and `SeliarMobileNav.test.tsx` check the strip is shown with an open guard and absent without one.
- [x] T2 — Logout guard: a dialog when the user has an open guard, used by all 3 logout entry points. Route: delegated. Commit `8ac78bd` `feat(efa): warn before logging out with an open guard`.
  - `requestLogout()` in the provider re-reads the summary with `fetchQuery` (it falls back to the last known data), then either logs out or opens `EfaLogoutGuardDialog`, which the provider renders. The desktop dropdown, mobile Logout, and `PrivateAccountShell` all use it. `logout()` is unchanged.
  - "Terminar guardia y salir" logs out only for `ended`, `no-open-guard`, or `already-ended`. Any other error stays in the dialog and the session is kept. On `/guardia-efa` the end action is hidden and the text points to the page button.
  - RED: 4 new helper tests failed (functions missing). GREEN: 17/17 passed. The dialog render test (`EfaLogoutGuardDialog.test.tsx`) uses pass-through AlertDialog mocks.

## Checks
`rtk npx tsc --noEmit` (only the 6 known base errors), `rtk npx eslint <touched files>`, `rtk npx vitest run <touched tests>`. Full suite pending (memory).

## Verification evidence (after T2)
- `rtk npx vitest run` on efa-quick-guard-end, EfaQuickGuardEnd, EfaLogoutGuardDialog, SeliarMobileNav, EfaGuardPanel, PrivateAccountShell, and EfaActionConfirmation tests: 7 files, 49 tests passed.
- `rtk npx tsc --noEmit`: only the 6 known base errors (RouteTransition x2, SeliarMobileNav 312/460, router.tsx, __root.tsx).
- `rtk npx eslint <touched files>`: 0 errors. The warnings follow existing patterns: hook exports (`react-refresh/only-export-components`) and the provider's `exhaustive-deps`, which was already in the baseline.
- Runtime/browser check: pending. Nothing was checked in a browser (dialog focus, the dropdown-to-dialog handoff, toast placement).
- Full suite: pending (memory).

## Progress
T1 and T2 are done. Next: manual browser check on mobile and desktop, then review/PR under repo policy.
