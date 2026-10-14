# Feature: efa-dispatch-followup

Branch: `feat/efa-dispatch-followup` (chained on `feat/efa-episode-summary`, unpushed)

## Objective
Make the service history coherent for dispatches: show the mobile exactly as selected ("Móvil 1"), show a meaningful "Resultado", let the user log ongoing mobile follow-up (time + free-text note) and show the whole service as one chronological timeline.

## Problem
- `src/components/EfaEpisodeSummary.tsx:308` prints `dispatch.institutionName || "Institución sin nombre"`. `institutionName` is the DESTINATION (hospital, set only at "Llegada a destino"). The selected mobile is `efa_dispatch.base_id` -> `efa_base.name` ("Móvil 1"), which the summary never reads.
- "(En curso)" only means `state === "draft"` (dispatch not finalized), which reads like "mobile on scene".
- There is no way to log ongoing communication with the mobile; the only related record is `efa_dispatch_contact_attempt` (occurredAt + note, no type), hidden in the stepper's "Eventos relacionados" block.
- History has no single chronology of the service.

## Decisions (user-approved)
- Follow-up = time + free-text note only. Reuse `efa_dispatch_contact_attempt`; NO migration, NO new table.
- Title of the dispatch card = base name ("Móvil 1"); destination on its own line "Destino: …" only when present.
- Resultado: with result -> label + clarification + "Finalizado HH:mm" (from `finalizedAt`); without result -> "Pendiente".
- Rename "(En curso)" to "Sin finalizar".
- Merged chronological timeline in the history summary, sorted by time; items without a time go in a "Sin hora" group.
- Contact attempts and follow-up notes live in the same table, distinguished only by note text; the UI presents them together as "Seguimiento del móvil".

## Facts (verified by explorer)
- Stepper step 0 select "Base / móvil" writes `form.baseId` (`EfaDispatchStepper.tsx:1783-1797`); list shows `bases.find(b => b.id === row.baseId)?.name ?? "Base histórica"` (`:1614-1616`).
- `listForEpisode` (`efa-dispatches.server.ts:390-409`) spreads `view(record)` (includes `baseId`) and adds `institutionName`, `institutionIsActive`, `contactAttempts`. `tx.findBase(baseId)` exists (used ~`:372`, implemented ~`:1351`) and resolves inactive/historical bases. `get` is at ~`:417-429`.
- Contact attempts UI: "Eventos relacionados" details (`EfaDispatchStepper.tsx:2149-2211`), buttons "Registrar intento de contacto · Ahora" and manual time; queue kind `contact-attempt` (`efa-dispatches.queue.ts:66`); server rejects only cancelled dispatches (`efa-dispatches.server.ts:838-839`); idempotent via unique `(dispatchId, clientEventId)`.
- Dispatch times: t0 Despacho, t1 En camino, t2 Llegada a escena, t3 Sale de escena, t4 Llegada a destino, t5 Entrega efectiva, t6 Disponible; each has `*Status` (observed iff timestamp set). Result set at step 9; finalize requires priority + result.
- Timestamps available per episode: episode eventAt/closedAt/cancelledAt; communications startedAt (fallback createdAt); dispatch t0..t6/firstResponseAt/finalizedAt; contact attempts occurredAt; police events occurredAt (nullable); observations observedAt (nullable, fallback createdAt). Support requests have no episode-level list (out of scope).
- Time formatters in `src/lib/efa-labels.ts` (`formatTimeMinutes`, `formatDateTimeMinutes`, Buenos Aires tz).

## Constraints
- UI copy Spanish (neutral, simple, nurses); code/comments/identifiers English.
- No DB migration. No push. Never rewrite published history (Lovable-connected repo).
- Keep offline-outbox behavior (idempotent clientEventId) unchanged for contact attempts.
- Summary stays read-only; police private notes stay hidden; read-only for admins/revoked accounts.
- ~400 authored changed lines per task is a planning heuristic only.

## Tasks
- [x] T1 — Server+summary: add `baseName` to dispatch DTOs from `listForEpisode` (and `get`) via `tx.findBase`; summary card title "Móvil N" (fallback "Base histórica"), "Destino: …" line only when present, Resultado display (label + clarification + "Finalizado HH:mm" / "Pendiente"), "(En curso)" -> "Sin finalizar". Tests alongside (server + summary + labels).
- [x] T2 — Stepper: rename the "Eventos relacionados" block to a visible "Seguimiento del móvil" (hint: register contacts and news with time + note); keep it available whenever it is today and show it expanded (not collapsed) once Llegada a escena (t2) is observed; relabel buttons ("Registrar novedad · Ahora", manual time variant); show entries in the dispatch history as "Seguimiento · hora · nota". Same queue kind/server function. Tests alongside.
- [x] T3 — Timeline: new pure module `src/lib/efa-episode-timeline.ts` that normalizes episode, calls, dispatch times, follow-up entries, police events and conductas into `{at, kind, title, detail}` sorted ascending with a "Sin hora" group; render it in `EfaEpisodeSummary` (section "Cronología del servicio") under/over the section cards. Tests alongside (pure function tests first, RED then GREEN).
- [x] T4 — Real-data base name: the history card showed "Base histórica" for a real service although fixture tests passed; the summary now also resolves the mobile name from the base catalog (`listEfaBases`, same source as the stepper) by `baseId` when the dispatch read carries no `baseName` (see Evidence).
- [x] T5 — Mark cancelled dispatches: timeline entries of a cancelled dispatch (time entries and follow-up entries) carry the "Anulada" detail like cancelled calls; the summary Resultado line of a cancelled dispatch never shows "Finalizado HH:mm" (no result -> "Resultado: Anulada").

