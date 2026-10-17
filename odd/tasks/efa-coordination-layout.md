# Feature: efa-coordination-layout

Branch: `feat/efa-coordination-layout` (chained on `feat/efa-quick-guard-end` d64c6c3, unpushed)

## Objective
Redesign `/coordinacion-efa` as a "Coordinación EFA" area. The UI must be dense, personal and scannable on desktop, use the screen height well, and have a clear home for every future section (Estadísticas) and its filters.

## Problem / Why (UX audit with lawsofux.com, user screenshot at ~1334x800)
- About 640px of chrome sits before the first guard, so one guard fits per screen. The blocks are:
  - the generic shell header "Acceso seguro / Gestión de cuentas y permisos", hardcoded in `PrivateAccountShell.tsx:104-105` and wrong for this page;
  - a duplicated page title;
  - a Card titled "Guardias";
  - a boxed 4-field filter grid with 44px inputs plus a separate "Agrupar" checkbox;
  - roughly 200px-tall guard cards.
- Everything is a pill with equal weight. Zero totals are written as text ("Sin higiene"). There is a left-border accent on every card, boxes inside boxes, and repeated labels. Users have no visual identity. Laws broken: Von Restorff, Similarity, Prägnanz, Hick, Proximity, Jakob, Cognitive Load, Occam.

## Decisions (user-approved)
- Area title "Coordinación EFA", shown once at the top of the area.
- Desktop: a collapsible left sidebar (shadcn `src/components/ui/sidebar.tsx`, collapsible to icons).
  - Top part: SECCIONES, with "Guardias" active. Do not render "Estadísticas" until it exists; the structure must make adding it trivial.
  - Bottom part: FILTROS of the current section, which are Usuario (select), Estado (toggle group Todas / En curso / Finalizadas), Desde / Hasta, "Agrupar por usuario", and "Limpiar" with the active filter count. When collapsed, show the active filter count badge.
- Mobile: a top bar with a hamburger (Sheet) that holds ONLY the sections. A separate "Filtros (N)" button above the list opens a bottom Drawer with "Aplicar" and "Limpiar". The existing bottom nav and the guard-in-progress strip stay unchanged.
- Navigation and filters are kept separate (mental model: hamburger = navigation).
- Filters stay in URL search params, as today.
- Main area, desktop:
  - Section header "Guardias" with a summary strip: "En curso ahora", "Guardias hoy", "Servicios hoy" (seed for future statistics), plus a visible/total count.
  - Guards as a dense table, about 48px per row, with columns: user (avatar initials with a stable per-user color, short name), status (live dot for open, plus relative time), start → end, duration, bases, and numeric Servicios / Despachos / Arribos / Higiene columns. Zeros render as a muted "—". The service breakdown goes in a tooltip or `title`.
  - A row expands inline to the existing detail (services and dispatches, plus the end-time correction).
  - Open guards are sorted first and are the only accent.
  - Grouping by user uses collapsible group header rows (avatar, name, email, "4 guardias · 1 en curso · 6 servicios").
- Mobile main area: compact cards that reuse the same avatar, status and numeric metric pieces (no pill soup).
- `PrivateAccountShell` gains optional `title` and `description` props with the current defaults, so other pages are unchanged.

## Constraints
- UI copy: Spanish, voseo consistent with the app. Code: English. Never push. No DB commands. About 400 lines per task is a heuristic only.
- Reuse the existing pure helpers (`src/lib/efa-coordination-filters.ts`) and the server API. No server changes are expected.

## Tasks
- [x] T1: Area layout: `PrivateAccountShell` title/description props, sidebar (sections + filters, collapsible), mobile sections Sheet plus filters Drawer, URL filter wiring, summary strip helpers. Route: delegated (writer trigger: 2+ non-trivial files). Commit `502f57f`.
- [x] T2: Dense guards table on desktop and compact cards on mobile, with avatar identity, open-first sort, collapsible groups, inline expandable detail, "—" zeros. Route: delegated (writer trigger: 2+ non-trivial files). Commit `0e40aca`.
- [x] T3: Full-width option for the coordination area. Route: delegated. Commit `45fa491`.

