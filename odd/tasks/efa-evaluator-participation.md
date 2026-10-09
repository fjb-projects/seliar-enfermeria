# Save evaluator participation as a distinct context record

Add optional evaluator participation inside Conductas, bound to the selected context and displayed as a separate item in the shared history. Keep the conduct catalogue and observation save independent.

## Authorized outcome

- A separate compact participation wrapper after observation capture, with its own level, save action and feedback.
- Levels: observation without intervention, punctual consultation, active guidance and direct leadership. An empty selection means not recorded; it is not the lowest level.
- Scope is the selected guard/service/call/dispatch/police support/event context, using the existing context selection and permission fences.
- Persist an independent participation record and render it as one isolated, clearly labelled history item. No fake catalogue entry, conduct classification or inferred actor autonomy.
- Retain versioned correction/audit, idempotency, owner/context checks and recoverable queue behavior.
- Legacy conduct data and queued payloads remain valid, including operation replay/request hashes.

## Constraints

- No person identity fields, scoring of autonomy or changes to the existing anonymous/non-evaluative conduct semantics.
- The user requests manual review: no tests or test edits, build, typecheck, formatter, diff check or browser QA. Source and migration metadata readback only; disclose pending runtime proof.
- Local migration artifacts are part of implementation. Do not connect to, probe or migrate a real database or reuse remote credentials/sessions. Migration application remains a separate rollout step.
- Preserve all unrelated edits and staged deletions, particularly global button/badge changes. No push, PR or deployment.
- Existing neutral Spanish UI; English identifiers and technical documentation.

## Work units

| ID | Outcome | Route | Status |
| --- | --- | --- | --- |
| U1 | Typed participation persistence and backwards-compatible service contract | Delegated: schema, validation, service and migration files | Complete: a70fb22; static review only |
| U2 | Independent capture wrapper and distinct shared-history item | Delegated: UI state, queued payloads and history presentation | Complete source: 511ec58; runtime rollout pending |

## Architecture and acceptance

Use a record discriminator in efa_observation, defaulting legacy records to conduct, and a nullable participation level. Catalogue snapshots/classification become nullable only for participation; SQL row-shape checks must explicitly reject invalid null/mixed cases. Existing context foreign keys and operation/audit pipeline remain. A separate table would duplicate or join the existing context, history and operation protections; a discriminator preserves one history pipeline.

Share the immutable record-kind and level definitions in a small client-safe module when needed; keep them separate from the conduct catalogue. Strict create/update shapes distinguish conduct from participation. Old conduct requests without a discriminator retain their meaning and hash/replay compatibility. Updates cannot convert an existing record between kinds. Participation correction cannot modify catalogue/classification fields.

The UI binds saves to a captured current context and rechecks fresh eligibility. Separate participation draft/feedback from ObservationForm. Do not erase a conduct draft or submit stale context on participation save. Pending operations and version/conflict recovery must route to the correct record kind. History merges both kinds in the existing chronological list, rendering participation with its own title/level/context/time/version and correction action. Empty participation is not persisted.

## Evidence and delivery

Explorer confirmed the current table owns all context references, permissions and audit/version/idempotency infrastructure; the queue payload is already generic create/update. Current strict schemas and not-null snapshots/classification require a typed extension. Migration journal currently ends at 0021; next local migration is 0022_efa_participation_capture.

Integrator: codex/efa-ui-mobile-integrator, initial boundary 622ab10. Cached strategy: feature-branch-chain. Forecast 700–1,100 authored lines plus generated snapshot metadata; advisory estimate, not a cap. Keep coherent work units and source documentation together. RDD clone-local off; unavailable risk assessment remains high and receives independent static review, not fabricated runtime proof. Parent source readback before local conventional commits. No publishing.

## Progress and next step

U1 implemented in the seven planned backend/migration surfaces. Shared record kinds are conduct and participation; the four shared levels have neutral Spanish labels. Strict create validation now combines complete context and payload variants instead of intersecting incompatible strict objects. Legacy request hashes use the original payload, and updates retain kind/version/permission/audit fences. Independent static readback found no deterministic blocker; parent read back shared definitions and SQL constraints. RDD remains clone-local off; assessment failed on unrelated untracked inventory and is treated as high/unassessable. No runtime checks were run by user instruction. U1 committed as a70fb22 (535 authored changed lines excluding generated snapshot metadata). U2 is committed as 511ec58 and its independent static readback is complete; local source units are complete. Rollback U1 removes the seven backend/migration paths introduced or extended by that commit and the corresponding task documentation, preserving unrelated UI work. The migration is prepared locally and not applied; field rollout/manual persistence checks require migration application through the user's authorized environment.


## U2 evidence and rollout

The independent participation wrapper is after conduct capture and before history, with its own level, comment/time, save, edit and nearby feedback. Empty level disables saving. The generic queue routes creates, updates, receipts, retry/restoration and conflicts by record kind, preserving absent-kind conduct operations. Conduct and participation drafts stay separate. History renders participation as a distinct card with level, context, time, version, correction and translated audit labels.

Independent static review identified and the writer corrected two regressions: restoring a same-context conduct operation cleared the participation draft, and correcting a linked-context participation from episode history failed to select its immutable context. Final targeted static readback closed both findings. Same-context restoration now preserves the other draft; cross-context restoration/correction is blocked beside the relevant operation/card when it would discard the other draft. Participation correction selects the record context and submit verifies selection/context agreement before storing the operation selection key. No deterministic blocker remained in the bounded reviewed scope.

U2 source change is 736 authored lines (653 additions, 83 deletions). U2 work-unit commit adds 755 authored changed lines including its documentation. Running count after U1/U2 is 1,290 before this final evidence update, excluding generated snapshot metadata. The count exceeds the advisory forecast because shared queue recovery and context-safe correction require coherent branches; no size-only refactor or omitted behavior. Cached feature-branch-chain delivery remains unchanged. Local source slices are U1 a70fb22 and U2 511ec58; no PR, push or merge.

Checks: writer structural readback, independent source review and final targeted readback, plus parent bounded source readback. Native assessment was unavailable/high due unrelated untracked inventory; RDD clone-local off, no native transaction. Tests, test changes, build, typecheck, formatter, diff check, browser QA and real-database checks were skipped by user instruction, not claimed as passed. U2 rollback affects only EfaObservationPanel.tsx and corresponding documentation, leaving U1 and prior accepted UI separate.

Migration 0022 is a local artifact and has not been applied. Before operational/manual persistence review, obtain explicit destination/operation/connection authorization and apply the migration in that environment. Then the user can manually check selected-context participation save, isolated history/correction, empty selection, and preservation of both drafts during pending-operation restoration. Database rollout and manual runtime proof are pending outside the authorized local implementation.

## Recovery mirror

Repository-relative locator: odd/tasks/efa-evaluator-participation.md.
Engram topic: odd/efa-evaluator-participation/tasks.
