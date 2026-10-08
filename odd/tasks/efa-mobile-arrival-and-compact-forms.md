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
- Conteo actual de líneas de autoría en commits de esta iniciativa: 2152 (136 en A, 1400 en B y 616 en C, sin contar las 6084 líneas del snapshot generado).

## Tareas

| ID  | Trabajo                                                                     | Estado   | Criterio de aceptación                                                                                                               | Comprobaciones                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Documentar el flujo y compactar el espaciado repetido en paneles expandidos | Completa | Flujo documentado; separaciones y rellenos repetidos reducidos sin perder jerarquía, legibilidad ni objetivos táctiles               | 6 pruebas de componentes: 50/50 aprobadas; `npm.cmd run typecheck`: aprobado; Prettier acotado: aprobado para ambos documentos y cinco componentes; `git diff --check`: aprobado; lectura estructural: aprobada. `EfaGuardPanel.tsx` y su versión base en `HEAD` no pasan Prettier; se evitó incorporar su reformateo ajeno al cambio. Sin RED artificial para documentación y espaciado CSS.                                                                                             |
| B   | Persistir una marca de ingreso por rol y móvil con auditoría                | Completa | Se conserva como máximo una marca por combinación de guardia, móvil y rol, con trazabilidad de cambios                               | RED: faltaban los módulos/tabla y fallaron ambos casos de regresión; GREEN: 32/32 pruebas focalizadas, `npm.cmd run typecheck`, `npm.cmd run build`, Prettier acotado y `git diff --check` aprobados. Verificación independiente y `drizzle-kit check` aprobados. No se ejecutó una prueba de integración contra PostgreSQL.                                                                                                                                                              |
| C   | Capturar, editar y eliminar el ingreso desde la interfaz                    | Completa | Tras guardar, se muestra la marca con acciones Editar y Eliminar; las confirmaciones y los errores son claros y cercanos a la acción | RED: la prueba del componente falló porque aún no existía; GREEN: 19/19 pruebas focalizadas; revalidación independiente acotada: 17/17; suite completa: 60 archivos y 369 pruebas. `npm.cmd run typecheck`, `npm.cmd run build`, Prettier acotado y `git diff --check` aprobados. Los archivos existentes `EfaGuardPanel.tsx` y `EfaGuardPanel.test.tsx` conservan deriva de formato. No hubo QA de interacción en navegador ni integración contra PostgreSQL; la migración no se aplicó. |

## Progreso y siguiente paso

Verificación independiente de la tarea A: el diff de los seis componentes contiene únicamente cambios en clases de espaciado; los seis archivos de pruebas pasaron con 50/50 pruebas aprobadas. No se encontró ningún problema concreto. No se realizó QA visual en navegador.

La tarea A quedó verificada y registrada en un commit de unidad. Continúa la persistencia y auditoría de la tarea B antes de conectar la captura y las acciones de la tarea C.

La tarea B quedó registrada en un commit de unidad. La migración aditiva y el servicio permiten listar, crear, corregir y eliminar lógicamente una marca por guardia, base y rol; cada cambio conserva versión, recibo idempotente y auditoría de solo inserción. La revisión independiente detectó y ayudó a corregir escrituras sobre bases retiradas y reintentos de creación posteriores a una edición. La lista conserva esas marcas y las de guardias cerradas en solo lectura. Pasaron 32/32 pruebas focalizadas, tipos, compilación, formato, diff y `drizzle-kit check`; no hubo prueba de integración contra PostgreSQL ni aplicación de la migración.

La interfaz de la tarea C carga las marcas junto con las guardias y la dotación. Cada base seleccionada se expande para mostrar una fila por rol; la primera acción guarda la hora actual del servidor y una respuesta confirmada actualiza el estado visible. Las marcas de bases retiradas y guardias cerradas quedan en solo lectura. Editar requiere guardar una fecha y hora explícita; eliminar pide confirmación. Los reintentos mantienen los identificadores de operación mientras el contenido no cambie. Los identificadores se generan con `crypto.randomUUID()` o `crypto.getRandomValues()` y fallan de forma segura cuando no existe una fuente criptográfica; las fechas locales se validan antes de serializarse. Cada fila conserva su propio estado pendiente. Pasaron 19/19 pruebas focalizadas y la revalidación independiente pasó 17/17; la suite completa pasó con 60 archivos y 369 pruebas, además de typecheck, compilación, Prettier acotado y diff. No hubo QA de interacción en navegador ni integración contra PostgreSQL; la migración no se aplicó. La deriva de formato en `EfaGuardPanel.tsx` y `EfaGuardPanel.test.tsx` ya existía.

## Próximo paso

El código está completo localmente en la rama hija C, `codex/efa-mobile-arrival-03-ui`, que contiene el trabajo de las tres tareas. La rama integradora se mantiene como base y seguimiento hasta que se revisen los PR hijos; no corresponde integrar las tres ramas localmente antes de esa revisión.

La publicación de los PR hijos y su mezcla en la rama integradora requieren una decisión y autorización separadas. Antes de abrir los PR de B o C, queda decidir entre `size:exception` y resegmentar. Para C, separar la captura de la edición y eliminación requeriría rehacer el comportamiento intermedio. La aplicación de la migración de base de datos y el despliegue también requieren una decisión y autorización separadas.

## Registro de commits y entrega

- Tarea A: `8b730a0` (`style(efa): compact expanded forms and map mobile arrivals`), rama hija `codex/efa-mobile-arrival-01-compact`, base `codex/efa-mobile-arrival-integrator`.
- Primer segmento de revisión: `8b730a0`, 136 líneas de autoría. Los segmentos B y C siguen pendientes.
- Tarea B: `b763a66` (`feat(efa): persist mobile role arrival snapshots`), rama hija `codex/efa-mobile-arrival-02-service`, base `codex/efa-mobile-arrival-01-compact`.
- Segundo segmento de revisión: `b763a66`, 1400 líneas de autoría más un snapshot Drizzle generado de 6084 líneas. Una división coherente cercana a 400 líneas no separa este servicio, su esquema y sus pruebas sin perder un comportamiento revisable; cualquier PR de este segmento requiere una decisión explícita `size:exception` antes de abrirlo.
- Tarea C: `e9ea092` (`feat(efa): capture mobile role arrivals in guard`), rama hija `codex/efa-mobile-arrival-03-ui`, basada en la rama de B `codex/efa-mobile-arrival-02-service`.
- Tercer segmento de revisión: `e9ea092`, 616 líneas de autoría. Separar la captura de la edición y eliminación exigiría rehacer el comportamiento intermedio; no se abrió un PR. Al momento de preparar PR queda pendiente decidir entre `size:exception` y resegmentar este trabajo.
- Estrategia de cadena: `feature-branch-chain`, elegida por el usuario. Rama integradora `codex/efa-mobile-arrival-integrator`; ramas hijas previstas `codex/efa-mobile-arrival-01-compact`, `codex/efa-mobile-arrival-02-service` y `codex/efa-mobile-arrival-03-ui`. No se crearán PR ni se publicarán ramas en esta etapa.
