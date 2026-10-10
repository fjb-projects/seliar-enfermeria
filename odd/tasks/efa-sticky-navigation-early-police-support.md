# Sticky service navigation and early police support

## Objective and authorized scope

Keep Calls, Dispatches, Police support and Conducts accessible while scrolling a service. Make police support usable before any call or dispatch, with later dispatch association, including dispatches still in draft.

## Problem and evidence

The service tabs scroll away after the five-step call form. The mobile workflow header is already sticky and its height varies. Police coordination already accepts no initiating dispatch and no linked dispatches; its dispatch choices can become stale because visited sections remain mounted when hidden.

## Constraints

- Preserve existing episode/owner validation, saved records, drafts and offline queue behavior.
- Extend existing Spanish UI using neutral professional copy; technical artifacts use English.
- Local implementation only; no push, publication, remote sessions or database migration.
- Existing feature branch: `codex/efa-ui-mobile-integrator`; initial boundary: `a7703f551b3e4917e2afdd5e363be2c11f8339c0`.
- Receipt-driven development is disabled by clone preference. Assess the final diff and use proportional independent verification.

## Tasks

- [x] T1: Keep service tabs sticky below the responsive workflow header without obscuring content or tab interactions.
  - Route: delegated direct; preparation and changes span workspace and header components.
  - Acceptance: sticky tab bar at mobile/desktop sizes; variable header height respected; keyboard access and collapsed state preserved.
  - Checks: existing workspace tests; focused typecheck; inspect sticky layout when a local viewport harness is available.
  - Rollback: workspace sticky treatment and header offset measurement only.
  - Commit: `42ab958` (`feat(efa): keep service sections visible while scrolling`), 100 authored lines including tests and tracking.
- [x] T2: Refresh dispatch choices when Police support becomes active, retain unsaved support edits, and explain early activation and later association.
  - Route: delegated direct; episode integration and police panel require coordinated logic.
  - Acceptance: save without call/dispatch; saved draft dispatch becomes selectable on return; associate later; earlier police timestamps accepted; ownership guards unchanged.
  - Checks: deterministic RED/GREEN for stale-list regression if runnable; focused episode/police/server tests; typecheck and production build.
  - Rollback: police activation refresh, its episode integration and related guidance/tests only.
  - Commit: T2_COMMIT_ID (`fix(efa): refresh dispatch choices when revisiting police support`).

## Delivery and verification

- Strategy: `ask-on-risk`; forecast approximately 300 authored changed lines, generated files excluded. If accumulated changes exceed approximately 400 lines, resolve delivery slicing before the next commit.
- Work-unit commits will include their checks and this document; no remote delivery is authorized.
- Tests for sticky CSS are not added merely to mirror class names; existing structural checks and viewport evidence are preferred.
- Normalize changed source before final verification. Report failed, unavailable or skipped checks explicitly.
- Writer checks: the four focused workspace, episode, police panel and police service suites passed (36 tests). Outdated test expectations for the existing police-support label were aligned with the current UI. The new guidance expectation was observed RED before implementation and GREEN afterward; the SSR-only harness cannot exercise activation effects or response races. The domain scenario proves support creation with no dispatch, a request timestamp before the call, and later draft-dispatch association.
- Final corrected source: five focused suites passed (37 tests), including WorkflowHeader; check-only Prettier on all seven changed source/test files and `git diff --check` passed. The parent separately reran workspace/header tests (six passing tests).
- Final `rtk npm run build` passed with exit 0 outside the sandbox after restricted execution failed reading tslib. No publication was performed. Existing route-test, deprecation and bundle-size warnings remain.
- Typecheck still fails with six diagnostics in RouteTransition.tsx, SeliarMobileNav.tsx, router.tsx and __root.tsx. Independent compilation of initial HEAD with the installed dependencies reproduced the same six diagnostics at the same locations; affected files, configuration and dependencies have no diff.
- Independent inspection closed a stale-adoption concern by repeating mounted/user/episode guards after the new asynchronous dispatch refresh; selection and dirty-state checks remain intact.
- Viewport QA is unavailable: a disposable fixture using the real components/CSS started locally, but both IAB and Chrome browser automation were unavailable. Responsive scroll, resize, keyboard and collapse behavior require manual viewport confirmation. Fixture/baseline evidence remains in `.tmp/efa-service-flow-qa/` and is excluded from commits.
- Final native assessment: medium, executable change, under budget (282 authored changed lines at assessment). RDD remains disabled/unmanaged; no review lifecycle was started. Independent verification was completed because the initial assessment was unassessable and the writer used a small-model profile.
- Running committed authored-line count: 100 after T1; final count pending closing readback. The feature stays below the 400-line delivery heuristic.

## Progress and next step

Both tasks are implemented and verified with their recorded checks. The final source/test diff is 238 authored lines. Manual viewport QA and pre-existing typecheck failures remain as follow-ups. This document is mirrored in Engram under `odd/efa-sticky-navigation-early-police-support/tasks`. No remote delivery is authorized.
