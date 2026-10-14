# Feature: efa-episode-summary

Branch: `feat/efa-episode-summary`

## Objective
Replace the raw JSON "Antes/Después" version dump inside the service card's history section with a human-readable, read-only summary of what was recorded in the service (service data, calls, dispatches, police support, conductas). Non-technical nurses must be able to tell each section apart at a glance.

## Problem
`src/components/EfaEpisodePanel.tsx:2230-2265` renders `JSON.stringify(item.beforeState/afterState)` for every version. The audit trail only covers episode fields, not what was captured in each section, so it carries no useful information for end users.

## Decisions (user-approved)
- "Área de trabajo" (`EfaEpisodeWorkspace`, 4 editing tabs) is NOT touched.
- The summary lives inside the history section (opened by "Ver historial"), replacing the JSON dump.
- Versions are de-emphasized: only the final state is visible (e.g. "Cerrado el 14/10 11:09 · última actualización 11:09"). No per-version list.
- The same summary serves active services (same card list); empty sections are shown as pending ("Sin despachos todavía").
- Police `meetingReference` and `notes` (private) are NOT shown in the summary.
- Support requests are out of scope for v1 (no per-episode list server function is exported yet).

## Constraints
- UI copy in Spanish, code/comments/identifiers in English.
- No new backend: reuse `listEfaCommunicationsForEpisode`, `listEfaDispatchesForEpisode`, `listEfaPoliceCoordinationsForEpisode`, `listEfaObservationsForEpisode`.
- Fetch lazily when history opens; cache per `episodeId`; never preload for all cards.
- Read-only for admins and revoked EFA accounts; correction notices must keep showing no episode content.
- Offline outbox entries are not in server reads: show "Puede haber cambios sin sincronizar" notice.
- Lovable-connected repo: never rewrite published history; do not push.
- ~400 authored changed lines per task is a planning heuristic only.

## Tasks
- [x] T1 — Shared Spanish labels module `src/lib/efa-labels.ts` (priority, direction, dispatch result/status, police event kind, observation group/classification, formatting) extracted from the steppers/panels; they import it. Tests alongside.
- [x] T2 — `EfaEpisodeSummary` read-only component: lazy load, one card per section, pending state, unsynced notice, final-state line. Tests alongside.
- [x] T3 — Integrate into `EfaEpisodePanel` history section, remove JSON dump and per-version list, update `EfaEpisodePanel.test.tsx`.

## Acceptance criteria
- Opening "Ver historial" shows the section summary and no JSON or per-version list.
- Sections without data show a pending message; sections with data show Spanish human-readable fields.
- `npm run typecheck`, `npm test` (vitest run) and `npm run build` pass for touched areas.

## Applicable checks
`npx vitest run <touched test files>`, `npm run typecheck`, `npm run build`.

## Progress
- Route: delegated direct, one writer (3 non-trivial files touched across tasks; mapping already done by read-only explorer).
- Review assessment per commit: pending (parent).

## Evidence
(commits and observed results recorded per task)

### Baseline (before any change, observed)
- `EfaObservationPanel.test.tsx` > "keeps the neutral empty-history context in a compact read-only server render" already fails on base (copy mismatch: expects "Registrar es opcional; la ausencia de registros no evalúa a ninguna persona."). Unrelated to this feature.
- `npm run typecheck` already reports 6 TS errors on base (RouteTransition.tsx x2, SeliarMobileNav.tsx x2, router.tsx, routes/__root.tsx). Unrelated.

### T1
- Test-first exception: pure extraction of already-tested copy; `efa-labels.test.ts` is a characterization test written together with the module (no RED observed).
- Vitest (labels + Communication/Dispatch/Police/Observation/Episode panel tests): 62 passed, 1 failed (the pre-existing baseline failure above). Typecheck: same 6 baseline errors, none in touched files.
- Commit: d09e1ab

### T2
- Test-first exception: SSR-only tests (renderToStaticMarkup); component and tests were written together, first run was GREEN (11 tests), no RED observed.
- Vitest (efa-labels + EfaEpisodeSummary): 17 passed. Typecheck: same 6 baseline errors. ESLint/prettier clean on new files (prettier also reformatted efa-labels.ts).
- Design: data held in component state only (no module-level cache, avoids cross-account leakage); fetch happens on mount; static footer carries the unsynced hint.
- Commit: 1152d34

### T3
- Panel: "Ver historial" now mounts `EfaEpisodeSummary` (section "Resumen del servicio") and no longer calls `getEfaEpisodeHistory`; JSON dump, per-version list, `EpisodeAuditView`, history state and the "No se pudo cargar el historial autorizado." error were removed. `EfaEpisodeWorkspace` untouched.
- Test-first exception: SSR cannot click the button; added a static-markup regression test (summary closed by default, no JSON/Antes/Después). Existing "Ver detalles" assertions unchanged and green.
- Vitest (labels, summary, EpisodePanel, Workspace, PoliceCoordination, Observation): 59 passed, 1 failed (the pre-existing baseline failure). `npm run typecheck`: same 6 baseline errors, none in touched files. `npm run build`: exit 0.
- Commit: b00a694

## Next step
Review assessment per commit, then manual check in the browser (click "Ver historial").
