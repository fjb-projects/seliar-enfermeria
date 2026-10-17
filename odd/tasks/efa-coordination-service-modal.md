# Feature: efa-coordination-service-modal

Branch: `feat/efa-coordination-layout` (continues the layout work, unpushed)

## Objective
Let an admin open the complete, read-only story of any service from `/coordinacion-efa`, with the same presentation the EFA user sees in "Resumen del servicio" on `/episodios-efa`.

## Problem / Why
The expanded guard detail lists each service compactly (`EfaCoordinationServiceList` in `EfaCoordinationGuardDetail.tsx`): date, state, motive, address and dispatch time steps. It has no calls, police coordination, observed conducts or timeline. The user likes the compact design and wants a CTA inside each compact service that opens a modal over the active view with the full service history.

## Facts (verified)
- `EfaEpisodeSummary` (`src/components/EfaEpisodeSummary.tsx:627`) is already read-only and self-contained. It takes `episode: Pick<EpisodeView, id|eventAt|motive|address|interventionNumber|state|closedAt|cancelledAt|cancelledFromState|updatedAt>` and fetches communications, dispatches, police coordinations and observations by `episodeId` through `useServerFn`. The presentational part is `EfaEpisodeSummaryView`.
- Admins may read other users' episodes: `listForEpisode` in communications (`efa-communications.server.ts:623`), dispatches (`:394`), police (`:379`) and observations (`:505`) all allow the owner or an admin.
- `EfaOversightEpisodeRecord` (`efa-guard-oversight.server.ts:38`) lacks `cancelledFromState` and `updatedAt`, which the summary needs. `listGuardEpisodes` (`:288`) is the single select to extend. Times in oversight records are `Date`; `EpisodeView` uses ISO strings.
- Arrivals and hygiene periods are per guard, not per service, so they do not belong in this modal.

## Decisions (user-approved)
- One modal per service (not per guard), opened from a CTA inside each compact service row.
- Read-only: no edit, cancel, reactivate or close actions.
- Reuse `EfaEpisodeSummary`; do not fork its presentation.

## Constraints
- UI copy: Spanish, voseo like the rest of the area. Code and comments: English. Never push. No DB commands. About 400 lines per task is a heuristic only.
- `exactOptionalPropertyTypes` is on.

## Tasks
- [x] T1: Extend the oversight episode record with `cancelledFromState` and `updatedAt` (service type, drizzle select, server test). Route: delegated (writer). Commit: see Progress.
- [x] T2: "Ver servicio completo" CTA in each compact service and a `Dialog` that renders `EfaEpisodeSummary` (mount only when opened); component tests. Route: delegated (writer, same run as T1).

## Checks
`rtk npx tsc --noEmit` (only the 6 known base errors), `rtk npx eslint <touched files>`, `rtk npx vitest run <touched tests>`. Browser check pending.

## Progress
- T1: RED at type level (the server test uses a pass-through fake store, so only `tsc` fails: TS2353 on `cancelledFromState`), GREEN after the type and drizzle select change.
- T2: `EfaCoordinationServiceModal.tsx` (CTA + controlled dialog, `toSummaryEpisode` normalizes Date/ISO strings), `EfaCoordinationServiceList` takes `ownerName`. The summary mounts only while the dialog is open. A footer "Cerrar" button was added because the X scrolls away on phones. `EfaCoordinationPanel.test.tsx` mocks `EfaEpisodeSummary` because its imports need `createServerFn`.
- Checks: `rtk npx vitest run src/lib/efa-guard-oversight src/components/EfaCoordination` 26/26 (writer also ran EfaEpisodeSummary: 44/44), `rtk npx tsc --noEmit` only the 6 base errors, eslint and prettier clean on the touched files.
- Browser check pending (dialog scroll on phones, Radix focus, summary data for another user's service).
