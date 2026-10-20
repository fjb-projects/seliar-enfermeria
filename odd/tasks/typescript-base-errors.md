# Feature: typescript-base-errors

Branch: `fix/typescript-base-errors` (from `origin/main`, independent of the EFA PR, unpushed)

## Objective
Make `npx tsc --noEmit` pass with zero errors, with tests that pin each fix, without changing runtime behavior.

## Problem / Why
`tsc --noEmit` reports 6 errors on `main`, in files unrelated to the recent EFA work. They do not break the running app, but they would block any strict pre-publish check and they hide new errors. Measured on 2026-10-20:
1. `src/components/RouteTransition.tsx(33,9)` and `(46,9)` TS2322: `number` not assignable to `Timeout` (`setTimeout` typed as the DOM variant while the other side expects the Node variant).
2. `src/components/SeliarMobileNav.tsx(312,14)` and `(460,18)` TS2741: `<Link to="/login">` lacks `search`, which `/login`'s `validateSearch` (`returnTo`) makes required.
3. `src/router.tsx(22,5)` TS2322: the dehydrated query client state does not satisfy the router's serializable-return type.
4. `src/routes/__root.tsx(129,3)` TS2322: the `errorComponent` `({ error, reset })` does not match `ErrorRouteComponent`.

## Decisions (user-approved)
- Fix all 6, with tests.
- Separate branch and PR from the EFA work (it branches from `origin/main`).

## Constraints
- No runtime behavior change, except where a missing `search` makes the `/login` link behave differently on purpose (it must keep the current `returnTo` semantics: check what `safePrivateReturnPath(undefined)` returns and what the app does today).
- No `as any`, no `@ts-ignore`, no `@ts-expect-error`, no loosening of tsconfig. Prefer typing the code correctly; if a dependency typing is truly wrong, isolate a narrow, documented cast at the boundary.
- Never push. No DB commands. UI copy unchanged.

## Tasks
- [x] T1: `RouteTransition.tsx` timer types (2 errors). Route: delegated (writer, same run).
- [x] T2: `SeliarMobileNav.tsx` `/login` links (2 errors). Route: delegated (writer, same run).
- [x] T3: `router.tsx` dehydration serializable type (1 error). Route: delegated (writer, same run).
- [x] T4: `routes/__root.tsx` error component type (1 error). Route: delegated (writer, same run).

## Checks
`rtk proxy npx tsc --noEmit` shows 0 errors; focused vitest on touched files and their neighbors; eslint and prettier on touched files. Browser check pending (route transition overlay, login links in the nav, error boundary rendering, SSR hydration).

## Progress
- Errors measured (see Problem / Why).
- T1: the ref was typed `ReturnType<typeof setTimeout>` (`NodeJS.Timeout` with `@types/node` loaded) while `window.setTimeout` returns `number`; now `useRef<number | null>`, with the phase/timer decisions in the pure `planOverlayStep` (`src/lib/route-transition.ts`, 7 tests).
- T2: both `/login` links pass `search={LOGIN_SEARCH}` = `{ returnTo: safePrivateReturnPath(undefined) }` = `/panel`; URL before `/login`, after `/login?returnTo=%2Fpanel` (the login page already fell back to `/panel`). RED: the new nav test failed on the old href.
- T3: `dehydrateQueryClient` extracted from `router.tsx` with identical options and one narrow, documented cast `as DehydratedState & Serializable` (the router's `dehydrate` option validates against `Serializable`, which `DehydratedState` cannot satisfy because of `unknown` fields). Tests: no mutations in the payload, JSON round trip, `getRouter` dehydrate/hydrate round trip.
- T4: `ErrorComponentProps.error` is `unknown` in this router version; the root error component takes `ErrorComponentProps` and is exported; two render tests (an `Error` and a non-`Error`).
- Also fixed two pre-existing failing tests in `src/router.test.tsx`: the pending-view test now pins the current decision from `6da5ffa` (`defaultPendingMs: Infinity`, feedback left to `RouteTransition`); the async-loader test failed because vitest has no `document`, so the router treated itself as a server and `navigate()` did nothing; it now passes `isServer: false` and an explicit `origin`, and also asserts `resolvedLocation` stays on the old path while loading.
- Verification (re-run by the parent): `tsc --noEmit` 0 errors; vitest 30/30 on 7 files (route-transition, nav, router, root, PrivateAccountShell, WorkflowShell, private-ui); eslint and prettier clean. Review: RDD off.
- Browser check pending: overlay timing (120 ms delay, 180 ms exit, reduced motion), anonymous Login click in both navs landing on `/panel`, error boundary (Recargar, Home), SSR hydration of query state.
- Engram mirror pending (session registration has been failing).
