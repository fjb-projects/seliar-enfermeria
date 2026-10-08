# EFA service workspace on mobile

Make Services in this guard > Open area > Calls, Dispatches, Coordination and Conducts usable on narrow screens, with useful space for data entry and clear save feedback.

## Scope and evidence

The supplied screenshot and current code show repeated episode headings, several nested padded cards and horizontally scrolling section buttons. Long selector content must fit the available width. Preserve existing persistence, offline privacy warnings, permissions, confirmation before changing episode, and mounted visited sections.

## Delivery and constraints

- Route: delegated direct for both tasks; mapping and multi-file presentation/behavior changes require bounded workers.
- Continue the user-selected feature-branch-chain. Integration base: `codex/efa-mobile-arrival-integrator`; prior dependency: `codex/efa-mobile-arrival-03-ui`.
- Unit A: `codex/efa-services-04-mobile-workspace`. Unit B follows A on `codex/efa-services-05-mobile-forms`.
- Forecast: 500–800 authored changed lines across two coherent units; this is a planning estimate. No PR is requested. Review slice counts and any size exception will be recorded before PR delivery.
- UI copy follows existing professional Spanish; code identifiers remain English.
- Maintain 44 px touch controls, visible labels, keyboard access and error feedback. Avoid hiding warnings or clipping selected data without access to its full value.
- Existing unrelated staged/unstaged files are outside scope. No remote operations, database changes or publication.
- RDD is off by clone-local preference. Independent verification and a parent spot check apply.
- Engram mirror is pending: the runtime has no registered session identity and disallows agent-attributed memory writes.

## Tasks

- [x] A — Flatten the service/workspace hierarchy and make all four section choices visible on mobile. Preserve episode context, section state and safe navigation. Focused tests: 11 passed; typecheck and diff check passed. Independent verification found fixed-height/anonymous flex label wrapping, corrected with automatic height and a shrinkable span; focused recheck closed the finding. Parent reran the focused suite. Commit boundary contains workspace, episode panel, their tests and this document.
- [ ] B — Compact the four tab panels and their forms, prevent selector width overflow, reduce repeated copy and bring submission errors near the corresponding action. Check the four panel test files, focused layout/state regressions, typecheck and production build. Commit boundary contains the four panels, their tests and this document.

## Verification policy

Use RED/GREEN where a meaningful runnable deterministic behavior regression exists. CSS spacing does not warrant a mirrored artificial test. Existing Vitest SSR tests can validate important labels, semantics, state selection and responsive structure. Browser inventory currently exposes no apps or browsers: actual viewport and interaction QA remains pending unless a local browser becomes available. Report that limitation explicitly; static rendering is not visual proof.

## Progress and next step

Task A implementation is complete in the workspace and service summary presentation. The workspace wrapper and active-section panel no longer create nested padded cards; the section keeps only a subtle left accent. The services card and articles use smaller mobile gutters, while desktop spacing stays intact. All four sections use a two-column mobile grid whose labels can wrap at narrow widths, and episode context remains in the accessible heading name. Buttons use automatic height with a 44 px minimum so wrapped labels do not clip. RED was observed when the new accessible context assertion failed; the focused workspace/panel suite passed (11 tests), `npm.cmd run typecheck` passed, and `git diff --check` passed. After the independent wrap finding was corrected, the focused suite passed again (11 tests) and `git diff --check` passed. Parent verification and commit remain pending; browser inventory is empty, so viewport QA is also pending. Next: parent spot check and commit before task B.
