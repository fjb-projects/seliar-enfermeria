# Compact EFA workspace and clear next actions

Implement the approved mobile UX for calls, dispatches, coordination and observations. Keep partial saving and optional timestamps while making navigation, persistence and terminal actions distinct.

## Authorization

The user approved the revised design, explicitly instructed implementation despite pending Engram registration, and authorized gpt-6-luna with high effort for exploration and implementation. The global Codex AGENTS.md assignments were updated and read back; independent verification remains gpt-6.1-sol with medium effort.

No publishing, pull requests, deployment, remote execution or database/migration execution is authorized.

## Accepted design

| Area | Outcome |
| --- | --- |
| Calls | Keep all five numbered steps. Resolved backgrounds/checks and current outline are independent; optional absent times are neutral, and save status is separate. Do not mark review resolved merely by opening it. |
| Actions | Previous/Next share a row below fields. Saving remains available for incomplete drafts. Finalize appears on review with prerequisites; lifecycle extras are secondary. |
| Times | Pair datetime and short Now controls where they fit, with safe narrow fallback and 44px targets. Preserve fill-only Now versus coordination's Now-and-save behavior. |
| Dispatch | Compact step title/progress plus optional step list; preserve free navigation and partial/unknown timestamps. |
| Coordination | Navigation follows fields; explain the required saved parent before dispatch/event association. |
| Observations | Prioritize context, concrete conduct and classification. Collapse the optional group filter; pair classifications; keep optional time/comment secondary. Reuse catalogue data across stable scope renders without caching permissions. |
| Workspace | Neutral content surface, one active-tab signal, fewer nested gutters and short spacing. Long select labels must not widen the viewport. |
| Terminal actions | Compact accessible warning confirmation for finalizing a call/dispatch, closing a service and ending a guard. Identify the actual scope/consequence and recheck current eligibility at confirmation. |

## Constraints

- UI extends the existing neutral Spanish; new technical documentation and identifiers use English.
- Keep queue, idempotency, permission, dirty-state, owner/context and version protections.
- Switching tabs preserves mounted editor state.
- Confirmation does not freeze a target or authorize a future mutation; stale context must not submit.
- Keep existing cancellation/reactivation and queue-conflict confirmations unless a task expressly rearranges their presentation.
- No package/schema/service contracts, authentication or route changes.
- Preserve all unrelated working tree changes and staged deletions; commit exact owned paths only.
- Engram reads are available for project enfermeria-seliar. Agent-attributed writes and the recovery mirror remain pending because no authoritative runtime identity was supplied. Never register or invent an identity.

## Work units

| ID | Deliverable | Route and trigger | Status | Acceptance/checks |
| --- | --- | --- | --- | --- |
| U1 | Shared warning confirmation and four terminal integrations | Delegated; multiple logic files and current-context fences | Implemented; independently verified | Shared accessible warning dialog with explicit cancel/confirm labels; handlers recheck target identity, version, owner/context and current eligibility; interaction checks remain pending in browser QA. Writer checks: 5 Vitest files / 40 tests passed; typecheck and diff check passed. |
| U2 | Calls: five stateful steps, compact navigation/actions/time controls | Delegated; behavior, state helpers and markup | Implemented; independently verified | Five steps retain free navigation and independent current/completed states; optional times stay neutral until present or locally acknowledged; save state is separate; finalization is review-only beside Save in the second action row with visible blockers. Writer and independent checks: 2 Vitest files / 11 tests passed; typecheck, Prettier check, and diff check passed. Browser interaction proof remains scheduled for U6. |
| U3 | Dispatch: compact progress, time controls and actions | Delegated; step navigation and form/action layout | Implemented; independently verified | All 11 steps remain freely accessible from compact current-step navigation; partial drafts and optional timestamps remain; finalization is Review-only with visible blockers. Writer and independent checks: 2 Vitest files / 11 tests passed; typecheck, changed-range normalization, Prettier check, and diff check passed. Browser interaction proof remains scheduled for U6. |
| U4 | Coordination: compact fields and navigation below them | Delegated; multiple form states and save prerequisites | Implemented; independently verified | One compact jump menu and one Previous/Next row appear below active fields; saved-parent requirement is clear; existing Now-and-save mutation remains unchanged. RED: 2 intended SSR assertions failed before implementation. Writer and independent checks: 1 Vitest file / 12 tests passed; typecheck, changed-range Prettier check and diff check passed. Browser interaction proof remains scheduled for U6. |
| U5 | Observations: compact capture and stable catalogue loading | Delegated; loading dependencies and capture states | Implemented; ready for independent verification | Equivalent guard/episode/owner/end-state roots share a stable initial-load identity; linked context and current permission effects remain fresh; compact capture preserves optional controlled fields. RED: 1 intended helper failure. GREEN: 2 Vitest files / 24 tests passed; typecheck, Prettier check and diff check passed. Catalog call-count and viewport interaction remain for U6. |
| U6 | Workspace palette/spacing and final mobile verification | Delegated; shared workspace markup and browser QA | Pending | 320/390px fit, touch targets, four views, warning dialogs and navigation checked; final types/build pass |

