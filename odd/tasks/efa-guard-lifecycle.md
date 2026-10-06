# Catálogo de bases y ciclo de guardia EFA

## Objetivo

Habilitar primero un catálogo institucional administrado de bases y, en una unidad posterior, el ciclo manual de guardia EFA asociado temporalmente a una o varias bases. La cuenta autenticada conserva autoría real; la selección de bases compartida no concede acceso a guardias ni registros ajenos.

## Problema y motivación

El alcance funcional aceptado establece que las personas con acceso EFA inician y terminan guardias manualmente, declaran presencia en la Central y pueden seguir varias bases a la vez. No existe todavía entidad, catálogo ni flujo de guardias. Se requiere un catálogo de nombres estables antes de crear asociaciones temporales; no se deben asumir ni sembrar nombres de bases.

## Alcance y restricciones

- Catálogo de bases institucionales con administración restringida a administración; usuarios EFA solo consultan las bases activas.
- Guardias EFA manuales y múltiples vínculos temporales a bases: se implementarán en B2, no en B1.
- La administración incluye implícitamente EFA según el modelo de permisos existente.
- Conservar historial mediante desactivación/cierre y eventos auditables; no borrar entidades históricas.
- Revalidar sesión/estado/rol en cada función de servidor; la protección de rutas o controles visuales no constituye autorización.
- Mantener sin cambios formularios públicos, despliegues, flujos no relacionados, datos de personas observadas y planificación de móviles.
- Migraciones aditivas generadas y revisadas localmente. No conexión, migración ni prueba contra Neon/PostgreSQL real, ni inspección de secretos o `.env`.
- El usuario informa que las migraciones anteriores ya están aplicadas, sin verificación independiente. Las migraciones nuevas deberán aplicarse manualmente tras autorización específica.
- Espejo Engram `odd/efa-guard-lifecycle/tasks`: **pendiente**, al no estar disponible una identidad runtime registrada/autorizada. No usar CLI ni registrar sesión alternativa.

## Ruta y entrega

- Ruta: delegada directa, un escritor a la vez. La lectura preparatoria y la implementación abarcan esquema/migración, servicios/funciones, interfaz y pruebas en múltiples archivos.
- Estimación del alcance completo: aproximadamente 800–1.400 líneas de autoría. Es una proyección para planificar, no un límite ni una aceptación; no hacer code golf.
- Estrategia: `ask-on-risk`, con estrategia de cadena previamente aceptada `feature-branch-chain`; sin PR ni push autorizados.
- Rama apilada: `feat/efa-guard-lifecycle`; base/punto de rama `ef055a581d91b0928864da88fdf140f1021fbe9d` (trabajo anterior revisado, no reabrir su revisión).
- B1 fue el alcance del primer work unit. B2 se implementó en `c72a12f`, se corrigió en `b96aecb` y su revisión nativa quedó aprobada y reconocida. B3 y B4 completan las correcciones posteriores y el comando de aplicación de migraciones.

## Tareas

### B1 — Catálogo institucional de bases

**Estado:** implementación y comprobaciones locales completadas en `7ce38401e2da7db8d57ab0e2b73172c1bbe9bc42` — `feat(efa): add audited institutional base catalog`. La revisión nativa quedó aprobada y reconocida para la línea `review-00819d4bd8cf2e4e`; dejó un único advisory no bloqueante, `R3-001`, sobre la UI de versiones obsoletas del catálogo.

- [x] Crear modelo y migración aditiva para bases con ID estable, nombre normalizable, estado activo/inactivo, versión y auditoría/historial de cambios con actor autenticado y hora de base de datos.
- [x] Implementar list/create/rename/activate/deactivate para administración y listado de bases activas para EFA. Los servicios revalidan acceso y roles actuales, además de la guardia de cada función servidor.
- [x] Añadir una sección clara de catálogo en `/admin-usuarios`; permitir crear, corregir nombre y activar/desactivar sin borrado físico. Al cierre de B1 el catálogo quedaba vacío; la decisión posterior de sembrar las etiquetas operativas de Móvil fue aceptada el 06-10-2026 y se implementa en B5.
- [x] Rechazar nombres vacíos, nombres fuera de longitud admitida y duplicados tras normalización; exigir versión esperada en cambios para evitar sobreescritura obsoleta.
- [x] Probar autorización admin/EFA, duplicado normalizado, conflicto de versión, historial de desactivación y visibilidad solo de bases activas. Las pruebas fake no acreditan transacciones/locks PostgreSQL.
- [x] Ejecutar pruebas, typecheck, build, generación de migración dos veces convergente, revisión del SQL generado, formato y `git diff --check` acotados; no acceder a una DB real.

