# Feature: efa-episodes-header-cleanup

Branch: `feat/efa-episodes-header-cleanup` (from `feat/efa-episode-resume`, unpushed)

## Objective
Give `/episodios-efa` back its focus (create and continue services) by removing the top "Servicios de la guardia" card, and give `/guardia-efa` a single name, "Mi guardia", everywhere it is linked.

## Problem / Why
The first card on `/episodios-efa` is titled "Servicios de la guardia" but holds system notices (list info, open-guard line with a "Volver a mi guardia EFA" button, local queue state, an IndexedDB note). The real list below is titled "Servicios de esta guardia", so two cards share a name and the less important one comes first with a large title and a loud lilac button. The back button duplicates the navigation. `/guardia-efa` is called "Consulta EFA", "Iniciar guardia", "Bases y dotación", "Consultar guardias", "Guardia EFA" and "mi guardia EFA" depending on the place.

## Decisions (user-approved)
- Remove the card and its title. Keep one "Servicios de esta guardia" section.
- Open-guard context becomes one small status line in the live style used on `/guardia-efa`.
- Remove "Volver a mi guardia EFA".
- Intro notice: shown until dismissed, then gone (no collapsed fallback).
- Queue states (preparing, unavailable, error, pending operations) render only when they happen, as alerts, not inside a card.
- The IndexedDB privacy note stays, moved to the bottom of the page in plain language.
- `/guardia-efa` is named "Mi guardia" in the navigation, the page title and the panel home destination; panel home action labels may still describe the action.

## Constraints
- UI copy Spanish with voseo, code in English. Never push. No server changes.

## Tasks
- [x] T1: Remove the top card of `/episodios-efa` and redistribute its content as decided. Route: delegated (writer, same run as T2).
- [x] T2: "Mi guardia" as the single name of `/guardia-efa` (nav fallback, quick-action nav labels, page title). Route: delegated (writer, same run as T1).

## Checks
Focused vitest on touched files, `rtk npx tsc --noEmit` (6 known base errors), eslint and prettier on touched files. Browser check pending.

## Progress
- Analysis delivered with path:line evidence (`EfaEpisodePanel.tsx:1705-1790`, `:2061`; `SeliarMobileNav.tsx:138`; `efa-panel-quick-actions.ts:20-48`).
- T1+T2 (one writer run, one commit): `GuardScopeStatus` line ("Guardia abierta desde HH:MM · solo servicios de esta guardia" / "Sin guardia abierta: no hay servicios para mostrar."), top card, title, back button and the notice's `<details>` fallback removed; read-only, queue and pending-operation states render directly under their conditions; privacy note at the bottom in plain language. "Mi guardia" as the nav fallback, the nav label of every `/guardia-efa` quick action and the guard panel title; action labels on the panel home kept. RED: 9 failures; GREEN 59/59 (re-run by the parent). `tsc` only the 6 base errors; eslint 0 errors, 4 warnings unchanged; prettier clean. Commit: `refactor(efa): drop the episodes status card and name the guard page Mi guardia`. Review: RDD off.
- Supersedes `odd/tasks/session-aware-navigation.md:90` (the dismissed notice no longer stays reachable through a disclosure).
- Follow-up: without an open guard, three similar messages show (status line, empty list text, "Para registrar un servicio, abre primero tu guardia EFA…" which is also not in voseo).
- Engram mirror pending (session registration has been failing).
