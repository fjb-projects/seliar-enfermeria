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
- [ ] D — Compact Observation within EpisodePanel, preserve standalone behavior and route submit, queue, history and notice feedback to their origins. Verify read-only compact SSR behavior and typecheck.

## Verification policy

Use RED/GREEN where a meaningful runnable deterministic behavior regression exists. CSS spacing does not warrant a mirrored artificial test. Existing Vitest SSR tests can validate important labels, semantics, state selection and responsive structure. Browser inventory currently exposes no apps or browsers: actual viewport and interaction QA remains pending unless a local browser becomes available. Report that limitation explicitly; static rendering is not visual proof.

## Resulting flow

1. Open a service area. Service identity, event time and status remain in its summary.
2. Choose any of the four visible sections. Visited editors remain mounted when switching sections; changing service retains discard confirmation.
3. Enter the required data. Compact groups and width-constrained selectors retain labels, selected context and touch targets.
4. Save. Feedback appears by the originating action; unavailable targets fall back to the panel alert. Pending local operations and conflicts remain visible.
5. Expand history, technical details or privacy guidance when needed. Unsent fields are not a backup, and offline submissions retain the existing private local queue behavior.

## Progress and next step

Task B committed as `8bd5649` on `codex/efa-services-05-mobile-forms` (122 authored changed lines, including flow documentation). Task C now closes on `codex/efa-services-06-dispatch-feedback`; Observation integration remains for D. All final source bytes passed independent verification and the parent's 47-test check. Actual browser QA remains pending.

Task A committed as `8186f4f` on `codex/efa-services-04-mobile-workspace` (76 authored changed lines, including this document). Assessment was unassessable due unrelated untracked inventory, treated as high; RDD remains off. Independent review and parent focused test rerun passed. Initial forms presentation is on `codex/efa-services-05-mobile-forms`, based on A. Independent verification kept B/C/D pending after finding compact read-only history and action-feedback routing gaps. The writer restored the compact empty-history caveat, routed Observation and Dispatch feedback by source, added unavailable-target regression coverage, and collapsed Dispatch history to keep the save workflow easy to reach. After the final corrections, Dispatch and Observation tests passed (2 files, 20 tests); typecheck, production build, scoped Prettier and `git diff --check` passed. The earlier all-five panel suite passed (42 tests) before the last targeted regressions. Build emitted existing route-test-file and deprecated `inputValidator` warnings. Independent verification and parent-owned slicing/commits remain pending.

The forms work flattens embedded tab panels, compacts entry groups, keeps selectors shrinkable, and preserves full selected call/episode context beside concise option labels. Observation compaction remains opt-in so standalone GuardPanel keeps its existing layout and privacy copy. The service summary omits a repeated timestamp only when its generated title already includes it; custom names keep the event date and long titles remain visible. RED was observed for the short accessible Dispatch heading contract; regressions cover compact read-only Observation SSR and Dispatch action-surface mapping. Browser inventory is empty, so viewport QA remains pending. No persistence, backend, or submission behavior changed.
