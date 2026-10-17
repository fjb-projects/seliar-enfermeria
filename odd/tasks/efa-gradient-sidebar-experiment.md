# Feature: efa-gradient-sidebar-experiment

Branch: `feat/efa-gradient-sidebar-experiment` (from `feat/efa-coordination-layout`, unpushed)

## Objective
Experiment on `/coordinacion-efa`: on desktop, keep the workflow gradient only in the sidebar, leave the main area on the plain theme background, and add a large, blurred, low-opacity logo behind the main area. Mobile keeps today's full gradient background.

## Problem / Why
The gradient behind the whole page made text contrast impossible (no single text color passes 4.5:1 on orange, pink and violet), which led to the white-text-with-shadow workaround. Confining the gradient to the sidebar lets the main content use the normal theme colors again, and gives the app a more distinctive identity. The user wants to try it before generalizing it.

## Decisions (user-approved)
- Desktop only. Mobile keeps the current gradient background.
- Image: reuse `public/logoSIES.jpg` for now (447px, white lower half). A better-rendered image will replace it later.
- This is a prototype on the coordination area. The user expects to roll it out to every private view, which means a sidebar in the shell for all of them. That is a later, separate decision.

## Constraints
- UI copy Spanish (voseo like the area), code in English. Never push. No DB commands.
- Other pages must stay byte-identical: tests pin the default shell class strings.
- The user cannot review in the browser right now: verify with tests and typecheck, and report anything that needs a visual check.

## Tasks
- [x] T1: Shell/sidebar/backdrop experiment, plus reverting the white-text-with-shadow and backdrop blur that only existed to survive the gradient. Route: delegated (writer; several non-trivial files).

## Checks
`rtk npx vitest run <touched tests>`, `rtk npx tsc --noEmit` (6 known base errors), `rtk npx eslint <touched files>`, `rtk npx prettier --check <touched files>`. Browser check pending.

## Progress
- T1: RED observed on the new shell tests, then GREEN. Shell, private shell, coordination and route tests: 35/35 (re-run by the parent). `rtk npx tsc --noEmit`: only the 6 base errors. eslint 0 errors (3 existing fast-refresh warnings), prettier clean.
- Mechanism: `surface?: "gradient" | "calm"` (default `"gradient"`) on `WorkflowShell` and `PrivateAccountShell`; the coordination route passes `"calm"`. `.workflow-background-mobile-only` keeps the gradient below `md` and goes transparent from `md`. The sidebar's inner `[data-sidebar=sidebar]` carries the gradient; labels and nav items use white semibold text with the tuned shadow; filters sit on an opaque `bg-card` block. The backdrop is a sticky layer with `mix-blend-multiply`, `opacity-15`, hidden below `md` and in dark mode, holding `/logoSIES.jpg` blurred with `blur-3xl`.
- Reverted the white text and backdrop blur on the table and main column. Side effect: on phones the header and summary strip lost the blur they had on the gradient.
- Known: `RouteTransition` still flashes the gradient overlay on desktop for coordination.
- Not visually verified. Needs a browser check: sidebar contrast on orange/pink/violet, nav hover/active, collapsed rail, filter card width, backdrop position and overflow, dark mode, phones.
