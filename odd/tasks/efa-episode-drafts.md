# Borradores de episodios EFA

## Objetivo y motivación

Permitir que una persona EFA registre episodios de atención propios desde su guardia, continúe completándolos después de terminarla y recupere el historial persistido. La guardia, selección de bases, cuentas y catálogo ya están implementados; la persona usuaria confirmó manualmente inicio de guardia y selección de bases el 06-10-2026. Esta confirmación no es una comprobación independiente contra Neon.

## Alcance autorizado

- Reutilizar el alcance acordado en `docs/efa-mvp-scope-and-plan.md`; no reabrir decisiones de producto.
- Episodios inicialmente en borrador, con ID inmutable, autor, guardia de origen, hora del hecho separada de creación, motivo, dirección exacta privada y número de intervención opcionales.
- Crear únicamente desde una guardia propia abierta y con permiso EFA actual. Completar episodios existentes después del cierre de guardia sin cambiar su autoría.
- Lectura de registros propios para cuentas activas incluso tras revocar EFA; administración puede leer y corregir todos. Editar requiere permiso EFA actual, incluido administración.
- Versiones optimistas e historial inmutable antes/después; las correcciones administrativas a datos ajenos generan un aviso al autor original en la misma transacción.
- Identificadores estables de operación evitan duplicados por reintentos. No se presenta una escritura como guardada antes de confirmación del servidor.
- Los recibos de operación vinculan identidad y huella canónica normalizada sin copiar la dirección privada; permiten reintentos exactos de escrituras mutables y no mutables.
- No finalizar, anular ni reabrir episodios todavía: esas transiciones dependen del modelo posterior de comunicaciones y despachos.
- Sin flota física, patentes, planificación nominal de enfermería, reportes ni cambios en formularios públicos.
- Sin inspeccionar `.env`, secretos, conectar Neon, ejecutar migraciones reales, publicar ni abrir PR.

## Persistencia y entrega

- Rama: `codex/efa-episode-drafts`, apilada sobre `feat/efa-guard-lifecycle`; punto inicial `80be9cb`.
- Ruta: delegada directa, un escritor por tarea; lectura preparatoria y cambios en múltiples archivos disparan delegación.
- Estimación inicial: 1.000–1.600 líneas propias, generados excluidos. Es una previsión, no un límite ni permiso para comprimir código.
- Estrategia: `ask-on-risk`, con cadena `feature-branch-chain` previamente acordada. Commits por unidad funcional; ninguna publicación autorizada. Evaluar cada segmento con la revisión nativa y pedir consentimiento cuando corresponda.
- Documento de recuperación: este archivo. Espejo Engram `odd/efa-episode-drafts/tasks` pendiente porque falta identidad runtime registrada; no usar sesiones alternativas ni CLI de memoria.

## Tareas

### E1 — Persistencia, permisos y API de episodios borrador

**Ruta:** delegado; esquema, migración, servicios, funciones y pruebas. Estimación: 600–900 líneas propias.
**Estado:** implementación local y checks completados; la migración sigue sin aplicar y no hubo conexión a base real. Corrección técnica incorporada: recibos persistidos por operación serializan reintentos concurrentes y reconocen actualizaciones sin cambios, sin crear versiones/auditoría/avisos artificiales.

- [x] Crear episodio, auditoría, recibos de operación y avisos de corrección administrativos con referencias explícitas y restricciones SQL; migración aditiva `0006_efa_episode_drafts`, journal y snapshot generado.
- [x] Implementar crear/listar/consultar/actualizar borradores, idempotencia de creación y actualización, permisos actuales y actualización optimista con auditoría atómica.
- [x] Mantener lectura propia tras revocación EFA, impedir creación desde guardias ajenas/cerradas y permitir edición autorizada de episodios existentes de guardias cerradas.
- [x] Exponer funciones servidor validadas, sin filtraciones de direcciones ni datos ajenos; persistir avisos para el autor original cuando otro administrador corrige.
- [x] Observar RED y GREEN para permisos, reintentos, conflictos, horas del hecho y captura, auditoría y avisos; completar checks locales sin DB real.