**TDD observado:** la primera ejecución focal antes del código reportó las nuevas suites sin encontrar los módulos de servicio/funciones y un fallo de schema por exports ausentes (el resto de las pruebas existentes de schema pasó). Tras implementar los caminos, `npm.cmd run test -- src/db/schema.test.ts src/lib/efa-bases.server.test.ts src/lib/efa-bases.functions.test.ts` pasó 17/17. Se añadió una prueba de límite Unicode para la clave normalizada: RED con 9 aprobadas/1 fallida (normalización en minúsculas podía exceder la columna de 120 caracteres); después del control explícito, GREEN con 10/10.

**Implementación y migración:** `src/db/schema.ts` añade `efa_base` y `efa_base_audit`; `drizzle/0003_past_clint_barton.sql` es aditiva, define constraints/FKs, y agrega trigger PostgreSQL append-only para eventos. El modelo versiona cambios optimistas, atribuye creador/actor y mantiene el nombre normalizado único. El servicio usa acceso actual de cuenta/grants en cada transacción, administración para mutaciones y EFA efectivo (incluida administración implícita) para listar solo bases activas; no elimina bases. `/admin-usuarios` ahora carga una sección que permite crear, renombrar, desactivar y reactivar. No se prueba SQL contra PostgreSQL, ni trigger, transacciones o unicidad concurrente en una DB real.

**Comprobaciones finales después de normalización:** `npm.cmd run test` (9 archivos, 39 pruebas, exit 0); `npm.cmd run typecheck` (exit 0); `npm.cmd run build` (exit 0; solo los avisos ya existentes de `inputValidator()` y `vite-tsconfig-paths`); `npm.cmd run db:generate` dos veces (ambas exit 0 y `No schema changes, nothing to migrate`); Prettier check de superficies cambiadas (exit 0); `git diff --check` acotado (exit 0). El build incorporó las funciones y el servicio nuevos a artefactos SSR; no se hizo E2E/navegador con credenciales.

**Límites:** no se conectó a Neon/PostgreSQL, no se aplicó migración, no se inspeccionaron archivos/valores de entorno y no se realizaron escrituras reales. El informe del usuario de migraciones previas aplicadas no se verificó. No se implementó inicio/cierre de guardias ni vínculos temporales (B2).

### B2 — Inicio/cierre de guardia y asociaciones temporales a bases

**Estado:** commits locales `c72a12f` — `feat(efa): add manual guard lifecycle` y `b96aecb` — corrección del orden serializado de eventos de base. Revisión nativa del candidato corregido aprobada y reconocida; autoridad consumida. La migración sigue sin aplicarse.

- [x] Permitir a personas con EFA efectivo iniciar y terminar guardias manualmente; pedir declaración explícita de presencia en Central sin usar GPS.
- [x] Asociar una o varias bases activas por intervalos derivados de eventos append-only; registrar actor autenticado y hora de base de datos para cada alta/baja durante una guardia.
- [x] Conservar autoría y limitar EFA a sus guardias; administración puede consultar todas y corregir la hora de cierre con historial versionado. El catálogo compartido no concede acceso a registros ajenos.
- [x] No cerrar guardias automáticamente. Las guardias terminadas permanecen disponibles; el flujo de registros posteriores al fin de guardia no está implementado en este work unit y no queda bloqueado por este modelo.
- [x] Probar permisos, conflictos de versión, asociaciones temporales y relaciones con fake store; mantener pendiente la demostración real de garantías PostgreSQL y cookies hasta contar con entorno autorizado.

