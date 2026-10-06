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
- B1 fue el alcance del primer work unit. B2 se implementó por separado y permanece como cambio local, pendiente de commit/revisión del padre.

## Tareas

### B1 — Catálogo institucional de bases

**Estado:** implementación y comprobaciones locales completadas en `7ce38401e2da7db8d57ab0e2b73172c1bbe9bc42` — `feat(efa): add audited institutional base catalog`. La revisión nativa quedó aprobada y reconocida para la línea `review-00819d4bd8cf2e4e`; dejó un único advisory no bloqueante, `R3-001`, sobre la UI de versiones obsoletas del catálogo.

- [x] Crear modelo y migración aditiva para bases con ID estable, nombre normalizable, estado activo/inactivo, versión y auditoría/historial de cambios con actor autenticado y hora de base de datos.
- [x] Implementar list/create/rename/activate/deactivate para administración y listado de bases activas para EFA. Los servicios revalidan acceso y roles actuales, además de la guardia de cada función servidor.
- [x] Añadir una sección clara de catálogo en `/admin-usuarios`; permitir crear, corregir nombre y activar/desactivar sin borrado físico. No hay datos sembrados ni supuestos de catálogo.
- [x] Rechazar nombres vacíos, nombres fuera de longitud admitida y duplicados tras normalización; exigir versión esperada en cambios para evitar sobreescritura obsoleta.
- [x] Probar autorización admin/EFA, duplicado normalizado, conflicto de versión, historial de desactivación y visibilidad solo de bases activas. Las pruebas fake no acreditan transacciones/locks PostgreSQL.
- [x] Ejecutar pruebas, typecheck, build, generación de migración dos veces convergente, revisión del SQL generado, formato y `git diff --check` acotados; no acceder a una DB real.

**TDD observado:** la primera ejecución focal antes del código reportó las nuevas suites sin encontrar los módulos de servicio/funciones y un fallo de schema por exports ausentes (el resto de las pruebas existentes de schema pasó). Tras implementar los caminos, `npm.cmd run test -- src/db/schema.test.ts src/lib/efa-bases.server.test.ts src/lib/efa-bases.functions.test.ts` pasó 17/17. Se añadió una prueba de límite Unicode para la clave normalizada: RED con 9 aprobadas/1 fallida (normalización en minúsculas podía exceder la columna de 120 caracteres); después del control explícito, GREEN con 10/10.

**Implementación y migración:** `src/db/schema.ts` añade `efa_base` y `efa_base_audit`; `drizzle/0003_past_clint_barton.sql` es aditiva, define constraints/FKs, y agrega trigger PostgreSQL append-only para eventos. El modelo versiona cambios optimistas, atribuye creador/actor y mantiene el nombre normalizado único. El servicio usa acceso actual de cuenta/grants en cada transacción, administración para mutaciones y EFA efectivo (incluida administración implícita) para listar solo bases activas; no elimina bases. `/admin-usuarios` ahora carga una sección que permite crear, renombrar, desactivar y reactivar. No se prueba SQL contra PostgreSQL, ni trigger, transacciones o unicidad concurrente en una DB real.

**Comprobaciones finales después de normalización:** `npm.cmd run test` (9 archivos, 39 pruebas, exit 0); `npm.cmd run typecheck` (exit 0); `npm.cmd run build` (exit 0; solo los avisos ya existentes de `inputValidator()` y `vite-tsconfig-paths`); `npm.cmd run db:generate` dos veces (ambas exit 0 y `No schema changes, nothing to migrate`); Prettier check de superficies cambiadas (exit 0); `git diff --check` acotado (exit 0). El build incorporó las funciones y el servicio nuevos a artefactos SSR; no se hizo E2E/navegador con credenciales.

**Límites:** no se conectó a Neon/PostgreSQL, no se aplicó migración, no se inspeccionaron archivos/valores de entorno y no se realizaron escrituras reales. El informe del usuario de migraciones previas aplicadas no se verificó. No se implementó inicio/cierre de guardias ni vínculos temporales (B2).

### B2 — Inicio/cierre de guardia y asociaciones temporales a bases

**Estado:** implementación y verificaciones locales completadas en el árbol de trabajo; pendiente de commit/revisión del padre.

- [x] Permitir a personas con EFA efectivo iniciar y terminar guardias manualmente; pedir declaración explícita de presencia en Central sin usar GPS.
- [x] Asociar una o varias bases activas por intervalos derivados de eventos append-only; registrar actor autenticado y hora de base de datos para cada alta/baja durante una guardia.
- [x] Conservar autoría y limitar EFA a sus guardias; administración puede consultar todas y corregir la hora de cierre con historial versionado. El catálogo compartido no concede acceso a registros ajenos.
- [x] No cerrar guardias automáticamente. Las guardias terminadas permanecen disponibles; el flujo de registros posteriores al fin de guardia no está implementado en este work unit y no queda bloqueado por este modelo.
- [x] Probar permisos, conflictos de versión, asociaciones temporales y relaciones con fake store; mantener pendiente la demostración real de garantías PostgreSQL y cookies hasta contar con entorno autorizado.

