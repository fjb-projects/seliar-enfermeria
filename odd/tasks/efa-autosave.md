# Feature: efa-autosave

Branch: `feat/efa-autosave` (from `feat/efa-episodes-header-cleanup`, unpushed)

## Objective
Inside a service's work area on `/episodios-efa`, users stop losing typed data because they forgot "Guardar": drafts save themselves after a short inactivity and when moving between steps, and saving never freezes the form while the user types.

## Problem / Why
Users (including the product owner) forget to save manually; unsent text is lost when they navigate away. Research (2026-10-19) found:
- Calls, dispatches and episodes have a server `draft` state saved repeatedly with `expectedVersion`; police coordinations and observations have no draft state and no cancel or delete.
- Every form saves through its own IndexedDB queue with one pending operation, and disables its inputs while it is pending (episode: "Los campos están congelados…", `EfaEpisodePanel.tsx:1847`; dispatch: `queueLocked` locks the whole form whenever a queue entry exists, `EfaDispatchStepper.tsx:730`). Offline, the freeze lasts until reconnection.
- No step change saves today. Dirty tracking exists for calls (`dirty`), episodes (`formDirty`), dispatches (`dispatchFormChanged`, always false for a new dispatch) and police (`coordinationDirty`).
- Every changed update writes a full audit row and notifies the owner when the editor is not the owner. No debounce utility exists.

## Decisions (user-approved)
- Two stages, applied per form: (1) saving does not freeze the form: a snapshot is sent, the user keeps typing, and the form stays dirty if it changed after the snapshot; (2) autosave of drafts.
- Autosave on ~4 s of inactivity for records that already exist (episode, call, dispatch, existing police coordination), only when: dirty, nothing pending, queue usable, not busy, online, record still `draft` (police: exists), and the editor is the owner.
- "Siguiente" (step change) saves before moving; for calls and dispatches it also creates the draft when the record does not exist yet (dispatch needs a base).
- Never auto-create police coordinations or observations; observations are out of scope.
- Admins editing records of other users get no autosave (avoids a notice per autosave).
- Visible status next to the form: "Guardando…", "Guardado HH:MM", "Sin guardar", and an offline state.

## Constraints
- UI copy Spanish with voseo, code in English. Never push. No server or schema changes (the server already accepts repeated draft saves).
- No jsdom: put decisions and scheduling in pure, unit-tested modules; components stay thin.
- Each autosave uses a fresh operation id and the current `expectedVersion`; keep existing conflict handling.
- Planning heuristic only: about 400 changed lines per task. Delivery: one work-unit commit per task on this branch; PR slicing decided at push time.

## Tasks
- [x] T1: Shared autosave core: pure decision helper, inactivity scheduler with injectable timers, snapshot "still dirty after save" helper, a small React hook over them and a status component. Route: delegated (writer).
- [ ] T2: Calls (`EfaCommunicationPanel`): non-freezing save, autosave, save on step change, create the draft on "Siguiente". Route: delegated (writer).
- [ ] T3: Dispatches (`EfaDispatchStepper`): replace the whole-form `queueLocked` freeze with snapshot saves, dirty tracking for new dispatches, autosave, save on step change, create the draft on "Siguiente" when a base is chosen. Route: delegated (writer).
- [ ] T4: Episode header form (`EfaEpisodePanel`): non-freezing save and autosave for existing drafts only. Route: delegated (writer).
- [ ] T5: Police coordination (`EfaPoliceCoordinationPanel`): autosave of an existing coordination and its links only, save on step change; never auto-create. Route: delegated (writer).

## Checks
Per task: focused vitest on touched files, `rtk npx tsc --noEmit` (6 known base errors), eslint and prettier on touched files. Browser check pending (typing during a save, offline, two tabs, admin on another user's record).

## Progress
- Research done (see Problem / Why).
- T1: `src/lib/efa-autosave.ts` (`shouldAutosave` with reasons `cannot_write`, `no_record`, `not_draft`, `not_owner`, `not_dirty`, `offline`, `queue_unavailable`, `pending`, `busy`; `createAutosaveScheduler`; `createSaveSnapshot` + `isDirtyAfterSave` + `deepEqualJson`; `AutosaveStatus` + `autosaveStatusLabel` + `deriveAutosaveStatus`; `createAutosaveController` with single in-flight save, re-arm while dirty, no retry loop on `false`), `src/lib/use-efa-autosave.ts` (`useEfaAutosave({ enabled, conditions, save, changeKey?, isDirty?, delayMs? })` → `{ status, decision, online, flush, touch, markSaved }`, own online/offline tracking, StrictMode-safe pause on unmount) and `EfaAutosaveStatus`. Forms must pass `isDirty` when they have a dirty ref and call `markSaved()` after a manual save. RED: modules missing; GREEN 36/36 (re-run by the parent). `tsc` only the 6 base errors; eslint and prettier clean. About 890 lines, about 410 tests. Commit: `feat(efa): add the shared autosave core`. Review: RDD off.
- Engram mirror pending (session registration has been failing).