**Implementación:** `efa_guard` conserva propietario, horas de inicio/cierre manuales, declaración de Central y versión; una restricción parcial impide dos guardias abiertas simultáneas por cuenta. `efa_guard_base_event` es un registro inmutable `added`/`removed` con guardia, base, actor, hora y secuencia asociada a la versión serializada de la guardia. El conjunto vigente se reproduce por esa secuencia, no por timestamps, evitando que una transacción iniciada antes pero confirmada después desordene altas/bajas. `efa_guard_audit` registra inicio, cierre y corrección de cierre con estado antes/después y versión, con triggers que impiden actualizar o borrar el historial. Cada función servidor y servicio vuelve a comprobar acceso/rol actual. El flujo UI mobile-first está en `/guardia-efa`; no modifica formularios públicos ni conecta/aplica la migración.

**TDD observado:** `npm.cmd run test -- src/db/schema.test.ts src/lib/efa-guards.server.test.ts src/lib/efa-guards.functions.test.ts` primero falló por los modelos y módulos nuevos ausentes (6/6 pruebas de schema existentes pasaron; el test nuevo de schema falló y ambas suites nuevas no encontraron sus módulos). Tras implementar esquema/servicios/funciones/UI, GREEN: 3 archivos focales, 14/14 pruebas. Para R3-001, la regresión determinista de replay fuera del orden temporal falló antes de corregir la secuencia y pasó después; el test focal del servicio del padre confirmó 7/7.

**Comprobaciones finales:** `npm.cmd run test` (49/49 pruebas, exit 0); `npm.cmd run typecheck` (exit 0); `npm.cmd run build` (exit 0); `npm.cmd run db:generate` dos veces, offline y convergentes; checks de Prettier y `git diff --check` (exit 0). El padre repitió las pruebas focales del servicio: 7/7. La migración no se probó contra PostgreSQL/Neon.

**Límites:** no se conectó a Neon/PostgreSQL, no se aplicó migración ni se probaron triggers/transacciones/índice parcial en una base real. El fake store verifica la orquestación del servicio, no garantías del motor. No se agregaron flujos de observaciones/episodios; estos podrán referenciar guardias ya terminadas conforme a su unidad funcional.

## Verificación y límites globales

- Aplicar TDD: observar pruebas RED reproducibles antes de comportamiento nuevo, y confirmar GREEN después.
- No declarar comportamiento atómico, bloqueos, restricciones SQL ni seguridad de cookies probados en PostgreSQL sin una ejecución autorizada real.
- No hacer commit, stage, publicación, despliegue ni revisión nativa desde la ejecución del escritor; el padre coordina cierres por work unit.

## Progreso y siguiente paso

- B1 quedó en un commit local de 12 archivos y 1.699 líneas cambiadas (incluido snapshot generado). El spot-check del padre repitió `npm.cmd run test`: 9 archivos y 39 pruebas, exit 0. El usuario confirmó que los dos scripts de bootstrap se conservan localmente pero se dejan intencionalmente sin seguimiento; las eliminaciones staged y las reglas correspondientes de `.gitignore` son deliberadas y deben preservarse.
- La evaluación nativa dio riesgo `medium`, `review_due: true`, motivo `slice_budget_reached`. La revisión de B1 quedó aprobada y reconocida en la línea `review-00819d4bd8cf2e4e`, con un advisory no bloqueante: `R3-001`, sobre la UI de versiones obsoletas del catálogo. El límite revisado de B1 avanzó a `7ce38401e2da7db8d57ab0e2b73172c1bbe9bc42`.
- B2 quedó en `c72a12f` — `feat(efa): add manual guard lifecycle`, con la corrección de R3-001 en `b96aecb`. RED/GREEN se observó para la regresión de replay fuera de orden; el cierre pasó 49/49 pruebas, typecheck, build y dos generaciones offline convergentes. El spot-check del padre de pruebas focales de servicio dio 7/7.
- La línea `review-74fbd291620ce690` quedó detenida en `captured_artifacts_unverifiable`; no se reusó para el candidato corregido. La revisión nueva `review-ae8374d4949e7d2f` cubrió el target `sha256:ef85d0eec3876ccfba72f5f2bd316df0b13548924e8f839d669c6ef002abde2b` y terminó aprobada y reconocida; la autoridad se consumió y el límite revisado de B2 avanzó a `b96aecb`.
- La revisión posterior dejó dos observaciones no bloqueantes que luego se corrigieron en B3: `R3-001`, selección inicial de bases existentes en `EfaGuardPanel`; `R3-002`, rechazo de correcciones administrativas de hora final para guardias abiertas, preservando estado y auditoría. Queda pendiente verificar la migración en PostgreSQL/Neon real; no se usó DB. El espejo Engram también queda pendiente por identidad runtime no registrada.

