# EFA service workspace on mobile

Make Services in this guard > Open area > Calls, Dispatches, Coordination and Conducts usable on narrow screens, with useful space for data entry and clear save feedback.

## Scope and evidence

The supplied screenshot and current code show repeated episode headings, several nested padded cards and horizontally scrolling section buttons. Long selector content must fit the available width. Preserve existing persistence, offline privacy warnings, permissions, confirmation before changing episode, and mounted visited sections.

## Delivery and constraints

- Route: delegated direct for all four units; mapping and multi-file presentation/behavior changes require bounded workers.
- Continue the user-selected feature-branch-chain. Integration base: `codex/efa-mobile-arrival-integrator`; prior dependency: `codex/efa-mobile-arrival-03-ui`.
- Unit A: `codex/efa-services-04-mobile-workspace`; B: `codex/efa-services-05-mobile-forms`; C: `codex/efa-services-06-dispatch-feedback`; D: `codex/efa-services-07-observation-feedback`. Each child depends on the preceding branch.
- Initial forecast: 500–800 authored changed lines. One coherent slicing pass separates the expanded feedback corrections by panel. Source/test counts before documentation: B 100, C 290, D 354. No PR is requested; committed slice counts are recorded below.
- UI copy follows existing professional Spanish; code identifiers remain English.
- Maintain 44 px touch controls, visible labels, keyboard access and error feedback. Avoid hiding warnings or clipping selected data without access to its full value.
- Existing unrelated staged/unstaged files are outside scope. No remote operations, database changes or publication.
- RDD is off by clone-local preference. Independent verification and a parent spot check apply.
- Engram mirror is pending: the runtime has no registered session identity and disallows agent-attributed memory writes.

## Tasks

- [x] A — Flatten the service/workspace hierarchy and make all four section choices visible on mobile. Preserve episode context, section state and safe navigation. Focused tests: 11 passed; typecheck and diff check passed. Independent verification found fixed-height/anonymous flex label wrapping, corrected with automatic height and a shrinkable span; focused recheck closed the finding. Parent reran the focused suite. Commit boundary contains workspace, episode panel, their tests and this document.
- [x] B — Compact Communications and Coordination panels and forms; retain service context and visible workflow feedback. Included in the five-panel 42-test check and final six-component 47-test parent check; typecheck, build, scoped formatting and diff check passed. Independent verification found no remaining issues.
- [x] C — Compact Dispatch form and route save, lifecycle, contact/support and queue feedback to the originating controls. Focused action-routing tests passed; queue comparison/discard targets corrected after independent review. Final Dispatch/Observation suite: 20 tests; parent six-component suite: 47 tests. Typecheck, build, scoped formatting and diff check passed; independent recheck closed the findings.
- [x] D — Compact Observation within EpisodePanel, preserve standalone behavior and route submit, queue, history and notice feedback to their origins. Compact read-only empty-state and unavailable-target regressions passed. Final Dispatch/Observation suite: 20 tests; parent six-component suite: 47 tests. Typecheck, build, scoped formatting and diff check passed; independent recheck closed the findings. Actual viewport QA remains pending.

## Verification policy

Use RED/GREEN where a meaningful runnable deterministic behavior regression exists. CSS spacing does not warrant a mirrored artificial test. Existing Vitest SSR tests can validate important labels, semantics, state selection and responsive structure. Browser inventory currently exposes no apps or browsers: actual viewport and interaction QA remains pending unless a local browser becomes available. Report that limitation explicitly; static rendering is not visual proof.

## Resulting flow

1. Open a service area. Service identity, event time and status remain in its summary.
2. Choose any of the four visible sections. Visited editors remain mounted when switching sections; changing service retains discard confirmation.
3. Enter the required data. Compact groups and width-constrained selectors retain labels, selected context and touch targets.
4. Save. Feedback appears by the originating action; unavailable targets fall back to the panel alert. Pending local operations and conflicts remain visible.
5. Expand history, technical details or privacy guidance when needed. Unsent fields are not a backup, and offline submissions retain the existing private local queue behavior.

## Progress and next step

All four units are implemented and committed locally. The final branch `codex/efa-services-07-observation-feedback` contains the complete chain; the integration base remains the tracker for later child-PR review.

| Unit | Behavior commit | Authored changed lines in commit | Rollback scope                                                 |
| ---- | --------------- | -------------------------------- | -------------------------------------------------------------- |
| A    | `8186f4f`       | 76                               | Workspace navigation and service-list gutters                  |
| B    | `8bd5649`       | 122                              | Communication and Coordination presentation                    |
| C    | `7144ef6`       | 294                              | Dispatch presentation and action feedback                      |
| D    | `26b80da`       | 358                              | Observation presentation/feedback and EpisodePanel integration |

The behavior commits total 850 authored changed lines; this document's closing commit is additional. Each unit has a coherent dependency boundary and remains below 400 lines before publication. No PRs or remote changes were made.

Final source verification: the parent ran all six affected component test files, with 47 tests passing. The writer's final Dispatch/Observation run passed 20 tests; typecheck, production build, scoped Prettier and diff checks passed. Independent review closed the wrapping, read-only empty-history, action attribution and unavailable-target findings. RED/GREEN was observed for the accessible Dispatch heading; regression coverage also includes compact read-only markup and missing-target feedback. Existing build warnings concern route test files and deprecated `inputValidator` usage.

Assessment was unassessable due unrelated untracked inventory and treated as high; RDD stayed off. No database or submission payload changes were made. Runtime visual/interactive checks, including native select popup behavior, remain unavailable because the browser inventory is empty. The next step is visual QA on a mobile viewport, then separately authorized publication. Engram synchronization remains pending runtime session registration.
