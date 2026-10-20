# Feature: efa-guard-conducts

Branch: `feat/efa-guard-conducts` (from `feat/efa-autosave`, unpushed)

## Objective
Let EFA users record conduct observations that are not tied to a service (problems and improvement opportunities seen during the guard), with the same method as inside a service (time, conduct type, classification, comment), and read them in chronological order.

## Problem / Why
Research (2026-10-19): `efa_observation` already supports `context_type = "guard"` with `episode_id` null end to end (zod, server, UI "Guardia"/"Solo guardia" options), but the only entry is buried in each guard card of "Mis guardias" → "Ver detalles" → "Ver conductas observadas", and that list is ordered by `createdAt`, not by the observed time. The only chronology is "Cronología del servicio" (`buildEpisodeTimeline`), per service.

## Decisions (user-approved)
- Use the guard as the container (no migration): records need an open guard owned by the user, as today.
- Main CTA on "Mi guardia" under "Registrar atenciones": secondary button "Registrar conducta" with helper text "Sin servicio asociado: problemas u oportunidades de mejora que observes en la guardia".
- Secondary CTA on `/episodios-efa` next to "Nuevo servicio": link "Registrar conducta sin servicio", opening the same form.
- The form opens in a sheet (bottom on phones, side on desktop) with the context fixed to "Guardia" (no context selector): time (defaults to "Ahora"), conduct, classification, comment.
- New "Cronología de la guardia" on "Mi guardia": guard-level conducts ordered by observed time, with service markers as context, and a quick filter "A mejorar".
- Coordination view for admins: a later stage, not in this feature.
- Participation level `observation_only` is labeled "No interviene" (done on the autosave branch, `d4dda13`).

## Constraints
- UI copy Spanish with voseo, code in English. Never push. No server schema or migration changes.
- Reuse `EfaObservationPanel` and the catalog; do not fork the form.
- Planning heuristic only: about 400 changed lines per task.

## Tasks
- [x] T1: "Registrar conducta" CTA on "Mi guardia" and "Registrar conducta sin servicio" on `/episodios-efa`, opening the observation form in a sheet locked to the open guard's context. Route: delegated (writer).
- [x] T2: "Cronología de la guardia" on "Mi guardia": guard-level conducts by observed time with service markers and an "A mejorar" filter. Route: delegated (writer).

## Checks
Focused vitest on touched files, `rtk npx tsc --noEmit` (6 known base errors), eslint and prettier on touched files. `src/components/EfaObservationPanel.test.tsx` has one pre-existing failure ("keeps the neutral empty-history context…", expects copy the panel no longer renders). Browser check pending.

## Progress
- Research done (see Problem / Why).
- T1: `EfaObservationPanel` gets `lockGuardContext` and `onSaved` (lock only without an episode: forces the guard context, hides the context selector and the episode picker, refuses to restore a pending operation that belongs to a service with a voseo message); `EfaGuardConductSheet` (shadcn Sheet: bottom below 768px with scroll, right side from `md`; panel mounted only while open); "Registrar conducta" (ghost with border, `ClipboardPen`, helper via `aria-describedby`) on "Mi guardia" for a writer with an open own guard; "Registrar conducta sin servicio" link next to "Nuevo servicio" on `/episodios-efa`; a save in the sheet remounts the open guard's "Ver conductas observadas" list. RED: new suites failing; GREEN 96/97 on the related files, the one failure being the pre-existing one (re-run by the parent). `tsc` only the 6 base errors; eslint unchanged (`EfaObservationPanel.tsx` already has 40 prettier errors at HEAD, left alone to avoid 124 unrelated lines). Commit: `feat(efa): record conducts without a service from Mi guardia`. Review: RDD off.
- Open from T1: "Hora real observada" stays empty when the sheet opens ("Ahora" fills it on tap); a conduct without a time lands outside the chronology, so T2 should prefill it when opened from the sheet. Risks: saving from the sheet reloads an open "Ver conductas observadas" list and drops an unsaved draft there.
- T2: `buildGuardTimeline` (guard-level conducts only, participation skipped, `observedAt` with a flagged `createdAt` fallback, service markers at `eventAt` with "Servicio · Intervención N" / motive, cancelled services without a marker, oldest first with the marker first at the same minute, a separate "Sin hora" list, the "A mejorar" filter keeps markers); `EfaGuardTimeline` on "Mi guardia" after "Móviles" with one `useQuery` (`efaGuardTimelineQueryKey`: `listEfaObservationsForGuard` + `listEfaEpisodes` filtered by `originGuardId`), chips "Todas" / "A mejorar", text badges, empty and filtered-empty states, refreshes on sheet saves and on saves from "Ver conductas observadas"; `prefillObservedAtNow` prefills "Hora real observada" when the form is locked to the guard (at open, on new, and after each confirmed save in the sheet). Observations have no deleted or superseded state (corrected in place by version). RED: modules and helper missing; GREEN 91/92 on the related files, the one failure being the pre-existing one (re-run by the parent). `tsc` only the 6 base errors; eslint unchanged; prettier clean on touched files except the pre-existing `EfaObservationPanel.tsx`. About 830 lines, about half tests. Commit: `feat(efa): show the guard chronology on Mi guardia`. Review: RDD off.
- T2 risks: hour:minute only, so a guard past midnight repeats times (order stays correct); services are filtered on the client from `listEfaEpisodes`.
- Next stage (not started): the same chronology in the coordination guard detail for admins.
- Engram mirror pending (session registration has been failing).