**Implementación:** `efa_guard` conserva propietario, horas de inicio/cierre manuales, declaración de Central y versión; una restricción parcial impide dos guardias abiertas simultáneas por cuenta. `efa_guard_base_event` es un registro inmutable `added`/`removed` con guardia, base, actor y hora; el conjunto vigente se deriva de esa secuencia. `efa_guard_audit` registra inicio, cierre y corrección de cierre con estado antes/después y versión, con triggers que impiden actualizar o borrar el historial. Cada función servidor y servicio vuelve a comprobar acceso/rol actual. El flujo UI mobile-first está en `/guardia-efa`; no modifica formularios públicos ni conecta/aplica la migración.

**TDD observado:** `npm.cmd run test -- src/db/schema.test.ts src/lib/efa-guards.server.test.ts src/lib/efa-guards.functions.test.ts` primero falló por los modelos y módulos nuevos ausentes (6/6 pruebas de schema existentes pasaron; el test nuevo de schema falló y ambas suites nuevas no encontraron sus módulos). Tras implementar esquema/servicios/funciones/UI, GREEN: 3 archivos focales, 14/14 pruebas.

**Comprobaciones finales:** `npm.cmd run test` (11 archivos, 47 pruebas, exit 0); `npm.cmd run typecheck` (exit 0); `npm.cmd run build` (exit 0; solo avisos existentes de `inputValidator()` y `vite-tsconfig-paths`); `npm.cmd run db:generate` dos veces (ambas sin cambios de esquema); `npm.cmd exec prettier -- --check` en todos los archivos fuente/documentación modificados (exit 0); `git diff --check` (exit 0).

**Límites:** no se conectó a Neon/PostgreSQL, no se aplicó migración ni se probaron triggers/transacciones/índice parcial en una base real. El fake store verifica la orquestación del servicio, no garantías del motor. No se agregaron flujos de observaciones/episodios; estos podrán referenciar guardias ya terminadas conforme a su unidad funcional.

## Verificación y límites globales

- Aplicar TDD: observar pruebas RED reproducibles antes de comportamiento nuevo, y confirmar GREEN después.
- No declarar comportamiento atómico, bloqueos, restricciones SQL ni seguridad de cookies probados en PostgreSQL sin una ejecución autorizada real.
- No hacer commit, stage, publicación, despliegue ni revisión nativa desde la ejecución del escritor; el padre coordina cierres por work unit.

## Progreso y siguiente paso

- B1 quedó en un commit local de 12 archivos y 1.699 líneas cambiadas (incluido snapshot generado). El spot-check del padre repitió `npm.cmd run test`: 9 archivos y 39 pruebas, exit 0. El usuario confirmó que los dos scripts de bootstrap se conservan localmente pero se dejan intencionalmente sin seguimiento; las eliminaciones staged y las reglas correspondientes de `.gitignore` son deliberadas y deben preservarse.
- La evaluación nativa dio riesgo `medium`, `review_due: true`, motivo `slice_budget_reached`. La revisión de B1 quedó aprobada y reconocida en la línea `review-00819d4bd8cf2e4e`, con un advisory no bloqueante: `R3-001`, sobre la UI de versiones obsoletas del catálogo. El límite revisado permanece en `ef055a581d91b0928864da88fdf140f1021fbe9d`.
- La implementación B2 está completa en el árbol de trabajo: pasaron 47/47 pruebas, typecheck, build y dos generaciones offline convergentes. Sigue local y pendiente de commit/revisión del padre; no se aplicó la migración.

## Archivos relevantes

- `docs/efa-mvp-scope-and-plan.md` — alcance funcional acordado para permisos, guardias y bases.
- `odd/tasks/efa-access-foundation.md` — historial anterior de acceso/autorización; lectura de referencia, sin modificar.
- `src/db/schema.ts` — modelos existentes Better Auth, acceso, grants y auditoría.
- `src/routes/admin-usuarios.tsx` — página privada existente para administración de cuentas.
- `src/lib/efa-guards.server.ts` — servicio de guardias manuales y eventos temporales de bases con autorización revalidada.
- `src/components/EfaGuardPanel.tsx` — interfaz mobile-first para gestión e historial de guardias.
- `src/routes/guardia-efa.tsx` — ruta autenticada del ciclo EFA.
- `drizzle/0004_closed_sleeper.sql` — migración aditiva del ciclo de guardias; no aplicada a una base.
