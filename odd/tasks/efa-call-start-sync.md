# Feature: efa-call-start-sync

Branch: `feat/efa-call-start-sync` (chained on `feat/efa-dispatch-followup`, unpushed)

## Objective

Keep the service start data and the call consistent: when the first call is registered together with the service, its start time is the service start time; the call panel echoes the service time and address; calls without a start time are no longer shown as if they happened at their save time.

## Problem (verified by explorer)

- Service form (`EfaEpisodePanel.tsx`): `eventAt` ("Fecha y hora del hecho", required, empty by default, "Usar ahora"), `address` (private, optional), `registerFirstCall` checkbox (default true, create only).
- Call stepper: step 1 "Dirección" is the call DIRECTION (incoming/outgoing), not an address. Step 2 "Inicio real" = `startedAt` (optional, empty by default). The call has no address column.
- `createInitialIncomingCommunicationOnTransaction` (`efa-communications.server.ts:337-354`) creates the first call with `startedAt: null`; the episode's `eventAt` is never copied.
- `EfaCommunicationPanel` receives no episode data (props at `EfaCommunicationStepper.tsx:290-306`, call site `EfaEpisodePanel.tsx:2134-2146`).
- Summary/timeline show a call at `startedAt ?? createdAt` silently, so the call can appear at a different time than the service.

## Decisions (user-approved)

- With the "Registrar primera llamada" checkbox active, the service start time IS the call start time: the first call is created with `startedAt = eventAt`. With the checkbox off, `eventAt` stays the incident time only.
- Calls added later prefill "Inicio real" with the service `eventAt` (editable).
- Call panel shows a read-only line with the service time and address (echo, no copy, no new address column).
- A call keeps its own time afterwards; later edits of the service time/address do NOT change existing calls (the echo reflects the current service data).
- Summary and timeline: a call without `startedAt` shows "Sin hora" instead of `createdAt`.
- No migration, no schema change.

## Constraints

- UI copy Spanish (neutral, simple); code/comments/identifiers English.
- Preserve idempotency/replay of episode create (request hash, receipts, offline queue); setting `startedAt` for the first call must be deterministic from `eventAt` so replays stay stable. Do not weaken validations.
- The address is a private datum: echo only to users who already can read the episode.
- Never push; never rewrite published history (Lovable-connected repo).
- ~400 authored changed lines per task is a planning heuristic only.

## Tasks

- [x] T1 — First call created with the episode gets `startedAt = eventAt` (server, deterministic, replay-safe); tests alongside. Commit 8e967d0.
- [x] T2 — Call panel: new `episode` prop (eventAt, address), read-only echo line, prefill "Inicio real" for new calls (editable, correct `timeReviewed`/dirty semantics); wire from `EfaEpisodePanel`; tests alongside. Commit b5083e1.
- [x] T3 — Summary and timeline: call without `startedAt` shows "Sin hora" (timeline puts it in the "Sin hora" group); tests alongside. Commit 1277d86.
- [x] T4 — New service form must be blank: after a confirmed create with first-call continuation the form resets to a blank "new service" (`selectedId` null, `registerFirstCall` true) while the call area for the new service stays reachable; an always-available "Nuevo servicio" button replaces "Cancelar edición"; title "Nuevo episodio" -> "Nuevo servicio"; pure helpers `resolvePostCreateState`, `canBeginNewService`, `episodeFormTitle` unit-tested. Commit: see Evidence.

## Acceptance criteria

- Creating a service with the checkbox on yields a first call whose "Inicio real" equals the service time; checkbox off creates no call.
- Adding another call prefills "Inicio real" with the service time, editable.
- The call panel shows the service time and address as read-only text.
- Summary/timeline never show `createdAt` as the call time.
- `npx vitest run <touched tests>`, `npx tsc --noEmit -p .` (baseline: 6 pre-existing errors in RouteTransition.tsx x2, SeliarMobileNav.tsx x2, router.tsx, routes/__root.tsx), `npm run build` pass; known pre-existing failing test: `EfaObservationPanel.test.tsx` "keeps the neutral empty-history context in a compact read-only server render".

## Progress

- Route: delegated direct, one writer; mapping by read-only explorer done.
- Review assessment: pending.

## Evidence

- Route: delegated direct (one writer). RED observed for T1 (episodes server test), T2 (stepper helpers), T3 (timeline + summary); GREEN afterwards.
- T1 8e967d0: `createInitialIncomingCommunicationOnTransaction` takes an optional `startedAt`; the episode service passes the episode-create `eventAt` on both create and replay paths (derived from the request, so the call request hash is stable). `efa_communication.started_at` is nullable with no check tying it to state; audit allowlist already includes `startedAt`.
- T2 b5083e1: `episode` prop, `CommunicationServiceEcho` ("Servicio: dd/mm/aaaa hh:mm · Dirección del servicio: ..."), `newCallStartedAtPrefill`; `startNew` prefills `startedAt` (not marked reviewed; editable; "Dejar sin hora" clears). Existing calls are untouched. Component tests are SSR only (cannot click), so the prefill in `startNew` is verified by helper tests, tsc and build, not by a UI interaction test.
- T3 1277d86: summary card shows "Sin hora" and timeline moves startless calls to the "Sin hora" group.
- T4 root cause: with `registerFirstCall` and a valid continuation, `applyQueueOutcome` exposed the continuation but skipped the reset, and `refreshAfterWrite` had already selected the new service, so the panel stayed in "Editar servicio" with its data. Fix: `resolvePostCreateState` decides expose/reset; the continuation and auto-open are computed against the submitted form first, then the form, `registerFirstCall`, `selectedId` and `serverConfirmedOperationId` are reset. The workspace/call area depends on `workspaceEpisodeId` and `initialCallContinuation`, not on `selectedId`. The cleanup-failed path (confirmed on the server, local queue not cleaned) still keeps the frozen form and blocks resubmission on purpose. Decision: "Cancelar edición" folded into one "Nuevo servicio" button (visible when `selected && canWrite && openOwnGuard`, so also for cancelled services; disabled with pending/conflict; dirty confirmation kept). RED observed for the three helpers; GREEN afterwards. Click and state transitions are not covered (SSR tests only): the post-create reset and the button are verified by helper tests, tsc and build.
- Verification (T1-T3): vitest (8 touched files) 103/103 passed; `tsc --noEmit` 6 errors, all baseline; `npm run build` OK.
- Open risk: an episode created before this change whose create response was lost and is replayed after deploy would hit the call receipt hash check (stored hash has `startedAt: null`) and fail with "La identidad de operación ya se usó para otro cambio."

## Next step

T1–T3 done. Next: separate fix for "Editar servicio" form showing the active service's data when creating a new service (research in progress).