## Acceptance criteria
- Dispatch card in history reads "Móvil 1" (exact selected base name), never "Institución sin nombre".
- Resultado and state wording as decided; no "(En curso)".
- Follow-up entries can be added with time (now/manual) + note from the dispatch and appear in stepper history and in the history summary timeline.
- Timeline ordered chronologically across sections; untimed items grouped as "Sin hora".
- `npx vitest run <touched tests>`, `npm run typecheck` (compare against baseline: 6 pre-existing errors in RouteTransition.tsx x2, SeliarMobileNav.tsx x2, router.tsx, routes/__root.tsx), `npm run build` pass for touched areas; pre-existing failing test `EfaObservationPanel.test.tsx` "keeps the neutral empty-history context in a compact read-only server render" is known.

## Applicable checks
vitest focused files, typecheck vs baseline, build.

## Progress
- Route: delegated direct, one writer; mapping by read-only explorer done.
- Review assessment: pending (parent).
- T1-T3 implemented by one writer, inline edits.

## Evidence
- T1: server test "exposes the selected base name..." observed RED (`baseName` missing) then GREEN after adding `name` to `findBase` and `baseName` to `listForEpisode`/`get`. Summary tests were written before the implementation but RED was not run separately; GREEN observed. `vitest run` labels/summary/panel/server: 48 passed. Typecheck: only the 6 baseline errors. Route: delegated writer (inline edits). Commit: see "Commits".
- T2: stepper tests for `isFollowUpOpen`, `followUpHistoryLine` and `DispatchFollowUpBlock` observed RED (component undefined) then GREEN (14 passed). Follow-up UI extracted into an exported `DispatchFollowUpBlock`; same `contact-attempt` queue kind/server function. The support-request controls that shared the old "Eventos relacionados" block now sit in their own "Solicitudes de apoyo" details (deviation: avoids mislabeling support as follow-up). SSR tests cannot click or toggle; they verify markup and the `open` attribute only. Typecheck: only the 6 baseline errors.

- T3: `efa-episode-timeline.test.ts` and the `timelineKindLabels` labels test observed RED (module/export missing), then GREEN. Component SSR tests for "Cronología del servicio" observed RED then GREEN. The timeline excludes participation records (same as the conducts section) and never reads police `meetingReference`/`notes`. SSR only: no click or scroll behavior is exercised.
- Final verification: focused vitest (9 files) 96 passed; `npm run typecheck` shows only the 6 baseline errors; `npm run build` exit 0.
- T5: timeline test "marks every entry of a cancelled dispatch as Anulada" and summary tests (`dispatchResultLine` cancelled cases, card without "Finalizado") observed RED, then GREEN (26 passed in the two files). Route: delegated writer, inline edits.
- T4 diagnosis: traced the real path and found NO code defect. `drizzleStore.findBase` (`efa-dispatches.server.ts:1353`) selects `efa_base.name` by id with no active/owner filter (FK `efa_dispatch.base_id -> efa_base.id`); `listForEpisode` (`:390-410`) and `get` add `baseName`; `efa-dispatches.functions.ts:135-137` has a validator only for the input and no output schema/mapper; the summary casts the result without mapping (`EfaEpisodeSummary.tsx` fetch effect). Nothing strips `baseName` in the repo, so the most likely cause is a server process still running the pre-T1 module (client new, server old). Not verifiable without the live DB / running server. Police panel `mapDispatchChoices` reads the same `baseName` and had silently fallen back to "Base institucional" before T1 for the same reason.
- T4 hardening: new pure `withResolvedBaseNames` observed RED (not a function) then GREEN; the summary fetches `listEfaBases` best effort (failures ignored, e.g. read-only accounts) and fills missing names by `baseId`. Limitation: the catalog is active-only, so an inactive base still falls back to "Base histórica" when the server omits the name.

## Commits
- T1: 2119133 fix(efa): show selected mobile and clearer result in service summary
- T2: 0283925 feat(efa): add mobile follow-up block to dispatch
- T3: f3beb51 feat(efa): add service timeline to history summary
- T4: 1c9ee41 fix(efa): resolve dispatch base name in episode summary
- T5: 85be98e fix(efa): mark cancelled dispatches in service timeline

## Next step
Review assessment and delivery decision by the parent.
