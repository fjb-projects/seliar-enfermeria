## Summary

Four blocks on top of `main`, ordered by commit. Each commit passes its own focused tests; the branch is already merged with the current `main`.

### 1. `/episodios-efa` header cleanup and "Mi guardia"
- Removes the top "Servicios de la guardia" card (it duplicated the list title and held system notices). The open-guard context becomes one live status line; the "Volver a mi guardia EFA" button and the collapsed notice fallback are gone; queue states render only when they happen; the IndexedDB privacy note moves to the bottom in plain language.
- `/guardia-efa` is named "Mi guardia" everywhere it is linked (nav fallback, quick-action nav labels, page title).

### 2. Autosave in the work area
- New shared core: `src/lib/efa-autosave.ts` (rules for when a draft may save itself, inactivity scheduler, snapshot check, status model, controller with a single in-flight save and `runExclusive`), `src/lib/use-efa-autosave.ts` and `EfaAutosaveStatus`.
- Wired into calls, dispatches, the service header form and existing police coordinations: fields stay editable while a save is pending (newer typing survives a confirmation), drafts of the owner save after ~4 s of inactivity and before a step change, and "Siguiente" creates the draft for calls and dispatches. Police coordinations and observations are never auto-created; events stay manual; other users' records are not autosaved.
- Switching to another record (or starting a new one) saves first and asks "Cambios sin guardar" only when the draft cannot be saved (`src/lib/efa-record-switch.ts`). A held save no longer blocks leaving a call or a police coordination.
- Autosave and switch decisions read live state from refs (not the last render), and manual saves share the controller so a switch waits for them.

### 3. "No interviene"
- The evaluator participation level `observation_only` is labeled "No interviene" (label only, no migration).

### 4. Conducts without a service
- "Registrar conducta" on Mi guardia and "Registrar conducta sin servicio" on `/episodios-efa` open the existing conduct form in a sheet locked to the open guard (`contextType: "guard"`, no schema change).
- New "Cronología de la guardia" on Mi guardia: guard-level conducts ordered by observed time with the guard's services as markers and an "A mejorar" filter. The sheet opens with the current time prefilled.

## Merge note
`origin/main` renumbered the dispatch steps (unified first step). The three conflicts in `EfaDispatchStepper.tsx` were resolved by keeping the save-before-moving navigation and pointing the "Ir a Prioridad" / "Ir a Resultado" shortcuts at `dispatchPriorityStep` / `dispatchResultStep`.

## Test plan
- [x] `vitest` on the touched suites: 309/309 (dispatch, episodes, guard, calls, police, timeline, sheet, autosave, record switch, resume, dispatch lib tests).
- [x] `tsc --noEmit`: only the 6 known base errors.
- [ ] Known unrelated failure: `EfaObservationPanel.test.tsx` "keeps the neutral empty-history context…" (expects copy the panel no longer renders). It fails on `main` too.
- [ ] Browser checks pending: typing during a save (manual and autosave), offline then reconnect, conflict "keep mine", create on "Siguiente", admin on another user's record (no autosave), switching records with unsaved changes, the conduct sheet on phone and desktop, the guard chronology after saving a conduct.

## Size
About 3500 changed lines of source (33 files, +6287/−600 including tests and feature docs under `odd/tasks/`). Kept as one PR; the blocks are independent commits and can be reviewed one by one.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_015VhWZaw8AcVzGjKNDidqoP
