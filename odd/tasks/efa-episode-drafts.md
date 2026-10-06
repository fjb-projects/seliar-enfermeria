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

**Ruta:** delegado; nueva vista privada y enlaces desde el flujo EFA. Estimación: 300–500 líneas propias. Derivar superficies exactas antes de delegar.

- [ ] Listar episodios propios y ofrecer lectura administrativa autorizada; mostrar identificación por motivo/dirección o fecha cuando faltan ambos.
- [ ] Crear desde la guardia propia abierta, editar datos de borrador y consultar historial con pocas decisiones por pantalla.
- [ ] Mostrar guardado pendiente/confirmado/error y conflictos sin sobrescritura silenciosa; bloquear edición tras revocar EFA sin perder lectura del historial.
- [ ] Mostrar avisos de corrección administrativa y permitir al destinatario marcar lectura.
- [ ] Probar controles y visibilidad con los runners existentes, sin nuevas dependencias si no son necesarias.

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
- Pendiente al cierre de E1: validación PostgreSQL/Neon de la migración, no autorizada en esta sesión, y evaluación nativa a cargo del padre. Los errores de lint/formato identificados en un chequeo anterior quedaron re-verificados después de normalizar.

## Estado y siguiente paso

E1 quedó implementada y verificada localmente; siguen pendientes el commit/evaluación nativa del padre y la aplicación/verificación real de la migración. E2 (interfaz privada) y E3 (cola local) aún no están implementadas. Comunicaciones, conductas observables, despachos y coordinación policial continúan después de este bloque conforme al alcance acordado.
