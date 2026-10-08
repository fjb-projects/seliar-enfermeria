# Registro de ingreso de móviles y formularios compactos

## Objetivo

Permitir que un guardia activo registre el ingreso de cada móvil seleccionado con una marca horaria por rol (enfermero/a, chofer y médico/a), manteniendo las vistas de guardado compactas y fáciles de usar.

## Problema

El flujo de EFA todavía no tiene un registro de ingreso por móvil y rol. Además, los paneles expandidos de guardia, episodio, comunicación, despacho, observación y coordinación policial acumulan separaciones y relleno que consumen espacio útil durante la carga.

## Alcance

- Documentar el flujo acordado y compactar el espaciado repetido en los paneles de guardado.
- Agregar después la persistencia de una única marca de ingreso por rol y móvil, con auditoría.
- Agregar después la captura desde la interfaz, con edición y eliminación confirmadas.

## Restricciones

- El catálogo de móviles existente es la fuente de selección; no agregar funcionalidad de catálogo en esta iniciativa.
- El registro de esta iniciativa cubre solo el ingreso. No incluye salida, movimientos ni otras marcas de tiempo.
- Cada móvil seleccionado tiene como máximo una marca de ingreso para cada rol: enfermero/a, chofer y médico/a.
- La dotación registrada a nivel guardia permanece intacta y separada de las marcas por móvil.
- El cambio visual conserva controles táctiles `min-h-11`, legibilidad y jerarquía. No se hará un rediseño general.
- No modificar archivos preexistentes fuera del alcance autorizado ni el documento sin seguimiento `docs/efa-mvp-scope-and-plan.md`.
- Cada tarea requiere un commit de unidad para cerrarse. Los commits se organizarán en una rama integradora con ramas hijas locales.

## Ruta y estimación

- Ruta: delegada. La tarea forma parte de una función de varios pasos y requiere compactación de contexto antes de implementar persistencia e interfaz.
- Evidencia de delegación: la iniciativa abarca documento, persistencia/auditoría y flujo de captura con edición/eliminación, en archivos y capas distintas.
- Estimación inicial: más de 800 líneas modificadas en total para los tres trabajos, como previsión de planificación y no como límite.
- Estrategia de entrega: `ask-on-risk`; el usuario eligió `feature-branch-chain` con una rama integradora.
- Conteo actual de líneas de autoría en commits de esta iniciativa: 136 (115 agregadas y 21 eliminadas en la unidad A).

## Tareas

| ID  | Trabajo                                                                     | Estado    | Criterio de aceptación                                                                                                               | Comprobaciones                                                                                                                                                                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Documentar el flujo y compactar el espaciado repetido en paneles expandidos | Completa  | Flujo documentado; separaciones y rellenos repetidos reducidos sin perder jerarquía, legibilidad ni objetivos táctiles               | 6 pruebas de componentes: 50/50 aprobadas; `npm.cmd run typecheck`: aprobado; Prettier acotado: aprobado para ambos documentos y cinco componentes; `git diff --check`: aprobado; lectura estructural: aprobada. `EfaGuardPanel.tsx` y su versión base en `HEAD` no pasan Prettier; se evitó incorporar su reformateo ajeno al cambio. Sin RED artificial para documentación y espaciado CSS. |
| B   | Persistir una marca de ingreso por rol y móvil con auditoría                | En curso  | Se conserva como máximo una marca por combinación de guardia, móvil y rol, con trazabilidad de cambios                               | RED: faltaban los módulos/tabla y fallaron ambos casos de regresión; GREEN: 32/32 pruebas focalizadas, `npm.cmd run typecheck`, `npm.cmd run build`, Prettier acotado y `git diff --check` aprobados. No se ejecutó una prueba de integración contra PostgreSQL. La tarea permanece abierta hasta su commit de unidad.                                                                        |
| C   | Capturar, editar y eliminar el ingreso desde la interfaz                    | Pendiente | Tras guardar, se muestra la marca con acciones Editar y Eliminar; las confirmaciones y los errores son claros y cercanos a la acción | Pruebas de componentes pertinentes, typecheck y verificaciones de interacción extremo a extremo disponibles.                                                                                                                                                                                                                                                                                  |

## Progreso y siguiente paso

Verificación independiente de la tarea A: el diff de los seis componentes contiene únicamente cambios en clases de espaciado; los seis archivos de pruebas pasaron con 50/50 pruebas aprobadas. No se encontró ningún problema concreto. No se realizó QA visual en navegador.

La tarea A quedó verificada y registrada en un commit de unidad. Continúa la persistencia y auditoría de la tarea B antes de conectar la captura y las acciones de la tarea C.

La tarea B ya tiene una migración aditiva y operaciones server-side para listar, crear, corregir y eliminar lógicamente una marca por guardia, base y rol. La creación usa la hora de la base de datos por defecto; cada cambio conserva versión, recibo idempotente y auditoría de solo inserción. La lista conserva las marcas de bases retiradas y guardias cerradas como solo lectura. La revisión agregó controles para bloquear nuevas mutaciones en bases retiradas y validar reintentos con evidencia de creación inmutable. Las pruebas focalizadas (32/32), el chequeo de tipos, la compilación, Prettier acotado y `git diff --check` pasaron. La compilación conserva advertencias preexistentes sobre archivos de prueba en rutas y el plugin de rutas. No hubo prueba de integración contra PostgreSQL ni aplicación de la migración; la tarea B continúa abierta hasta registrar su commit de unidad.

## Registro de commits y entrega

- Tarea A: `8b730a0` (`style(efa): compact expanded forms and map mobile arrivals`), rama hija `codex/efa-mobile-arrival-01-compact`, base `codex/efa-mobile-arrival-integrator`.
- Primer segmento de revisión: `8b730a0`, 136 líneas de autoría. Los segmentos B y C siguen pendientes.
- Estrategia de cadena: `feature-branch-chain`, elegida por el usuario. Rama integradora `codex/efa-mobile-arrival-integrator`; ramas hijas previstas `codex/efa-mobile-arrival-01-compact`, `codex/efa-mobile-arrival-02-service` y `codex/efa-mobile-arrival-03-ui`. No se crearán PR ni se publicarán ramas en esta etapa.