**Aceptación:** estas capacidades quedan disponibles como API, sin afirmar que existe todavía una pantalla de carga o validación PostgreSQL real. Un conflicto no sobrescribe datos ni añade auditoría/avisos falsos.

**Superficies E1:** `src/db/schema.ts`, `src/db/schema.test.ts`, `src/db/seed-efa-bases.migration.test.ts`, `src/lib/efa-episodes.server.ts`, `src/lib/efa-episodes.server.test.ts`, `src/lib/efa-episodes.functions.ts`, `src/lib/efa-episodes.functions.test.ts`, `drizzle/0006_efa_episode_drafts.sql`, `drizzle/meta/0006_snapshot.json`, `drizzle/meta/_journal.json` y este documento. No modificar autenticación compartida ni formularios públicos.

### E2 — Interfaz mobile-first, historial y avisos

**Ruta:** delegado; página privada, panel reutilizable, navegación y endpoints de avisos. Estimación: 500–800 líneas propias; no comprimir para cumplir un umbral.
**Estado:** implementado y registrado en `12fd88854d58d82a4c4f907c787e8c7e1efbf6e2`; revisión nativa aprobada y reconocida. Sin conexión a base real.

- [x] Agregar `/episodios-efa` bajo el panel autenticado, visible a cualquier cuenta activa; enlazarlo desde navegación y el panel de guardia. No exigir EFA para leer el propio historial.
- [x] Crear/editar en español neutral y mobile-first: campo focalizado por paso, fecha/hora local correctamente convertida, motivo, dirección exacta privada e intervención opcionales; mostrar borrador sin estados terminales.
- [x] Ofrecer historial propio a cuenta activa tras revocar EFA y administración de todos; habilitar escritura solo con `canEdit` y creación únicamente desde guardia propia abierta.
- [x] Mostrar historial de auditoría autorizado con valores antes/después, versiones y hora de captura/hecho; distinguir motivo/dirección de fallback temporal.
- [x] Implementar lectura/confirmación idempotente de avisos solo para su destinatario, sin contenido privado ni privilegio administrativo transversal.
- [x] Reintentar con la misma identidad y payload congelado; distinguir resultado aplicado del estado de refresco, preservar borrador en conflicto y exigir carga explícita de versión remota antes de volver a editar. Sin cola offline persistente (E3).
- [x] Agregar helper cliente puro para pruebas de UUID/payload estable, congelamiento, conflicto y conversiones horarias; no agregar dependencias.
- [x] Corregir el baseline del formulario después de una escritura confirmada para que coincida con la versión actual del servidor antes de liberar el reintento; mantener el conflicto sin rebasar silenciosamente.
- [x] Aceptar episodios identificados solo por fecha/hora y serializar doble envío mientras carga el helper cliente para evitar UUID distintos.
- [x] Fijar locale/zona horaria en la primera representación para que SSR e hidratación no dependan de la zona horaria del navegador.

**Aceptación:** lectura/autorización conserva las reglas de E1; formularios no informan éxito hasta confirmar la operación, ni convierten errores de refresco en supuestos errores de escritura. Avisos propios se pueden marcar leídos una vez o reintentarse con seguridad. Navegar fuera puede perder cambios pendientes en memoria, comunicado explícitamente; no se reclama almacenamiento offline.

**Superficies E2:** `src/components/EfaEpisodePanel.tsx`, `src/components/EfaEpisodePanel.test.tsx`, `src/routes/episodios-efa.tsx`, `src/routes/panel.tsx`, `src/components/EfaGuardPanel.tsx`, `src/components/EfaGuardPanel.test.tsx`, `src/lib/efa-episodes.functions.ts`, `src/lib/efa-episodes.functions.test.ts`, `src/lib/efa-episodes.server.ts`, `src/lib/efa-episodes.server.test.ts`, `src/lib/efa-episodes.client.ts`, `src/lib/efa-episodes.client.test.ts`, `src/routeTree.gen.ts` y este documento. No modificar persistencia o migraciones, autenticación común, ni formularios públicos.

