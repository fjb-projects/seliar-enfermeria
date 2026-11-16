# EFA user manual v3 (mobile and desktop screenshots)
Branch: `codex/efa-service-selector` (no repo code changes planned); delivery: files in `C:\Users\Fernando\Documents\FerJuan\SeLIAR\EFA`. Runner: Vitest/TypeScript only if repo code is touched.
Capture harness and drafts live in the session scratchpad, outside the repo. Risk: none expected (documentation + out-of-repo tooling).

## Specs
- S1: "Quiero que Hagamos nuevamente el Manual de uso de esta aplicación de EFA con imágenes que correspondan tanto a la versión móvil como a la versión desktop, de todas las cosas que se pueden hacer."
- S2: "quiero que hagamos una actualizada con los colores que actualmente funcionan, etc." Base: "C:\Users\Fernando\Documents\FerJuan\SeLIAR\EFA\tutorial uso EFA v2.pdf" (17 pages, 11 sections + glossary, fictitious-data mockups with numbered callouts). Keep the structure, refresh instructions to the current UI.
- S3: Images come from a fictitious-data capture page that reuses the real app components (answer: "Maqueta con datos ficticios"), not from the user's database or session. Mobile 390 px and desktop 1440 px.
- S4 (assumption): output is a PDF named "tutorial uso EFA v3.pdf" next to v2, plus the HTML source.

## Tasks
- T1 [S3] inline — capture harness: vite config with mocked `*.functions`, fixture store, fictitious session.
- T2 [S1,S3] inline — drive the app and capture every flow in mobile and desktop with numbered callouts.
- T3 [S1,S2] inline — rewrite the manual text against the current UI and assemble HTML.
- T4 [S4] inline — print to PDF, review every page visually.

## Log
- L1: User request verbatim (2026-11-15): "Quiero que Hagamos nuevamente el Manual de uso de esta aplicación de EFA con imágenes que correspondan tanto a la versión móvil como a la versión desktop, de todas las cosas que se pueden hacer. Te voy a compartir la última versión que creamos en PDF y quiero que hagamos una actualizada con los colores que actualmente funcionan, etc. "C:\Users\Fernando\Documents\FerJuan\SeLIAR\EFA\tutorial uso EFA v2.pdf""
- L2: Image source decision (user, 2026-11-15): "Maqueta con datos ficticios (Recomendado)".

- 2026-11-16: Capturas completas (46 de escritorio y 45 de móvil, 91 usadas). Manual armado con generador propio (HTML a PDF con Chrome). Salida: `EFA/tutorial uso EFA v3.pdf` (32 páginas, 8,6 MB) y `EFA/tutorial uso EFA v3 - fuente/` (manual.html + img/). T1-T4 hechas. Sin commit.
- Pendiente de revisión humana: la captura móvil `m01` se arma recortando la franja inferior de `m03`; los números de las leyendas siguen el orden de recuadros de la captura de escritorio.