### B3 — Corregir selección inicial y hora de cierre administrativa

**Ruta:** escritor único delegado; dos correcciones delimitadas en UI/servicio con regresiones focales. Se extiende `vitest.config.ts` para que el runner normal incluya la prueba SSR `.test.tsx` y resuelva el alias `@`. Estimación: aproximadamente 120 líneas propias (adiciones y eliminaciones), excluyendo artefactos generados.

**Aceptación:** al cargar una guardia propia abierta, todas sus bases existentes aparecen seleccionadas; la selección de una guardia ajena no se inicializa aunque administración pueda verla. Guardar conserva la selección existente salvo cambios elegidos explícitamente. Administración no puede corregir hora final en una guardia abierta: el servicio rechaza antes de mutar versión, guardia o auditoría; correcciones para guardias terminadas siguen funcionando.

- [x] Observar RED para selección existente en componente con render SSR/atributos de checkbox; ampliar la configuración Vitest para ejecutar el `.test.tsx` con el runner normal, sin incorporar dependencias.
- [x] Observar RED del servicio al intentar corregir el cierre de una guardia abierta y confirmar que el caso de guardia terminada sigue siendo válido.
- [x] Implementar cambios mínimos y confirmar GREEN focal.
- [x] Ejecutar test, typecheck, build, Prettier y `git diff --check`; no conectar una base.

**Resultado observado:** la regresión SSR primero falló porque no seleccionaba ninguna base; el servicio primero aceptó la corrección de una guardia abierta. Tras corregir ambos, las pruebas focales quedaron en 9/9.

**Commit y comprobación del padre:** `e3e16bc` — `fix(efa): preserve base selection and require an existing closure`. El padre repitió las pruebas focales: 2 archivos, 9/9, exit 0. Evaluación nativa: `medium`, `review_due: false`, `under_budget`; la revisión del segmento queda diferida, sin atribuir aprobación nueva a este commit.

### B4 — Añadir un comando explícito para aplicar migraciones pendientes

**Ruta:** cambio pequeño de configuración y guía operativa. Estimación: aproximadamente 45 líneas propias. No implica ni autoriza ejecutar migraciones contra una base.

**Aceptación:** agregar `npm run db:migrate` con los flags Node `--env-file-if-exists` para `.env` y `.env.local` y la CLI local instalada de Drizzle Kit, sin runner ni dependencia nuevos. Documentar el uso, que aplica SQL pendiente en orden con el journal, que repetirlo omite las migraciones registradas, y la diferencia entre `generate`, `migrate` y `push` (este último no ejecuta el SQL personalizado/trigger de auditoría de los archivos de migración). Aclarar que aplicaciones manuales previas por Neon SQL editor o `push` no garantizan un journal alineado; no inventar baseline ni sugerir borrar la base.

- [x] Confirmar soporte local para `node --env-file-if-exists` y ubicación de CLI sin inspeccionar archivos de entorno ni conectarse.
- [x] Añadir alias npm y documentar uso/semántica y el posible desalineamiento del journal.
- [x] Verificar `drizzle-kit migrate --help` directamente sin cargar entorno real; comprobar configuración/guía de forma estructural.
- [x] Ejecutar test, typecheck, build, Prettier y `git diff --check`; dejar pendiente una ejecución PostgreSQL/Neon autorizada.

