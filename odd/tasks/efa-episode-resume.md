# Feature: efa-episode-resume

Branch: `feat/efa-episode-resume` (from `feat/efa-guard-start-clock`, unpushed; touches no file of the earlier branches in this chain, so it can be cherry-picked onto `main`)

## Objective
When an EFA user opens a service's work area ("Abrir área") on `/episodios-efa`, they land where they left that service: the last active section, and inside each section its own selected record and step (e.g. dispatch X at step 4, call Y at step 2).

## Problem / Why
All position state is local `useState` that dies when the route unmounts (e.g. going to `/guardia-efa` to register crew), and `EfaEpisodePanel` resets the open work area on mount (`setWorkspaceEpisodeId(null)`, `EfaEpisodePanel.tsx:1137`). Coming back, the user has to find the service, open it, pick the section, pick the dispatch and step forward again. Saved data is safe (explicit "Guardar" plus IndexedDB queues); only the position is lost.

## Decisions (user-approved)
- Not in the URL: the page keeps starting as today (create a service on top, this guard's services below). The memory is per service and is used when the work area is opened.
- Remember the last section, and per section its own position, independently of the active tab.
- Store in the browser (localStorage), per user and per service. Only ids and step numbers, no patient data.
- Do not restore stale positions: a missing or no-longer-editable record falls back to the section without a selection. Clear a service's memory when it is closed or cancelled.
- No "unsaved changes" warning for now. Unsaved typed fields are still lost on navigation (out of scope).

## Constraints
- UI copy Spanish with voseo, code in English. Never push. No DB or server changes.
- Storage access wrapped in try/catch; the page works the same when storage is unavailable.
- Planning heuristic only: about 400 changed lines per task.

## Tasks
- [x] T1: Per-service position store (pure module plus tests) and section restore in `EfaEpisodePanel` through `openWorkspace`, saving on section change and clearing on close or cancel. Route: delegated (writer; new lib module, panel and tests).
- [ ] T2: Dispatch and communication steppers: initial position prop (record plus step) validated against loaded data, and a position-change callback saved through the store. Route: delegated (writer; both steppers and tests).

## Checks
Focused vitest on touched files, `rtk npx tsc --noEmit` (6 known base errors), eslint and prettier on touched files. Browser check pending.

## Progress
- Research done: position lives in `useState` in `EfaEpisodePanel` (`workspaceEpisodeId`, `activeWorkspaceSection`), `EfaDispatchStepper` (`selectedId`, `step`) and `EfaCommunicationPanel` (`selected`, `step`); entry links are bare paths; the intro-notice localStorage code (`EfaEpisodePanel.tsx:247-403`) is the pattern to reuse.
- T1: `src/lib/efa-episode-position.ts` (`getEpisodePositionStorage`, `readEpisodePosition`, `saveEpisodeSection`, `saveEpisodeSectionPosition`, `clearEpisodePosition`, `resolveWorkspaceSection`; key `efa:episode-position:v1:<user>:<episode>`; 48 h TTL; tolerant parsing drops bad parts). `openWorkspace(episodeId, section?)`: only "Abrir área" omits the section and gets the remembered one; explicit sections win; every open saves the section; close outcomes in `applyQueueOutcome` and a successful cancel clear it; reactivate keeps it. RED: module missing; GREEN 14/14; with the panel tests 30/30 (re-run by the parent). `tsc` only the 6 base errors; eslint and prettier clean. Commit: `feat(efa): reopen a service on the section it was left`. Review: RDD off.
- Engram mirror pending (session registration has been failing).
