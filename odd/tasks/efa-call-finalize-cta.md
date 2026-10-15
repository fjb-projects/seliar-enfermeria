# Feature: efa-call-finalize-cta

Branch: `feat/efa-call-finalize-cta` (chained on `feat/efa-dispatch-followup-modal`, unpushed)

## Objective
At the end of the call stepper, let the nurse finalize the call data and go straight to the ambulance dispatch section with one action, make the three actions visually distinct, and fix confusing wording.

## Problem (verified)
- `EfaCommunicationStepper.tsx`: bottom actions "Guardar llamada" (~1920) and "Finalizar llamada" (~1941) with a confirmation dialog (~2010-2012). Finalizing keeps the user on the call section; moving to Despachos requires tapping the section tab.
- The active workspace section lives in `EfaEpisodePanel.tsx` (`activeWorkspaceSection`, `setActiveWorkspaceSection`, ~288) and is not reachable from the stepper (no callback prop).
- Wording/layout issues seen on the review step: "Guardar llamada" does not say it is a draft; "Anterior" is strong blue while "Siguiente" is greyed on the last step (looks disabled/confusing); "Dirección: Entrante" reads like an address (it is the call direction); review dates show ISO strings ("2026-10-14T13:32:00.000").

## Decisions (user-approved)
- Three CTAs in the same bottom row, distinguished by color: "Guardar borrador" (neutral blue-grey), "Finalizar llamada" (dark green), and NEW "Finalizar y pasar a Despachos" (orange, matching the Despachos icon color; primary action). Row stacks on small screens.
- "Finalizar y pasar a Despachos" keeps the confirmation step. Confirmation message must say clearly that we are finalizing the call data and moving to the ambulance dispatch section (instead of the vague "Finalizar los datos de la llamada"); suggested copy: title "Finalizar la llamada y pasar a Despacho", body "Vas a finalizar los datos de la llamada y pasar a la sección de despacho de ambulancia." Keep the existing "Finalizar llamada" confirmation but make its message precise too and truthful to what finalizing does (read the current dialog text and the server finalize semantics; do not claim anything false).
- After the finalize succeeds (server confirmed), switch the workspace to the Despachos section; if finalize fails, stay in Calls and show the error.
- Review-step wording: show "Tipo de llamada: Entrante/Saliente" instead of "Dirección: …" in the review text and rename the first step label accordingly (step tab "Dirección" -> "Tipo de llamada" or the shortest clear label); show dates as dd/mm/yyyy hh:mm (Buenos Aires, `formatDateTimeMinutes` in `src/lib/efa-labels.ts`); hide or neutralize "Siguiente" on the last step so it no longer looks like a disabled action; make "Anterior"/"Siguiente" styles consistent.

## Constraints
- UI copy Spanish (neutral, simple, nurses); code/comments/identifiers English.
- No backend/schema/queue change. Keep existing dirty/queue/offline behavior, idempotency and confirmation flow.
- Accessible (buttons labelled, focus order), touch targets `min-h-11`, color never the only signal.
- Never push; never rewrite published history (Lovable-connected repo). ~400 authored changed lines per task is a planning heuristic only.

## Tasks
- [x] T1 — New CTA + three-color row + precise confirmation messages + section switch callback (`onContinueToDispatches` prop wired from `EfaEpisodePanel`); tests alongside. Commit `cc6e5ff`.
- [x] T2 — Wording and layout cleanup on the review step ("Tipo de llamada", human dates, "Guardar borrador", Anterior/Siguiente); tests alongside. Commit `85884d2`.

## Acceptance criteria
- The bottom row shows "Guardar borrador", "Finalizar llamada" and "Finalizar y pasar a Despachos" in distinct colors.
- Tapping the new CTA shows the new confirmation message; confirming finalizes the call and, once the server confirms, opens the Despachos section; a failure keeps the user on the call with the error.
- Review step shows "Tipo de llamada" and human-readable dates; no confusing disabled-looking "Siguiente".
- `npx vitest run <touched tests>`, `npx tsc --noEmit -p .` (baseline 6 pre-existing errors: RouteTransition.tsx x2, SeliarMobileNav.tsx x2, router.tsx, routes/__root.tsx), `npm run build` pass; known pre-existing failing test `EfaObservationPanel.test.tsx` "keeps the neutral empty-history context in a compact read-only server render".

## Progress
- Route: delegated direct, one writer.
- Review assessment: pending.

## Evidence
- T1 `cc6e5ff`: RED observed (new exports undefined), then GREEN. `CommunicationActionRow`, `communicationFinalizeActions`, `communicationFinalizeConfirmation`, `shouldContinueToDispatches` are pure/SSR-tested. The callback fires only when the dispatched finalize outcome is `confirmed` for the same operation id and the returned call state is `finalized`; `cleaned`, `confirmed-cleanup-failed`, paused or failed outcomes stay on Calls. Wired via `openWorkspace(episode.id, "dispatches")` (marks Despachos visited, workspace heading takes focus).
- "Guardar borrador" label landed in T1 because the action row was rebuilt there.
- T2 `85884d2`: RED observed (4 new tests failing), then GREEN. Step 1 renamed "Tipo de llamada"; review lines via `communicationReviewLines` (`formatDateTimeMinutes`); last step shows only "Anterior"; Anterior/Siguiente share a neutral `bg-background` outline.
- Checks: vitest (5 files, 69 tests) pass; `tsc --noEmit` 6 errors in 4 files (baseline, none new); `npm run build` exit 0.
- Not testable here: component tests are SSR only, so clicking the CTAs, opening the dialog and the real section switch after a server confirmation were not exercised end to end.

## Next step
Manual check in the browser: finalize a draft with the orange CTA and verify the switch to Despachos; then review/push (user decision).