**Resultado observado:** Node `v24.13.0` documenta `--env-file-if-exists` en `node --help`; existe la CLI local `node_modules/drizzle-kit/bin.cjs`; su ayuda directa y la comprobación estructural del alias pasaron sin cargar archivos de entorno. `npm.cmd run test` pasó 12 archivos/51 pruebas; `npm.cmd run typecheck` y `npm.cmd run build` pasaron; Prettier y `git diff --check` pasaron. El build emitió avisos existentes de `inputValidator()` y `vite-tsconfig-paths`. No se ejecutó `npm run db:migrate`, no se leyeron archivos de entorno y no se conectó a DB.

**Pendiente:** verificar historial/journal y aplicar migraciones en PostgreSQL/Neon solo después de autorización explícita del destino; espejo Engram pendiente por identidad runtime no registrada.

### B5 — Sembrar opciones institucionales de Móvil en el catálogo EFA

**Aclaración aceptada por la persona usuaria (06-10-2026):** para el MVP, cada opción de “Móvil” es una base operativa seleccionable de EFA. No se requiere catálogo separado de flota/patentes ni asignación de móviles a enfermería; esas relaciones quedan para trabajo futuro. Esta decisión reemplaza la premisa anterior de catálogo sin datos iniciales, sin alterar el historial de B1–B4.

**Ruta:** cambio de datos aditivo y autocontenido en `drizzle/0005_seed_efa_base_catalog.sql`, entrada de journal y prueba estructural. No cambia esquema ni snapshot, y no ejecuta la migración. La migración usa un principal técnico reservado solo como actor FK; no crea credenciales, cuenta de acceso, sesión, grants ni atribución humana. Estimación: hasta 250 líneas propias incluyendo prueba y documentación.

**Aceptación:** cargar exactamente las 14 opciones de `MOBILE_CHOICES` de `src/lib/compensatorio.functions.ts`, verificadas también contra `src/routes/compensatorio.tsx`, incluidos `Móvil Flotante` y `Otro Movil no Nomenclado`. Preservar cada etiqueta literalmente y codificar su `normalized_name` explícito conforme a `normalizeBaseName` (NFKC, trim, espacios colapsados y lowercase estable), sin depender de locale. Insertar como activas versión 1; conflicto de nombre normalizado usa solo `DO NOTHING`, nunca renombra, reactiva ni modifica filas existentes. Solo filas insertadas reciben auditoría `created`, con versión inicial, estado anterior nulo, y posterior `{name, isActive: true}`.

El principal técnico debe usar identidad reservada `.invalid` y colisionar de forma segura: si ya existe cualquier fila con esa identidad o ya tiene credenciales, sesión, `account_access` o grants, la migración aborta en vez de repurposar una persona. No se concede acceso de inicio de sesión; el registro público está deshabilitado y la UI de cuentas lista mediante `account_access`, por lo que este actor no se presenta ni se habilita como cuenta humana.

- [x] Crear primero una prueba RED que verifique las 14 parejas exactas contra ambos catálogos, migración inexistente/journal, no privilegios, guards del actor, `ON CONFLICT DO NOTHING` y auditoría solo de filas insertadas.
- [x] Añadir migración SQL DATA-ONLY y entrada monotónica `idx: 5`, con guardas fail-closed y auditoría de las inserciones nuevas.
- [x] Documentar en español la interpretación MVP, opciones cargadas automáticamente al aplicar migraciones y el alcance futuro excluido.
- [x] Confirmar GREEN y ejecutar checks focales, suite, typecheck, build, `db:generate` offline sin cambios de snapshot/esquema, Prettier y `git diff --check`.