## Verification

Vitest uses Node and static React markup, without jsdom/Testing Library. Observe meaningful RED/GREEN for pure helpers and markup regressions; use browser QA for actual dialog/navigation interactions. Do not claim SSR tests prove modal clicks. CSS-only changes need geometry checks, not artificial tests.

Per unit: focused applicable component/helper tests, typecheck, normalization of new/changed ranges, and diff check. Existing GuardPanel/test formatting drift must not trigger unrelated full-file rewriting. Final: one focused combined suite, typecheck, build and synthetic actual-component browser QA. No real PostgreSQL/authentication verification.

RDD is clone-local off; do not enable or start native review. Assess each writer candidate; failed/unavailable assessment remains high and receives independent verification. Parent repeats one reported check before committing.

## Delivery

- Integrator: codex/efa-ui-mobile-integrator, base 7946e7e.
- Cached strategy: feature-branch-chain; local child work-unit branches, no PR or push.
- Forecast: 1,000–1,600 authored lines, a planning estimate rather than a limit. Keep coherent tests and behavior together; do not compress code to meet a line budget.
- Record exact commit IDs, authored counts, verification and rollback scope after each completed unit. Any future PR over 400 lines needs the existing slicing/exception policy.

## Progress and next step

U1 implementation and independent verification passed (5 files, 40 tests; types and diff check clean). Actual modal interaction remains scheduled for U6. RDD assessment unavailable/high; independent verification supplied. Rollback: shared confirmation and four terminal integrations only. U1 commit: 53d04b3 (377 authored lines including new tests and this document).

U2 was independently verified by the user-authorized gpt-6-luna model at high effort and committed as `e68173c` (396 authored lines). The accepted correction keeps finalization requirements in Review and places `Finalizar llamada` beside `Guardar llamada` in the second action row only while Review is active; Previous/Next remain below the fields as the first action row. `rtk proxy npm.cmd exec vitest run src/components/EfaCommunicationStepper.test.tsx src/components/EfaActionConfirmation.test.tsx` passed (2 files, 11 tests); `rtk proxy npm.cmd run typecheck`, `rtk proxy git diff --check`, and Prettier checks for the component and test passed. Browser interaction proof remains scheduled for U6.

U3 was independently verified and committed as `79c9f58` (425 authored lines). Dispatch navigation shows the current title and 11-step progress with the full jump list under `Ver pasos`; time controls pair on wider screens and stack below 360px; Now only updates local form state. Previous/Next remain in the first two-column row, Save and Review-only Finalize share the second row, and Review lists saved-record, base, priority/result, dirty, pending/busy, access and readiness blockers with step links. Lifecycle controls remain under `Más acciones` with existing confirmation behavior, and the finalization callback rechecks Review plus existing target/version/owner/queue fences. The RED test run had 2 intended failures; the final `rtk proxy npm.cmd exec vitest run src/components/EfaDispatchStepper.test.tsx src/components/EfaActionConfirmation.test.tsx` passed (2 files, 11 tests). `rtk proxy npm.cmd run typecheck`, `rtk git diff --check`, and the dispatch component/test Prettier check passed. Browser interaction proof remains scheduled for U6. Rollback: dispatch navigation and form/action layout only.

