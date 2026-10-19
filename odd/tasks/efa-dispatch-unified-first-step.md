# Feature: efa-dispatch-unified-first-step

Branch: `feat/efa-dispatch-unified-first-step` (from origin/main 927b3c7, unpushed)

## Objective
Merge the dispatch stepper's first two steps, "Base y vínculo" and "Despacho" (`t0At`), into one step. The stepper goes from 11 to 10 steps with no change to stored data.

## Problem / Why
An observer in an emergency dispatch center hears the call and the ambulance dispatch almost together. Picking the mobile in one step and then recording the dispatch time in the next feels unnecessary. Step 1 also carries "Primera respuesta" (role + time), which sits next to the dispatch time and is easy to confuse with it.

## Decisions (user-approved)
- The merged step is titled "Despacho". Field order: Base / móvil (required) → Hora de despacho + "Ahora" + Estado (`t0At`) → Llamada vinculada → "Primera respuesta" in a collapsible block, closed by default and optional.
- No server, schema, queue, or label changes. `dispatchTimeSteps` in `src/lib/efa-labels.ts` stays untouched.

## Impact check (done before implementing)
- The only consumer of `EfaDispatchStepper` is `EfaEpisodePanel.tsx:2215`, with no step props. No other component deep-links to a step.
- Admin views are unaffected. The coordination detail (`EfaCoordinationGuardDetail`), `EfaEpisodeSummary` and `efa-episode-timeline` read stored dispatch fields and `dispatchTimeSteps`, not the stepper's step indexes.
- The "Servicios de esta guardia" list does not show steps.
- Old feature docs mention "11 steps"; they are history and are not edited.
- Inside the stepper, these hardcoded indexes shift: `dispatchStepTitles`, `step === 0`, `step >= 1 && step <= 7` with `timeSteps[step - 1]`, `step === 8/9/10`, `setStep(8)` / `setStep(9)` in the review step, `Math.min(10, …)`, `disabled={step === 10}`. "Ir a Base" keeps pointing at step 0.

## Constraints
- UI copy: Spanish, voseo or neutral like the file already uses. Code in English. Never push. No DB commands.

## Tasks
- [x] T1: Merge the steps in `EfaDispatchStepper.tsx`, update the step tests, and add tests for the merged step (optional collapsed first response, required base). Route: delegated (writer; a 2.3k-line file plus tests).

## Checks
`rtk npx vitest run src/components/EfaDispatchStepper src/components/EfaEpisodePanel`, `rtk npx tsc --noEmit` (6 known base errors), `rtk npx eslint <touched files>`, `rtk npx prettier --check <touched files>`. Browser check pending.

## Progress
- T1: RED observed (8 failures after changing the expectations: "de 11", "Base y vínculo", review-step index, missing exports), then GREEN. Stepper plus panel tests: 38/38 (re-run by the parent). `rtk npx tsc --noEmit`: only the 6 base errors. eslint 0 errors (the one fast-refresh warning already existed on the base), prettier clean.
- Extracted `DispatchTimeFields`, `DispatchFirstResponseBlock` and the pure helpers `dispatchTimeChange`, `dispatchStatusChange` and `hasFirstResponseValue`. Step indexes now derive from `timeSteps.length` and `dispatchStepTitles.length`.
- "Primera respuesta (opcional)" is closed by default and opens when the form already has a role or a time. Once the user toggles it, that choice sticks. It resets when switching dispatches.
- Browser check pending.