**TDD y comprobaciones observadas:** la suite estructural inicial falló en cuatro expectativas por faltar SQL/journal; la comparación de catálogos pasó. Después de implementar, el comando focal `npm.cmd run test -- src/db/seed-efa-bases.migration.test.ts src/db/schema.test.ts src/lib/efa-bases.server.test.ts` pasó 3 archivos/22 pruebas. `npm.cmd run test` pasó 13 archivos/56 pruebas; `npm.cmd run typecheck` y `npm.cmd run build` pasaron (avisos preexistentes de `inputValidator()` y `vite-tsconfig-paths`); `npm.cmd run db:generate` terminó en `No schema changes, nothing to migrate` y no creó snapshot 0005; `npx.cmd --no-install prettier --write` solo sobre superficies B5 autorizadas y luego Prettier check y `git diff --check` pasaron.

**Cierre local:** commit `38815c849d511e3f930dd0024ece53765f062f5f`. El padre repitió `npm.cmd run test -- src/db/seed-efa-bases.migration.test.ts` (5/5); el verificador independiente repitió el set focal completo (22/22). Verificación independiente `efa_catalog_seed_verify`: `PASS` dentro del alcance estático/de pruebas, sin hallazgos accionables; no equivale a validar PostgreSQL. `db:generate` proyecta el siguiente índice de migración como 6 y conserva el snapshot 4, sin generar snapshot para la migración de datos. El replay manual del SQL falla deliberadamente si ya existe la identidad reservada; el migrador Drizzle omite normalmente una migración anotada en su journal.

**Evaluación nativa:** la evaluación inicial no clasificó el candidato por declaraciones sin seguimiento; tras excluirlas del inventario canónico, la evaluación válida del rango `d9cab4420b83e78e48f383c98384664ab72d113e..38815c849d511e3f930dd0024ece53765f062f5f` fue `medium` / `executable_change`, 11 archivos y 376 líneas, `review_due: false`, motivo `under_budget`. No se inició revisión nativa ni se reclama aprobación.

**Alcance documental:** `docs/efa-access-setup.md` describe la semilla y el actor técnico; en el documento de alcance preexistente sin seguimiento se aclararon únicamente “Guardias EFA y bases” y el pendiente de mapeo (ahora no requerido en MVP; flota/patentes y asignaciones a personal quedan futuras). La guía ya rastreada junto con B5 sí forma parte de las superficies commit-ready; no stagear el documento de alcance sin seguimiento completo.

**Siguiente paso:** aplicar las migraciones con `npm run db:migrate` desde el entorno autorizado para la base elegida y confirmar en la aplicación que las opciones están disponibles para una guardia. El escritor no ejecutó ni verificó ese comando. Pruebas estructurales no validan SQL, transacción ni FK real en PostgreSQL; tampoco se conectó a DB. El espejo Engram sigue pendiente por identidad runtime no registrada.

Después de confirmar B5, el siguiente work unit funcional puede abordar episodios, comunicaciones y el catálogo de conductas observables. El ciclo de guardia quedó implementado en B2/B3; planificación/turnos nominales de enfermería permanecen fuera del MVP acordado.

### B6 — Normalizar la hora de base de datos de guardia

**Problema aceptado:** al iniciar una guardia, el flujo puede fallar al serializar la hora de base de datos. El adaptador SQL puede devolver `now()` como texto ISO en vez de `Date`, aunque el tipo declarado diga `Date`; luego el flujo llama `.toISOString()`.

**Ruta:** corrección pequeña en el adaptador de guardias, con prueba determinista sobre el seam real que usa `databaseNow`. Estimación: aproximadamente 60–100 líneas propias. Sin cambios de interfaz, permisos, esquema ni migraciones.

**Aceptación:** normalizar valores `Date` existentes y cadenas de timestamp válidas a una fecha válida antes de persistir inicio/cierre; rechazar explícitamente resultados ausentes o inválidos con mensaje seguro, sin filtrar detalles de base de datos. Probar ambas formas en el contrato de reloj del servicio; no afirmar conexión PostgreSQL real.

- [x] Observar RED inyectando un timestamp textual realista en el contrato de reloj del servicio.
- [x] Implementar conversión validada y mensaje seguro para valores nulos o inválidos, preservando soporte `Date`.
- [x] Confirmar GREEN focal y ejecutar suite, typecheck, build, formato y `git diff --check`.