U4 was independently verified and committed as `f1dcb78` (428 authored lines). Coordination now has one compact three-step jump menu and a single Previous/Next row below the active step fields. The saved-parent prerequisite is shown with a return-to-Datos action; responsive field groups retain narrow-screen fallbacks. The existing `Ahora y guardar` action still records the current time and immediately saves the event, and optional controlled fields remain mounted when collapsed. The RED run of `rtk proxy npm.cmd exec vitest run src/components/EfaPoliceCoordinationPanel.test.tsx` had 2 intended failures among 12 tests (missing compact jump labels and nav-after-fields order); the final run passed (1 file, 12 tests). `rtk proxy npm.cmd run typecheck`, changed-range Prettier check, and `rtk git diff --check` passed. Browser interaction and geometry proof remain scheduled for U6. Rollback: coordination form layout/navigation only.

U5 implementation is ready for independent verification. The observation catalog/history load now depends on stable guard, episode, owner, and normalized guard-end identity, so equivalent inline root objects do not restart initial loading while meaningful scope changes do. The linked-context effect and fresh permission checks remain unchanged. The capture layout prioritizes the concrete conduct selector, keeps group filtering local and collapsed, presents classification choices as two touch-sized columns, and collapses optional time/comment controls without removing their controlled values. The existing `Ahora` action still fills only local state. Initial RED: the root-scope identity test failed because the helper did not exist (1 failed, 13 passed). Final `rtk proxy npm.cmd exec vitest run src/components/EfaObservationPanel.test.tsx src/components/EfaEpisodePanel.test.tsx` passed (2 files, 24 tests); `rtk proxy npm.cmd run typecheck`, `rtk proxy npm.cmd exec -- prettier --check src/components/EfaObservationPanel.tsx src/components/EfaObservationPanel.test.tsx`, and `rtk git diff --check` passed. Node SSR cannot observe effect call counts or form interaction geometry; both remain scheduled for U6 browser QA. Rollback: observation capture presentation and initial-load dependency identity only.

## Recovery mirror

Pending: odd/efa-mobile-workspace-ux/tasks. The local file is the authoritative progress record until the host supplies a registered runtime identity.

## Work-unit Completion Evidence

U2 independently verified with authorized gpt-6-luna/high: 2 files, 11 tests; typecheck, formatting and diff checks passed. Parent diff-check repeat passed. Assessment unavailable/high; RDD remains off. Rollback: call step state and compact action/time markup only. Browser interaction remains scheduled for U6. Commit: `e68173c` (396 authored lines).

U3 independently verified (2 files, 11 tests; types/diff clean); parent diff-check repeat passed. Native assessment unavailable/high; RDD off. Rollback: dispatch compact progress and action/time layout only. Browser checks pending U6. Commit: `79c9f58` (425 authored lines).

U4 independently verified (1 file, 12 tests; types/diff clean); parent diff-check repeat passed. Assessment unavailable/high; RDD off. Rollback: coordination compact navigation/forms, preserving submission contracts. Browser geometry pending U6. Commit: `f1dcb78` (428 authored lines).

U5 writer verification: `rtk proxy npm.cmd exec vitest run src/components/EfaObservationPanel.test.tsx src/components/EfaEpisodePanel.test.tsx` passed (2 files, 24 tests); `rtk proxy npm.cmd run typecheck`, `rtk proxy npm.cmd exec -- prettier --check src/components/EfaObservationPanel.tsx src/components/EfaObservationPanel.test.tsx`, and `rtk git diff --check` passed. Browser geometry and catalog call-count proof remain pending U6; parent independent verification pending. No commit yet.

U4 independently verified (1 file, 12 tests; types/diff clean). Parent diff-check repeat passed. Assessment unavailable/high; RDD off. Rollback: coordination compact navigation/forms, preserving submission contracts. Browser geometry pending U6. U4: 426 authored lines before this evidence addition.

U5 independent verification passed (2 files, 24 tests; types/diff clean). Parent diff-check repeat passed. Assessment unavailable/high; RDD off. Rollback: observation scope identity and capture layout only. Runtime catalog counts and mobile geometry pending U6. U5: 260 authored lines before this evidence addition.
