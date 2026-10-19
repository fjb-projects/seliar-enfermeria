# Feature: efa-guard-panel-personality

Branch: `feat/efa-guard-start-clock` (from `feat/efa-gradient-sidebar-experiment`, unpushed; touches no file of that branch, so it can be cherry-picked onto `main`)

## Objective
Give `/guardia-efa` a product identity of its own instead of the generic "AI-made" form look, guided by Laws of UX. Concept: a shift time clock ("fichar entrada" / guard log).

## Problem / Why
The guard panel stacks up to five nested bordered boxes, gives every element the same weight (small grey text, outline buttons) and reads like a generic form. In the start block the legal notice is read first, the "Ver episodios" button above the card competes with the main action, and the start button gives no feedback while it works.

## Decisions (user-approved)
- Start with the start block (T1). The active guard and mobiles section (T2) comes after the user reviews T1.
- Concept: time clock. Reuse existing tokens (`font-display`, `--brand-orange`, `accent`); no new dependencies.
- Keep the presence declaration (necessary complexity, accountability) but present it as a signed declaration.

## Constraints
- UI copy Spanish with voseo like the rest of the area; code in English. Never push. No DB commands.
- Server behavior and the start contract (`declaredAtCentral: true`) stay unchanged.
- No hydration mismatch: the live clock renders a placeholder on the server and fills in on the client.

## Tasks
- [x] T1: Start block as a time clock: large live clock in `font-display`, a signed declaration, the main action first with "Iniciando…" feedback, the legal notice and the episodes link demoted below, no nested box, voseo in the panel's error copy. Route: delegated (writer; component plus its tests).
- [ ] T2: Active guard and mobiles section (live status header, next steps, mobile cards with role cells, separated end action, end-button hover fix). Pending user review of T1.

## Checks
`rtk npx vitest run src/components/EfaGuardPanel.test.tsx`, `rtk npx tsc --noEmit` (6 known base errors), `rtk npx eslint src/components/EfaGuardPanel.tsx src/components/EfaGuardPanel.test.tsx`, `rtk npx prettier --check` on the same files. Browser check pending.

## Progress
- Analysis delivered (Laws of UX table per block).
- T1: `GuardStartClock` (SSR placeholder `--:--`, client effect aligned to the minute), signed declaration with an orange left border and `has-[:checked]:bg-accent/40`, "Iniciando…" while busy, `aria-describedby` from `useId`, footnote and `variant="link"` episodes link after the button, read-only users keep the footnote and link. Voseo in `runAction`'s error. RED: 5 of 19 failed on the old code. GREEN: 19/19 (re-run by the parent). `tsc`: only the 6 base errors; eslint 0 errors (4 existing warnings); prettier clean. Commit: see git log (`feat(efa): turn the guard start into a shift time clock`).
- Browser check pending: width jump from `--:--` to digits, checked-declaration contrast in light and dark, the link reading as secondary, the minute tick.
- Engram mirror pending (session registration failed).
