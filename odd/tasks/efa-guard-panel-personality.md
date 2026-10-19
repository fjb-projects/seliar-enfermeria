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
- T2 must not add taps: the catalog shows inline as toggle chips (no sheet), so a mobile plus its crew stays at 4 taps like today. Crew arrivals stay individual per role; no "everyone on board" shortcut (the user says crews rarely arrive together).
- Operational rule: a mobile is operational with Enfermería and Conducción; Medicina is optional and only adds to the state. Card states: no crew, missing a role (named), operational, operational with a doctor; an open hygiene period overrides them.
- Role icons reinforce, never replace, the text: syringe (lucide `Syringe`) for Enfermería, stethoscope (lucide `Stethoscope`) for Medicina, and a steering wheel for Conducción as a small custom SVG in lucide's stroke style, because the installed lucide-react has no steering-wheel icon.

## Constraints
- UI copy Spanish with voseo like the rest of the area; code in English. Never push. No DB commands.
- Server behavior and the start contract (`declaredAtCentral: true`) stay unchanged.
- No hydration mismatch: the live clock renders a placeholder on the server and fills in on the client.

## Tasks
- [x] T1: Start block as a time clock: large live clock in `font-display`, a signed declaration, the main action first with "Iniciando…" feedback, the legal notice and the episodes link demoted below, no nested box, voseo in the panel's error copy. Route: delegated (writer; component plus its tests).
- [x] T2a: Live status header (orange dot, "En curso", start time in `font-display`, elapsed time updated per minute, shared minute hook with the start clock), "Registrar atenciones" moved right under the header, "Terminar guardia" moved to the end of the block behind a divider with a lighter destructive outline style that fixes the white-on-transparent hover. Route: delegated (writer; component plus tests).
- [x] T2b: Inline toggle chips for the mobile catalog, replacing the checkbox list, the duplicated "Móviles activos" chips and the "Gestionar móviles" `<details>`; only selected mobiles render their rows; removing a mobile with records asks for confirmation. Route: delegated (writer; guard panel, arrival panel and their tests).
- [x] T1b: Reopened after the user's review: the start clock is too big (`text-6xl sm:text-7xl`). Bring it to the live header's scale, both at `text-3xl sm:text-4xl`, and fold the date into the eyebrow line to drop a row. Route: delegated (same writer as T2c, same file).
- [x] T2c: Mobile card with three role cells (icons plus labels, custom steering-wheel SVG, dashed optional Medicina) and the computed card state; plus the T2b follow-ups (nested regions both named "Móviles", duplicated empty-catalog message). Route: delegated (writer; guard panel, arrival panel and their tests).
- [ ] T2d: Compact hygiene as a state on the card, and voseo in the hygiene panel copy.

## Checks
`rtk npx vitest run src/components/EfaGuardPanel.test.tsx`, `rtk npx tsc --noEmit` (6 known base errors), `rtk npx eslint src/components/EfaGuardPanel.tsx src/components/EfaGuardPanel.test.tsx`, `rtk npx prettier --check` on the same files. Browser check pending.

## Progress
- Analysis delivered (Laws of UX table per block).
- T1: `GuardStartClock` (SSR placeholder `--:--`, client effect aligned to the minute), signed declaration with an orange left border and `has-[:checked]:bg-accent/40`, "Iniciando…" while busy, `aria-describedby` from `useId`, footnote and `variant="link"` episodes link after the button, read-only users keep the footnote and link. Voseo in `runAction`'s error. RED: 5 of 19 failed on the old code. GREEN: 19/19 (re-run by the parent). `tsc`: only the 6 base errors; eslint 0 errors (4 existing warnings); prettier clean. Commit: see git log (`feat(efa): turn the guard start into a shift time clock`).
- Browser check pending: width jump from `--:--` to digits, checked-declaration contrast in light and dark, the link reading as secondary, the minute tick.
- T1 commit `0fd7077`. Review: RDD off (clone-local); `gentle-ai review assess` tier medium (`under_budget`), so writer self-verification plus the parent re-run.
- T2a: `useMinuteNow()` shared by `GuardStartClock` and the new `GuardLiveStatus` (orange pulsing dot, "En curso", start time in `font-display`, elapsed "3 h 12 min" with a "-- min" placeholder, a visually hidden "Guardia en curso desde HH:MM"). The open-guard bordered wrapper is gone. Order: header, "Registrar atenciones", mobiles, then the end section behind `border-t` with "Al terminar, la guardia no admite nuevos registros." and a ghost plus destructive-border button (hover fixed). RED: 6 failures; GREEN 24/24 (re-run by the parent). `tsc` only the 6 base errors, eslint 0 errors and the same 4 warnings, prettier clean. Commit: `feat(efa): show the open guard as a live status`. Review: RDD off.
- T2b: chip group "Móviles de la guardia" (`aria-pressed`, Check/Plus/spinner icons, busy and "No disponible" states, errors named per mobile), only selected mobiles render their card (name as heading, no checkbox), read-only and history views show static tags, `getMobileRemovalConfirmation` asks before removing a mobile with arrivals or hygiene ("Nada se borra": records stay as read-only history and return if the mobile is added back). Removed "Móviles activos", the "Gestionar móviles" `<details>`, its state and `focusRequest`. Sync error copy in voseo. RED: 20 of 51 failed; GREEN 60/60 (re-run by the parent). `tsc` only the 6 base errors; eslint 0 errors (one new `only-export-components` warning for the exported helper, same pattern as the file's other helpers); prettier clean. About 640 changed lines, about 330 of them tests. Commit: `feat(efa): pick guard mobiles with inline chips`. Review: RDD off.
- Follow-ups from T2b: two nested regions are both named "Móviles"; the empty catalog shows two messages (guard panel and arrival panel). Fold both into T2c.
- T1b + T2c (one commit, same files): clocks at `text-3xl sm:text-4xl` in both states, date folded into the eyebrow. `getMobileCrewState` (open hygiene wins; otherwise "Sin tripulación", "Falta …", "Operativo", "Operativo · con médico"; a doctor alone is not operational), card header with name and badge, three role cells (Syringe, custom `SteeringWheelIcon`, Stethoscope), "+ Ingreso" empty cells, dashed "opcional" Medicina, editable filled cells toggle one actions row per mobile (Editar/Eliminar, same handlers). Single "Móviles" region and a single empty-catalog message. Warning badge uses `dark:text-warning` because the dark `--warning-foreground` on `--warning-soft` has almost no contrast. RED 26 failures; GREEN 77/77 (re-run by the parent). `tsc` only the 6 base errors; eslint 0 errors (one new `only-export-components` warning for the exported helper); prettier clean. About 760 changed lines, over the heuristic because of the cell render paths and per-state tests. Commit: `feat(efa): show each guard mobile as a crew card`. Review: RDD off.
- Pre-existing, not changed: the start time is formatted with `toLocaleTimeString(undefined, …)` on the server, so a server/browser locale or time zone difference can shift it on load.
- Engram mirror pending (session registration failed).