- [x] Listar episodios propios y ofrecer lectura administrativa autorizada; mostrar identificación por motivo/dirección o fecha cuando faltan ambos.
- [x] Crear desde la guardia propia abierta, editar datos de borrador y consultar historial con pocas decisiones por pantalla.
- [x] Mostrar guardado pendiente/confirmado/error y conflictos sin sobrescritura silenciosa; bloquear edición tras revocar EFA sin perder lectura del historial.
- [x] Mostrar avisos de corrección administrativa y permitir al destinatario marcar lectura.
- [x] Probar controles y visibilidad con los runners existentes, sin nuevas dependencias.

#### E2 — Evidencia observada

- RED observado antes de las cuatro correcciones: 4 pruebas fallaron para baseline confirmado, formulario solo temporal, doble envío con helper diferido y formato con zona fija. GREEN focal: `npm.cmd run test -- src/lib/efa-episodes.server.test.ts src/lib/efa-episodes.functions.test.ts src/lib/efa-episodes.client.test.ts src/components/EfaEpisodePanel.test.tsx src/components/EfaGuardPanel.test.tsx` pasó 25/25; el test del panel además verifica que helper diferido solo crea un UUID y una escritura.
- `npm.cmd run test`: 17 archivos, 86/86 pruebas; `npm.cmd run typecheck`: aprobado.
- `npm.cmd run build`: aprobado después de las correcciones y generó la ruta `/episodios-efa` en `src/routeTree.gen.ts`. Se mantienen advertencias existentes de `vite-tsconfig-paths` y `inputValidator()` de otros módulos.
- ESLint focalizado de los 12 archivos TypeScript E2: aprobado sin errores ni advertencias; Prettier check del documento y archivos soportados: aprobado; `git diff --check` de superficies E2, incluida la ruta generada: aprobado.
- No hubo prueba de navegador ni uso de PostgreSQL/Neon. La autorización servidor/fake, serialización de recibos y restricciones de destinatario sí tienen pruebas deterministas, pero la experiencia real con sesiones vigentes y timestamps del servidor requiere integración posterior.
- El volumen propio observado supera la previsión inicial y ronda 1.200 líneas (sin contar `src/routeTree.gen.ts` generado). Incluye el panel con estados explícitos de reintento/conflicto, historial/avisos, endpoints autorizados y regresiones; no se acortó por el umbral orientativo.
- Verificación independiente posterior identificó cuatro defectos del panel: baseline que podía quedar viejo tras confirmar/actualizar, validación UI que exigía motivo o dirección, doble envío antes de resolver la importación dinámica y formato de fecha dependiente de timezone SSR/navegador. Corrección autorizada en el mismo alcance E2; agregar RED/GREEN con helpers compartidos consumidos por producción, no solo pruebas SSR.
- Verificador independiente posterior: las cuatro correcciones resueltas en las rutas reales del panel; 25/25 pruebas focales, typecheck y diff check aprobados. El padre repitió pruebas de panel/helper con 9/9 aprobadas. No se ejecutaron handlers completos en navegador ni hidratación real.
- Rollback limitado a las superficies E2; no modificar migración E1. Validación de la migración y persistencia offline permanecen fuera de E2.

#### E2 — Commit y revisión cerrada

