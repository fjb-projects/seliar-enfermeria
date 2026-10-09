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
| U1 | Shared warning confirmation and four terminal integrations | Delegated; multiple logic files and current-context fences | Implemented; independent verification pending | Shared accessible warning dialog with explicit cancel/confirm labels; handlers recheck target identity, version, owner/context and current eligibility; interaction checks remain pending in browser QA. Writer checks: 5 Vitest files / 40 tests passed; typecheck and diff check passed. |
| U2 | Calls: five stateful steps, compact navigation/actions/time controls | Delegated; behavior, state helpers and markup | Implemented; independent verification pending | Five steps retain free navigation and independent current/completed states; optional times stay neutral until present or locally acknowledged; save state is separate; finalization is review-only beside Save in the second action row with visible blockers. Writer checks: 2 Vitest files / 11 tests passed; typecheck, Prettier check, and diff check passed. Browser interaction proof remains scheduled for U6. |
| U3 | Dispatch: compact progress, time controls and actions | Delegated; step navigation and form/action layout | Pending | Free step access, partial drafts, safe datetime width, clear review/finalize path |
| U4 | Coordination: compact fields and navigation below them | Delegated; multiple form states and save prerequisites | Pending | Saved-parent requirement visible; Now-and-save unchanged; form errors near action |
| U5 | Observations: compact capture and stable catalogue loading | Delegated; loading dependencies and capture states | Pending | No unnecessary catalogue reload on equivalent scope; references/permissions remain fresh; optional fields preserved |
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

U2 implementation is ready for independent verification by the user-authorized gpt-6-luna model at high effort. A review correction keeps finalization requirements in Review and places `Finalizar llamada` beside `Guardar llamada` in the second action row only while Review is active; Previous/Next remain below the fields as the first action row. `rtk proxy npm.cmd exec vitest run src/components/EfaCommunicationStepper.test.tsx src/components/EfaActionConfirmation.test.tsx` passed (2 files, 11 tests); `rtk proxy npm.cmd run typecheck`, `rtk proxy git diff --check`, and Prettier checks for the component and test passed. Browser interaction proof remains scheduled for U6. Next: independently verify U2, then continue with U3–U6.

## Recovery mirror

Pending: odd/efa-mobile-workspace-ux/tasks. The local file is the authoritative progress record until the host supplies a registered runtime identity.

## Verification interruption

U2 writer checks passed (2 files, 11 tests; typecheck, formatting and diff check). Independent verifier failed before inspection because the service returned a usage limit. U2 is uncommitted and not independently verified. Remaining UI units and browser QA are pending. Parent identified a review layout improvement: keep terminal action in the save row after navigation rather than above it. Preserve this candidate; continue after verifier availability or an authorized worker assignment change.

U2 independently verified with authorized gpt-6-luna/high: 2 files, 11 tests; types/diff clean. Parent diff-check repeat passed. Assessment unavailable/high; RDD remains off. Rollback: call step state and compact action/time markup only. Browser interaction still scheduled U6. U2 authored count: 394 lines before this evidence addition. Next: U3.
