# Clarify police support and the conduct capture path

Rename the workspace's police tab to Apoyo policial and organize Conductas around one clear capture action, compact context and secondary optional information.

## Authorized scope

- Rename the visible police tab, matching panel heading and accessible region; preserve logical keys.
- Bring Tipo de contexto and Agregar una observación into one compact header row when space permits, with a narrow-screen wrapping fallback.
- Clarify hierarchy across the whole Conductas view: capture first, dependent context fields compact, conduct/classification primary, optional fields secondary, history separate, feedback beside Save.
- Discuss a later separate evaluator participation wrapper inside Conductas. Do not add the field, storage, schema or new save action now.
- The user's no-tests request persists: no tests or test changes, build, typecheck, formatter, diff check or browser QA. Static source reading only; user manual checking remains pending.
- Preserve prior UI changes, all unrelated modified/staged files and current interaction protections. No remote, publishing, authentication or database work.

## Work unit

| ID | Outcome | Route | Status |
| --- | --- | --- | --- |
| U1 | Recognizable police support tab and structured conduct capture | Delegated: three presentation files and preparation for writing | Implemented; static source readback complete; manual check pending |

## Acceptance

- The tab and current panel read Apoyo policial, retaining the police section key and accessible tab-panel associations.
- Capture has one primary heading and one nearby compact context selector; remove redundant equal-weight section headings without removing context controls.
- Show the fields needed for the chosen context next, then concrete conduct and classification; keep optional controls visibly secondary.
- History and operational queue notices remain distinguishable from the capture action; keep active blockers and save errors visible near their actions.
- Preserve controlled values, selection/reset/edit rules, permissions, queue state, confirmations, anonymous/non-evaluative copy, conditional linked selectors and IDs.
- No clipping or forced single-row constraint on narrow screens. Maintain touch targets.
- Provide the exact manual navigation path and expected UI to the user.

## Evidence and delivery

Explorer found the context section and capture section have separate similar-weight headings. The visible police label is owned by EfaEpisodeWorkspace, with matching heading/region in EfaPoliceCoordinationPanel. Allowed source paths: those two components and EfaObservationPanel.

Integrator: codex/efa-ui-mobile-integrator, starting boundary 042e592. Cached delivery strategy: feature-branch-chain. Forecast 200–400 authored lines; advisory estimate only. One coherent local conventional work-unit commit with this record; no push or PR. RDD clone-local off. Tests and runtime proof skipped by user request; static readback only. Rollback is limited to label changes and Conductas presentation.

## Progress and next step

U1 implemented in the three authorized components. Apoyo policial is the visible workspace tab, panel heading and accessible region name; Conductas context options and related police labels use the same wording while keeping technical keys. The editable active-episode capture heading and type selector use two shrinkable grid columns, with a single-column fallback below 280px. Editing's New observation action remains secondary. Linked controls stay underneath, with the existing selections, IDs and callback/reset rules.

Capture has a stronger heading; the context label and optional disclosures have less visual weight. Optional controls remain mounted. One concise visible note preserves optional, anonymous, non-evaluative recording. Read-only, closed-guard and ownership messages remain. Save has natural width; feedback and operational errors/pending/conflict/retry controls remain present. History has a quiet heading, count and separating border, outside capture.

Writer, independent reviewer and parent source readback completed. The bounded correction replaced the first auto-sized flex header with explicit two-column mobile tracks and clarified primary versus secondary typography. No tests, test changes, build, typecheck, formatter, diff check or browser QA were run. Native assessment was unassessable/high because of unrelated untracked inventory; RDD remains off. Structural source review found no deterministic blocker; this is not runtime or geometry proof.

Source authored change count: 379, mostly relocation of the existing context controls. This coherent presentation unit can exceed the planning forecast once tracking is included; the cached feature-branch-chain strategy remains. Manual path: /episodios-efa -> existing service -> Open area -> Apoyo policial and Conductas. Review header alignment at mobile width, changing each context, editing an existing record, optional disclosures, save feedback and the separate history. All runtime/manual acceptance remains pending with the user.

Afterwards define a separate participation wrapper within Conductas, clearly distinguished from the observation form and its save action. User prefers this placement; no wrapper placeholder, new field, save handler, storage or schema was added. Existing observations are anonymous and non-evaluative; evaluator participation and actor autonomy need clear operational definitions and service-versus-event scope before persistence is designed.

## Recovery mirror

Repository-relative locator: odd/tasks/efa-conduct-capture-hierarchy.md.
Engram topic: odd/efa-conduct-capture-hierarchy/tasks.