- Commits del segmento: `01b0f69` (prueba de auditoría E1-A1) y `12fd88854d58d82a4c4f907c787e8c7e1efbf6e2` (E2). E1-A1 pasó verificación independiente 9/9 y evaluación `medium`, `under_budget`; se incorporó al siguiente segmento desde `645d181`. E2 registró 1.336 adiciones/eliminaciones, 21 generadas; el segmento completo incluye 1.400 líneas en 14 archivos. Entrega futura `feature-branch-chain`; sin publicación ni PR.
- Con consentimiento explícito, la revisión `review-27ac9978f6dd86df` evaluó confiabilidad sobre el candidato `sha256:f4a6834e79e4632db812631f37bb3b8085ec7fdd1adff9722b2bbf20e8205051`, riesgo `medium`, motivo `slice_budget_reached`.
- Resultado aprobado con dos observaciones informativas. El reconocimiento exacto devolvió `gentle-ai.review-acknowledged/v1`, acción `acknowledged`, autoridad `burned`. El límite revisado avanza a `12fd88854d58d82a4c4f907c787e8c7e1efbf6e2`; no reabrir este candidato por observaciones no bloqueantes. No hubo validación de navegador, PostgreSQL ni autorización de publicación.

#### E2-A — Seguimientos no bloqueantes, pendientes

- [ ] R3-001, `src/lib/efa-episodes.client.ts:109`: distinguir rechazos definitivos (por ejemplo, guardia cerrada antes de crear) de una respuesta incierta, y permitir recuperar el formulario conservando lo ingresado sin quedar limitado al mismo reintento. Registrar como trabajo posterior separado; no hubo transición de corrección nativa.
- [ ] R3-002, `src/lib/efa-episodes.client.ts:79`: conservar segundos/milisegundos de la hora original al editar otro campo, o mantener esa precisión en el control. La conversión actual a minutos puede alterar inadvertidamente la hora del hecho. Agregar regresión de edición con timestamp no alineado al minuto.

### E3 — Continuidad temporal del navegador

**Ruta:** delegado; cola local por cuenta y operaciones idempotentes. Estimación: 100–300 líneas propias. Derivar superficies exactas antes de delegar.

- [ ] Conservar operaciones pendientes temporalmente por usuario, sin mezclarlas entre cuentas ni presentarlas como confirmadas en DB.
- [ ] Reintentar con la misma identidad de operación al recuperar conexión, sin bucles para errores de permisos.
- [ ] Permitir resolución manual si servidor y borrador divergen; documentar límites de almacenamiento local y privacidad.
- [ ] Probar pérdida de respuesta, duplicados, conflictos y cambio de cuenta de forma determinista.

## Comprobaciones

- TDD aplicable a comportamientos deterministas: RED observado antes del cambio, GREEN después.
- Por tarea: pruebas focales y suite, `npm run typecheck`, `npm run build`, formato solo en superficies autorizadas y `git diff --check`.
- E1: `npm run db:generate -- --name=efa_episode_drafts` y una generación adicional offline convergente; inspeccionar SQL, FKs y triggers de auditoría. No ejecutar `db:migrate`.
- Pruebas fake y estructurales no acreditan atomicidad, constraints, locks ni timestamps reales en PostgreSQL.
- Mantener intactos los cambios ajenos y las eliminaciones staged intencionales de scripts bootstrap.

### E1 — Evidencia observada

- RED de regresión: `npm.cmd run test -- src/lib/efa-episodes.server.test.ts` falló 7 de 9 pruebas antes de recibos y locks; GREEN posterior: `npm.cmd run test -- src/db/schema.test.ts src/db/seed-efa-bases.migration.test.ts src/lib/efa-episodes.server.test.ts src/lib/efa-episodes.functions.test.ts` pasó 25/25.
- `npm.cmd run test`: 15 archivos, 73/73 pruebas; `npm.cmd run typecheck`: aprobado; `npm.cmd run build`: aprobado con advertencias existentes de `vite-tsconfig-paths` y `inputValidator()` de otros módulos.
- `npm.cmd run db:generate -- --name=efa_episode_drafts`, dos ejecuciones offline posteriores: ambas sin cambios de esquema. Snapshot/journal convergen en idx 6; SQL conserva trigger append-only y crea la unicidad compuesta de guardia antes de sus FKs.
- ESLint focalizado de los siete archivos TypeScript cambiados, Prettier check de las superficies soportadas y `git diff --check` más escaneo de espacios finales: aprobados.
- No se inspeccionaron credenciales ni se aplicó SQL. La prueba fake modela serialización y reintentos; no demuestra comportamiento real de PostgreSQL/Neon.
- Pendiente al cierre de E1: validación PostgreSQL/Neon de la migración, no autorizada en esta sesión. Los errores de lint/formato identificados en un chequeo anterior quedaron re-verificados después de normalizar.

