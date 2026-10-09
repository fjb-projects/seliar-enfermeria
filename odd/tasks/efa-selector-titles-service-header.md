# Recognize linked records and compact service summaries

Make EFA workspace choices recognizable through existing record data and reduce the space used by each service header. The user will check the UI manually.

## Authorized scope

- Improve linked record option labels, especially the dispatch linked-call selector; keep priority and state, internal option values, filters and submission behavior.
- Compact the service title, status and event time; align Close service at the opposite edge with safe narrow-screen wrapping.
- Afterwards recommend where and how to capture evaluator involvement versus actor autonomy. Analysis only; do not add this field or change persistence yet.
- No tests, test additions, build, typecheck or browser QA. This explicit user preference overrides the normal test-first/check workflow for this task. Static source readback is allowed; manual runtime verification remains pending.
- Preserve unrelated changes. No push, PR, remote, authentication, database or schema work.

## Work unit

| ID | Outcome | Route | Status |
| --- | --- | --- | --- |
| U1 | Human-readable linked options and compact service header | Delegated: multiple presentation files and preparation for writing | Implemented; static readback complete; user manual check pending |

### Acceptance

- Calls use available direction and real-start/creation time with priority and state; no internal identifier appears as the visible title.
- Related selectors use recognizable context and time where needed; option values remain exact IDs.
- Close service remains accessible, with the same confirmation and eligibility protections, beside the summary when space permits.
- Long content does not force horizontal expansion; narrow screens may wrap instead of clipping controls.
- Provide manual routes, sections and expected results to the user.

## Evidence and delivery

Explorer confirmed complete call DTOs include direction, startedAt and createdAt; the dispatch currently discards those fields before displaying ID fragments. Coordination and observation options already expose partial human context and can improve disambiguation using existing data.

Current integrator: codex/efa-ui-mobile-integrator, starting boundary 068ea50. Cached delivery strategy: feature-branch-chain; forecast 100–250 authored lines. One local conventional work-unit commit; no publishing. RDD clone-local off. Tests and runtime checks explicitly skipped at the user's request. Rollback is limited to linked-option presentation and service summary/action layout.

## Progress and next step

U1 implemented in the four authorized components. Dispatch linked calls now show direction, real start (creation fallback), state and priority, retaining full IDs as values, available-origin filtering and create-time priority copy. Coordination dispatch and Conduct linked options use available human context/date/state/priority. Empty base names fall back to Base institucional rather than internal IDs. Service summary uses a compact wrapping justify-between header with Close at the opposite edge; Open area remains secondary when needed. Existing handlers, eligibility and confirmations were preserved.

Writer and independent static source readback completed. The initial readback found baseId fallback labels; a bounded correction removed all three mapped occurrences, followed by parent source readback. Call DTO fields are retained on the only update path. No tests, test changes, build, typecheck, formatter, diff-check or browser QA were run. Native risk assessment could not classify the candidate because of unrelated untracked inventory; RDD remains off. This is source inspection evidence, not a runtime pass.

U1 local work-unit commit: 22ba412, 333 authored lines across four presentation components and this feature document. Parent normalized one indentation line mechanically before the commit. All unrelated changes, including externally modified button/badge primitives that appeared during this task, were preserved. No push or PR. Rollback: option-title functions/mapping and service header layout only.

Manual path: /episodios-efa -> open service -> Despachos, step 1, Llamada vinculada; Coordinación linked dispatch choices; Conductas context selectors. Review the service summary with a long title on mobile and the Close service confirmation. User manual verification remains pending.

Evaluator involvement remains a subsequent product discussion; no field, persistence or person identifier was added. Existing observations are anonymous and non-evaluative. Recommend recording the evaluator's concrete intervention as optional event context; actor autonomy requires its own definition rather than being inferred automatically from intervention.

## Recovery mirror

Repository-relative locator: odd/tasks/efa-selector-titles-service-header.md.
Engram topic: odd/efa-selector-titles-service-header/tasks.
