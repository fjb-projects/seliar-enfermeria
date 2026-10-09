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
| U1 | Typed participation persistence and backwards-compatible service contract | Delegated: schema, validation, service and migration files | Implemented; static review complete; commit pending |
| U2 | Independent capture wrapper and distinct shared-history item | Delegated: UI state, queued payloads and history presentation | Pending |

## Architecture and acceptance

Use a record discriminator in efa_observation, defaulting legacy records to conduct, and a nullable participation level. Catalogue snapshots/classification become nullable only for participation; SQL row-shape checks must explicitly reject invalid null/mixed cases. Existing context foreign keys and operation/audit pipeline remain. A separate table would duplicate or join the existing context, history and operation protections; a discriminator preserves one history pipeline.

Share the immutable record-kind and level definitions in a small client-safe module when needed; keep them separate from the conduct catalogue. Strict create/update shapes distinguish conduct from participation. Old conduct requests without a discriminator retain their meaning and hash/replay compatibility. Updates cannot convert an existing record between kinds. Participation correction cannot modify catalogue/classification fields.

The UI binds saves to a captured current context and rechecks fresh eligibility. Separate participation draft/feedback from ObservationForm. Do not erase a conduct draft or submit stale context on participation save. Pending operations and version/conflict recovery must route to the correct record kind. History merges both kinds in the existing chronological list, rendering participation with its own title/level/context/time/version and correction action. Empty participation is not persisted.

## Evidence and delivery

Explorer confirmed the current table owns all context references, permissions and audit/version/idempotency infrastructure; the queue payload is already generic create/update. Current strict schemas and not-null snapshots/classification require a typed extension. Migration journal currently ends at 0021; next local migration is 0022_efa_participation_capture.

Integrator: codex/efa-ui-mobile-integrator, initial boundary 622ab10. Cached strategy: feature-branch-chain. Forecast 700–1,100 authored lines plus generated snapshot metadata; advisory estimate, not a cap. Keep coherent work units and source documentation together. RDD clone-local off; unavailable risk assessment remains high and receives independent static review, not fabricated runtime proof. Parent source readback before local conventional commits. No publishing.

## Progress and next step

U1 implemented in the seven planned backend/migration surfaces. Shared record kinds are conduct and participation; the four shared levels have neutral Spanish labels. Strict create validation now combines complete context and payload variants instead of intersecting incompatible strict objects. Legacy request hashes use the original payload, and updates retain kind/version/permission/audit fences. Independent static readback found no deterministic blocker; parent read back shared definitions and SQL constraints. RDD remains clone-local off; assessment failed on unrelated untracked inventory and is treated as high/unassessable. No runtime checks were run by user instruction. U1 commit pending; U2 remains next. The migration is prepared locally and not applied; field rollout/manual persistence checks require migration application through the user's authorized environment.

## Recovery mirror

Repository-relative locator: odd/tasks/efa-evaluator-participation.md.
Engram topic: odd/efa-evaluator-participation/tasks.