**TDD observado:** con el valor raw "2026-10-06T10:00:00.000Z", el inicio primero falló con `startedAt.toISOString is not a function`; valores inválidos/faltantes producían errores JS no seguros. Después de normalizar en el límite de servicio, el set focal `npm.cmd run test -- src/lib/efa-guards.server.test.ts src/lib/efa-guards.functions.test.ts src/components/EfaGuardPanel.test.tsx` pasó 3 archivos/15 pruebas. La suite completa pasó 13 archivos/60 pruebas; `npm.cmd run typecheck` y `npm.cmd run build` pasaron (solo avisos existentes de validadores/dependencia Vite). `npx.cmd --no-install prettier --write/check` y `git diff --check` se confirman en el cierre.

**Límites:** prueba fake/adaptador no acredita el tipo runtime entregado por Neon/PostgreSQL; una verificación real requiere entorno y autorización separados. No leer entorno ni conectar una DB durante B6.

**Cierre local B6:** commit `3cfb110abbe25787ca00a34de9344820e938b27b`; el padre repitió `npm.cmd run test -- src/lib/efa-guards.server.test.ts` con 12/12 aprobadas. Los checks de formato y diff del escritor pasaron. El arreglo no cambia la estructura de datos ni requiere otra migración.

**Revisión del segmento B3–B6:** la evaluación del rango `d9cab4420b83e78e48f383c98384664ab72d113e..3cfb110abbe25787ca00a34de9344820e938b27b` dio riesgo `medium`, 11 archivos y 455 líneas, `review_due: true`, motivo `slice_budget_reached`. Tras consentimiento explícito, la línea `review-b15b23789b2234ae` revisó el candidato inmutable `sha256:557c9d7666752e78050ff7369bad38952cdb62a6247d6f79a48e75fde11ad240` con una revisión consolidada `review-reliability`, sin hallazgos. El reconocimiento exacto devolvió `gentle-ai.review-acknowledged/v1`, acción `acknowledged` y autoridad `burned`; revisión aprobada y cerrada. El límite revisado avanza a `3cfb110abbe25787ca00a34de9344820e938b27b`. La aprobación no acredita ejecución PostgreSQL ni autoriza publicación.

**Siguiente comprobación:** la persona usuaria debe recargar `/guardia-efa` y probar inicio/cierre con su conexión existente. No se ejecutó una migración, no se inspeccionaron secretos y no se conectó a Neon. El espejo Engram permanece pendiente por identidad runtime no registrada.

**Límites:** pruebas estructurales no verifican sintaxis/atomicidad/comportamiento de PostgreSQL ni estado previo del destino. No aplicar migración, conectar DB ni alinear journal de una base real sin autorización explícita.

**Commit y evaluación:** `1dab22d` — `feat(db): add a command to apply pending SQL migrations`. El rango B3/B4 desde `d9cab4420b83e78e48f383c98384664ab72d113e` contiene 116 líneas cambiadas, riesgo nativo `medium`, `review_due: false`, motivo `under_budget`. No se inició una revisión nueva de ese rango ni se ejecutó una migración real; ambas comprobaciones se distinguen del resultado funcional local.

## Archivos relevantes

- `docs/efa-mvp-scope-and-plan.md` — alcance funcional acordado para permisos, guardias y bases.
- `odd/tasks/efa-access-foundation.md` — historial anterior de acceso/autorización; lectura de referencia, sin modificar.
- `src/db/schema.ts` — modelos existentes Better Auth, acceso, grants y auditoría.
- `src/routes/admin-usuarios.tsx` — página privada existente para administración de cuentas.
- `src/lib/efa-guards.server.ts` — servicio de guardias manuales y eventos temporales de bases con autorización revalidada.
- `src/components/EfaGuardPanel.tsx` — interfaz mobile-first para gestión e historial de guardias.
- `src/routes/guardia-efa.tsx` — ruta autenticada del ciclo EFA.
- `drizzle/0004_closed_sleeper.sql` — migración aditiva del ciclo de guardias; no aplicada a una base.
