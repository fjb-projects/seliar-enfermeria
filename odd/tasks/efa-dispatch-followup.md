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
- [ ] T2 — Stepper: rename the "Eventos relacionados" block to a visible "Seguimiento del móvil" (hint: register contacts and news with time + note); keep it available whenever it is today and show it expanded (not collapsed) once Llegada a escena (t2) is observed; relabel buttons ("Registrar novedad · Ahora", manual time variant); show entries in the dispatch history as "Seguimiento · hora · nota". Same queue kind/server function. Tests alongside.
- [ ] T3 — Timeline: new pure module `src/lib/efa-episode-timeline.ts` that normalizes episode, calls, dispatch times, follow-up entries, police events and conductas into `{at, kind, title, detail}` sorted ascending with a "Sin hora" group; render it in `EfaEpisodeSummary` (section "Cronología del servicio") under/over the section cards. Tests alongside (pure function tests first, RED then GREEN).

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
- Review assessment: pending.

## Evidence
- T1: server test "exposes the selected base name..." observed RED (`baseName` missing) then GREEN after adding `name` to `findBase` and `baseName` to `listForEpisode`/`get`. Summary tests were written before the implementation but RED was not run separately; GREEN observed. `vitest run` labels/summary/panel/server: 48 passed. Typecheck: only the 6 baseline errors. Route: delegated writer (inline edits). Commit: see "Commits".

## Next step
Launch writer for T1–T3.
