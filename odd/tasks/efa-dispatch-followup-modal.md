# Feature: efa-dispatch-followup-modal

Branch: `feat/efa-dispatch-followup-modal` (chained on `feat/efa-call-start-sync`, unpushed)

## Objective

Make the mobile follow-up ("comunicaciones de seguimiento") quick to reach while a dispatch is being filled in: a highlighted button in the stepper's step-indicator row opens a small modal to add a follow-up entry (time + free-text note), and the step indicator/list get colored for hierarchy.

## Problem

The "Seguimiento del móvil" block (`DispatchFollowUpBlock`, `src/components/EfaDispatchStepper.tsx:~362`, rendered ~2236) sits at the very bottom of the dispatch card, collapsed, below the 11-step form and above "Solicitudes de apoyo". During a service the nurse is on some step and cannot reach it quickly.

## Decisions (user-approved)

- Layout stays: four section tabs (Llamadas, Despachos, Apoyo policial, Conductas) on top, then the row "Paso N de 11: <nombre> | Ver pasos" directly below them.
- In that same row add a highlighted button "Comunicaciones de seguimiento" (visible when a dispatch exists and the user can edit it).
- The button opens a SMALL MODAL to add the follow-up entry (time: now/manual + free-text note). Same data, queue kind (`contact-attempt`), server function and idempotency as today; no backend/schema change.
- Color the steps for hierarchy: current step strong (dark green), completed steps soft green with a check, pending neutral; applies to the "Paso N de 11" indicator and the "Ver pasos" list.
- The bottom block stays as the place that lists the entries (history); the modal is the quick way to add.

## Constraints

- UI copy Spanish (neutral, simple, nurses); code/comments/identifiers English.
- Accessible modal (use the repo's existing dialog primitive if present, e.g. `src/components/ui/dialog.tsx`, focus trap, Escape/close, labelled title), mobile-first (row wraps on narrow screens; modal fits small screens), touch targets `min-h-11`, color never the only signal (icons/text too).
- Disabled when busy, cancelled dispatch, or not editable; keep dirty/queue behavior of the stepper unchanged.
- Never push; never rewrite published history (Lovable-connected repo). ~400 authored changed lines per task is a planning heuristic only.

## Tasks

- [x] T1 (e739c44) — Follow-up modal + highlighted button in the step-indicator row (reuse the existing add handlers/state; close on success; show validation/busy state); tests alongside (SSR markup of button/label; pure helpers).
- [x] T2 (09ee00b) — Step hierarchy coloring for the indicator and the "Ver pasos" list (current/complete/pending states with text/icon cues); tests alongside.

## Acceptance criteria

- The row under the section tabs shows "Paso N de 11: …", "Ver pasos" and a highlighted "Comunicaciones de seguimiento" button (when a dispatch exists and is editable).
- Tapping it opens a small modal with time (ahora / manual) + note and a save action that registers the entry with the existing queue path; it closes after success.
- Steps are colored by state in the indicator and the list.
- `npx vitest run <touched tests>`, `npx tsc --noEmit -p .` (baseline 6 pre-existing errors: RouteTransition.tsx x2, SeliarMobileNav.tsx x2, router.tsx, routes/__root.tsx), `npm run build` pass; known pre-existing failing test `EfaObservationPanel.test.tsx` "keeps the neutral empty-history context in a compact read-only server render".

## Progress

- Route: delegated direct, one writer.
- Review assessment: pending.

## Evidence

- T1 `e739c44` feat(efa): add follow-up modal to the dispatch stepper. RED observed (module missing) then GREEN for the new modal test file; the stepper action-slot test was written after the implementation (no RED). Modal built on the existing Radix `ui/dialog.tsx`; success is detected through a `confirmedOperations` ref filled by `executeEntry`; the shared note/time/feedback fields are reused by the bottom block. Close button of `dialog.tsx` now has a 44px target and the label "Cerrar".
- T2 `09ee00b` feat(efa): color dispatch steps by progress. RED observed (`dispatchStepState` missing, no `data-step-state`) then GREEN. "Completed" = index below the current step (no separate completion tracking exists in the stepper). Cues beyond color: check/dot/circle icons, "Actual"/"Completado" text, "(completado)" in the aria-label, plus an aria-hidden segmented progress bar.
- Verification (both tasks): vitest 5 files / 62 tests passed; `tsc --noEmit -p .` 6 errors, same 4 baseline files (no new); `npm run build` completed without errors.
- Not covered: SSR tests cannot click or open the modal (Radix portal renders nothing on the server), so open/close, focus management, Escape and closing after success were not exercised by automated tests; manual check pending.

## Next step

Manual browser check of the modal flow, then review assessment and delivery decision.