### E1 — Commit y revisión

- Commit local: `67732cba2b8b41859db1cb288d6a497c85394791`. Verificador independiente: 25/25 pruebas focales y typecheck aprobados; el padre repitió las pruebas del servicio con 9/9 aprobadas.
- Volumen observado: 1.343 líneas propias en código, pruebas y documento; SQL 91 líneas (generación y ajustes manuales), snapshot generado 1.550 y journal 7. El segmento nativo incluye 2.991 adiciones/eliminaciones en 11 archivos. El crecimiento conserva recibos, permisos, pruebas e invariantes de auditoría en una unidad; no se recortó contenido para cumplir una cifra. La entrega futura mantiene `feature-branch-chain`; no se creó ni publicó un PR.
- Evaluación: riesgo `medium`, `review_due: true`, motivo `slice_budget_reached`. Tras consentimiento explícito, la línea `review-97270d1d93afa128` revisó el candidato `sha256:9da99511a9ab5f7eb9a75b89f91bd05ae985a0d7b747e8d80c8bc618ac200c1f` con `review-reliability`.
- Resultado: aprobado, con un seguimiento no bloqueante. El reconocimiento exacto devolvió `gentle-ai.review-acknowledged/v1`, acción `acknowledged`, autoridad `burned`. La transacción quedó cerrada y el límite revisado avanza a `67732cba2b8b41859db1cb288d6a497c85394791`; no reabrir esta revisión por su advisory. La aprobación no acredita PostgreSQL ni autoriza publicación.

### E1-A1 — Seguimiento de pruebas, no bloqueante

- **Estado:** pruebas y evidencia completadas; solo se modificaron el fake/pruebas y este documento.
- [x] Corregir el fake de `src/lib/efa-episodes.server.test.ts` para devolver registros separados del objeto almacenado y comprobar versiones/estados completos antes y después de actualizaciones propias y administrativas. Advisory `R3-001`: el fake compartía referencias mutables, lo que elevaba `versionBefore` antes de guardar la auditoría. Se corrigió el fake; no se requirió cambio productivo.
- RED observado: `npm.cmd run test -- src/lib/efa-episodes.server.test.ts` falló 2/9 casos nuevos: ambos recibieron `versionBefore: 2` donde correspondía `1`.
- GREEN y checks: focused server tests 9/9; `npm.cmd run test` 15 archivos/73 pruebas; `npm.cmd run typecheck`; Prettier check de los dos archivos; `git diff --check`. Todo aprobado.
- Runtime harness: N/A, es un cambio de test fake/documentación, sin nueva frontera de ejecución. Rollback: revertir únicamente este test y su evidencia; el servicio productivo no cambió. Commit local informado por el padre: `01b0f69`.

## Estado y siguiente paso

E1 y E1-A1 quedaron implementadas; E1-A1 refuerza las aserciones del fake sin modificar el servicio. E2 implementa la interfaz privada y avisos, registrada y con revisión aprobada/cerrada. Siguen pendientes E2-A (dos seguimientos informativos), la aplicación/verificación real de la migración y E3 (cola local). Próximo paso recomendado: corregir recuperación de rechazos y precisión horaria antes de la prueba manual en navegador. Comunicaciones, conductas observables, despachos y coordinación policial continúan conforme al alcance acordado. El espejo Engram permanece pendiente por falta de identidad runtime registrada; no usar otra identidad ni invocar herramientas de memoria.