## Checks
`rtk npx tsc --noEmit` (only the 6 known base errors; line numbers may shift), `rtk npx eslint <touched files>`, `rtk npx vitest run <touched tests>`. Full suite pending (memory). Browser check pending.

## Implementation notes
- The shell header carries the area title once: `PrivateAccountShell` gets `title="Coordinación EFA"` and `description="Guardias de todos los usuarios"`. The sidebar does not repeat it; the mobile sections Sheet uses it as its title.
- Grouping lives in the URL: `?group=0` turns it off and the default is on. `countActiveFilters` ignores it, and `clearCoordinationFilters` keeps it.
- The summary strip (`summarizeGuards`) covers all loaded guards, not only the filtered ones. "Hoy" is the Buenos Aires calendar day, and a guard counts when it started on or before today and is open or ended today or later.
- T1/T2 lived inside the `max-w-5xl` shell column. T3 added `contentWidth="full"` to `WorkflowShell` and `WorkflowHeader` (`max-w-[1600px]`, same `px-4 sm:px-6` gutters), threaded through `PrivateAccountShell`. Only `/coordinacion-efa` uses it; every other page keeps byte-identical classes (tests pin the default strings).
  - The sidebar is a full-height sticky column in the page flow (`sticky top-0 h-svh`). It sits under the desktop top nav, which is not sticky, and stays pinned once that nav scrolls away.
  - The main column is a named container (`@container/main`). From `md`, the table replaces the phone cards once that column reaches 44rem (`md:@[44rem]/main:block`). With the sidebar expanded this needs a viewport of about 1016px; collapsed to icons, about 824px. Below `md`, cards always show.
  - The table container queries are unchanged: Duración shows at 46rem and Bases at 56rem. Both stay in the expanded detail.
  - The 1600px cap avoids very long rows at 1920px. The top nav keeps its own `max-w-7xl`, so at 1920px the nav and the area are not left-aligned.
- Sections are a config array in `EfaCoordinationLayout` (`coordinationSections`). Adding "Estadísticas" is one entry plus its `CoordinationSectionId`.
- Open-guard relative times tick every minute. Those spans use `suppressHydrationWarning` for the server/client clock difference.
- The detail copy now uses voseo ("Intentá", "Actualizá"). Episode states are plain muted text instead of pills, and services are a divided list instead of nested boxes.

## Progress
- T1 `502f57f` `feat(efa): add the coordination area layout with sidebar filters`.
  - RED: 4 new filter tests failed (`isGroupedByOwner`, `countActiveFilters`, `patchCoordinationSearch` and `clearCoordinationFilters` were not functions), the summary module was missing, and the shell title test failed on the base shell.
  - GREEN: all passed after the change.
  - Runtime harness: N/A (SSR render tests); browser check pending.
- T2 `0e40aca` `feat(efa): show coordination guards as a dense table`.
  - RED: the display helper suite failed with the module missing, then on es-AR dropping the day's leading zero (`9/10`). That was fixed with `formatToParts`.
  - GREEN: 10/10.
  - Component SSR tests and `guardMetrics` were written together with their code (no separate RED).
- Checks (both tasks):
  - `rtk npx tsc --noEmit`: 6 errors, all known base ones.
  - `rtk npx eslint <touched files>`: 0 errors; 3 pre-existing fast-refresh warnings (PrivateAccountShell x2, route x1).
  - `rtk npx vitest run` on the 6 coordination/shell/route test files: 46/46 passed.
  - The full suite was not run (memory).
- Size: about 1.8k authored lines added over both tasks, above the 400-line heuristic. Delivery strategy and chain choice are still open.
- T3 `45fa491` `feat(efa): give the coordination area the full page width`.
  - RED: the three full-width shell/header/private-shell tests failed (class `undefined`), and the panel breakpoint test failed on `lg:block`.
  - GREEN: 27/27 on the shell, header, private shell, panel and route test files. 60/60 on the 8 other test files that render the shell.
  - `rtk npx tsc --noEmit`: only the 6 known base errors. `rtk npx eslint` on the touched files: 0 errors, the same 3 fast-refresh warnings.
- Next: browser check at about 1334x800 and at phone width. Check the sticky sidebar under the desktop top nav, the collapsed icons and badge, the Drawer above the bottom nav, row expansion, and dark mode.
