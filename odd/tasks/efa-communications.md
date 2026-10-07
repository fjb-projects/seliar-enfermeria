# Llamadas y comunicaciones de episodios EFA

## Objetivo

Registrar llamadas entrantes y salientes como comunicaciones únicas de un episodio, con inicio y fin reales opcionales. La persona usuaria confirmó ambas horas, edición y acción rápida de captura. Finalizar el registro es distinto del fin real de la llamada y no finaliza el episodio.

## Alcance y límites

- Primera entrega: comunicaciones telefónicas de episodios existentes. No inventar otros canales, datos personales de operadores/llamantes, destinos ni protocolos.
- Inicio y fin pueden faltar; se conservan aparte de creación, captura y corrección. No truncar precisión en la API ni completar faltantes con cero. La interfaz posterior tendrá acción rápida y edición manual para ambos.
- Llamadas borrador sin prioridad; finalizar requiere roja, amarilla o verde. El cierre no cambia el episodio, guardia o despachos.
- Mantener permisos actuales, lectura propia para cuenta activa sin EFA, edición administrativa, auditoría inmutable, aviso al autor original e identidad estable para reintentos.
- No resolver E2-A/E3-A postergados del bloque anterior. Sin despachos, conductas, coordinación policial ni informes en esta entrega.
- No leer secretos o variables de entorno, conectar Neon, aplicar migraciones, publicar ni abrir PR. Generación de migración offline permitida.

## Entrega y recuperación

- Rama: `codex/efa-communications`, apilada sobre `codex/efa-episode-drafts`; punto inicial `e696501`.
- Estrategia ya acordada: `feature-branch-chain`, commits por unidad funcional y revisión nativa por segmento. Estimación inicial: 1.000–1.600 líneas propias, generados excluidos; cifra orientativa, no comprimir código.
- Documento único: este archivo. Espejo Engram `odd/efa-communications/tasks` pendiente por falta de identidad runtime registrada; no invocar herramientas de memoria ni usar otra identidad.

## Tareas

### C1 — Persistencia, permisos y API de llamadas

**Ruta:** delegada directa; esquema, servicio, funciones y pruebas requieren lectura preparatoria y varios archivos no triviales.
**Superficies exactas autorizadas:** `src/db/schema.ts`, `src/db/schema.test.ts`, `src/lib/efa-communications.server.ts`, `src/lib/efa-communications.server.test.ts`, `src/lib/efa-communications.functions.ts`, `src/lib/efa-communications.functions.test.ts`, `drizzle/0007_efa_communications.sql`, `drizzle/meta/0007_snapshot.json`, `drizzle/meta/_journal.json` y este documento. No ampliar a UI/rutas ni modificar la API de episodios.
**Relación de propiedad:** cada llamada conserva `episodeId` y `ownerUserId` del episodio; las FK compuestas impiden asociar dueño y episodio incompatibles. Quien crea/corrige se guarda aparte como actor de auditoría. Una persona administradora que corrige no se convierte en autora ni divide el historial del dueño original; las notificaciones de cambios reales van al dueño original, sin datos telefónicos sensibles.
**Modelo temporal/estados:** `startedAt` y `endedAt` representan observaciones reales opcionales y conservan precisión; no se sintetizan. `createdAt`/`updatedAt`, recepción y finalización del registro son tiempos de sistema separados. Borrador admite prioridad nula; finalizar exige roja/amarilla/verde y cambia solo el estado de esa comunicación. No exigir cronología artificial entre horas observadas ni hacer que el cierre finalice episodio/guardia/despacho.

- [x] Agregar cuatro tablas aditivas para comunicación, auditoría, recibo idempotente y aviso a destinatario; FK de dueño/episodio, unicidad compuesta y disparadores append-only; generar migración/snapshot/journal idx 7 offline.
- [x] Implementar crear/listar/consultar/actualizar/finalizar una llamada única por episodio; múltiples entrantes/salientes permitidas, sin desdoblar registros ni agregar catálogo de actores/destinos.
- [x] Revalidar actor, cuenta activa, permisos EFA vigentes y propiedad del episodio dentro de cada transacción; lectura propia posterior a revocación, admin con acceso a todos; episodios existentes editables aunque su guardia origen esté cerrada.
- [x] Implementar lock de episodio/recibo, hash canónico SHA-256, identidad estable create/update/finalize, conflicto optimista, recibo no-op sin auditoría/versión artificial, y aviso administrativo atómico solo para cambio real.
- [x] Exponer funciones servidor validadas y DTOs seguros; listar/marcar aviso solo por su destinatario, sin devolver estado telefónico sensible en el aviso.
- [x] Observar RED/GREEN para permisos, horas opcionales con precisión, finalización independiente, conflictos, replay/action-payload, auditoría completa y notificaciones; ejecutar generación offline convergente y checks locales.

**Aceptación:** API disponible y verificada localmente; no afirmar que existe aún pantalla de llamadas o SQL aplicado. La autorización real se comprueba en el servidor, registros conservan dueño original y llamadas múltiples no se duplican; finalizar no modifica episodio ni inventa horas.

**Comprobaciones C1:** `npm.cmd run test -- src/db/schema.test.ts src/lib/efa-communications.server.test.ts src/lib/efa-communications.functions.test.ts`, suite completa, typecheck, build, ESLint/Prettier y diff check acotados. `npm.cmd run db:generate -- --name=efa_communications` offline y repetición convergente; validar unicidad referenciada antes de FK y triggers append-only. Nada de `db:migrate`, Neon, credenciales o navegador real.

### C2 — Interfaz de llamadas y captura rápida

**Ruta:** delegada directa; UI, cliente, cola y sus contratos requieren lectura preparatoria y pruebas de varios archivos.
**Superficies exactas autorizadas:** `src/components/EfaEpisodePanel.tsx`, `src/components/EfaEpisodePanel.test.tsx`, `src/components/EfaCommunicationStepper.tsx`, `src/components/EfaCommunicationStepper.test.tsx`, `src/lib/efa-communications.client.ts`, `src/lib/efa-communications.client.test.ts`, `src/lib/efa-communications.queue.ts`, `src/lib/efa-communications.queue.test.ts`, `src/lib/efa-communications.server.ts`, `src/lib/efa-communications.server.test.ts`, `src/lib/efa-communications.functions.ts`, `src/lib/efa-communications.functions.test.ts` y este documento. Sin rutas nuevas, esquema, migraciones ni cambios a la cola de episodios.
**Diseño confirmado:** asistente accesible de cinco pasos (dirección → inicio → fin → prioridad → revisión), con indicador visible `Paso N de 5`, paso activo semántico, avance/retroceso explícitos y controles táctiles grandes; no navegación sólo por gestos ni control numérico ambiguo. Cada paso opcional puede omitirse; finalizar requiere prioridad real roja/amarilla/verde y una comunicación ya persistida.
**Integración y límites:** listado acotado al episodio seleccionado mediante API autorizada por dueño/admin; acceso explícito para consultar llamadas propias en modo solo lectura tras revocación EFA. La UI no crea identidad de llamante/operador, ni teléfonos, canales o destinos. Inicio/fin manuales opcionales conservan precisión existente al editar otros campos; captura rápida usa hora del clic, no una hora posterior a esperas de red. Finalizar no altera episodio ni despacho.
**Continuidad:** cola IndexedDB específica de comunicaciones, temporal y por cuenta/episodio/operación; persiste solicitud congelada antes del envío, conserva mismo ID/cuerpo en reintento y sólo elimina el recibo coincidente. Conflictos/permisos quedan en pausa; estado confirmado del servidor se distingue del fallo de refresco/limpieza local. Se comunica que la cola temporal contiene datos privados en el dispositivo y que campos no enviados no son respaldo. No cambiar ni corregir observaciones pendientes de C1-A2/E2-A/E3-A.

- [x] Agregar listado del episodio seleccionado y un acceso explícito a llamadas sin usar selección de episodio como único modo de abrirlas; filtrar en servidor y autorizar padre antes de consultar hijos.
- [x] Implementar asistente responsive de cinco pasos accesible, con horas reales opcionales, acción rápida que captura al clic, edición manual y restauración que no trunque precisión existente.
- [x] Permitir borradores sin prioridad, cierre independiente con prioridad obligatoria, edición de finalizadas conservando el cierre, y lectura de historial/avisos del destinatario.
- [x] Implementar cola IndexedDB aislada por cuenta/episodio con cuerpo/ID congelado, persistencia previa al envío, reintento manual acotado, selección de entradas restantes y limpieza sólo por recibo coincidente.
- [x] Cubrir estados, stepper, autorización/filtrado por episodio, captura temporal y recuperación de cola con RED/GREEN determinista; ejecutar suite, typecheck, build, lint/formato y diff check.

**Proyección:** varios componentes y pruebas cliente/cola; la estimación supera el presupuesto usual por tarea, pero se conserva como una unidad coherente UI+continuidad sin comprimir lógica ni dividir artificialmente. Verificación SSR/fake no acredita visualización en navegador ni durabilidad real en IndexedDB; no requiere `db:generate`.

## Comprobaciones

- TDD para comportamiento determinista: RED observado antes de implementar, GREEN después. Pruebas focales y suite completa, typecheck, build, ESLint/Prettier focalizados y diff check.
- C1: generación offline y repetición convergente. Inspección SQL de relaciones, unicidad y auditoría append-only. No ejecutar migraciones reales.
- Pruebas fake no acreditan locks, rollback, constraints ni timestamps de PostgreSQL. La prueba real de navegador sigue separada.
- Preservar cambios ajenos y eliminaciones staged intencionales de los scripts bootstrap. Parent registra commits selectivos y resultados nativos; no publicar.

## Estado y siguiente paso

Horas de inicio/fin confirmadas; C1 registrada y con revisión nativa aprobada/cerrada. C2 implementada localmente en UI/cliente/cola; verificación real en navegador e IndexedDB pendiente. La migración real también sigue pendiente. C1-A2 conserva una observación informativa de precisión superior al milisegundo. Mirror Engram pendiente por falta de identidad runtime; conservar avances en este documento.

### Evidencia C1

- RED observado: pruebas de esquema y funciones fallaron porque faltaban las tablas y API de comunicaciones; una prueba de recibo no-op también falló antes de implementar su comportamiento. GREEN: suite focalizada `npm.cmd run test -- src/db/schema.test.ts src/lib/efa-communications.server.test.ts src/lib/efa-communications.functions.test.ts` — 3 archivos, 21 pruebas aprobadas.
- `npm.cmd run test`: 20 archivos, 114 pruebas aprobadas. `npm.cmd run typecheck`: aprobado después de precisar el literal `direction` en el fixture de corrección administrativa.
- `npm.cmd run build`: aprobado; emitió avisos preexistentes de `vite-tsconfig-paths` y `inputValidator()` de módulos ajenos a C1.
- `npm.cmd run db:generate -- --name=efa_communications`, ejecutado dos veces: ambas ejecuciones informaron que no hay cambios de esquema. Sin conexión ni aplicación de SQL; no demuestra ejecución PostgreSQL, locks, rollback o triggers en servidor real.
- ESLint focalizado, Prettier focalizado y `git diff --check` sobre superficies C1 aprobados. No se ejecutó `db:migrate`.
- La migración y snapshot generados se conservaron; un intento de retirar/recrear artefactos generados fue rechazado por el entorno, por lo que se ajustaron en su ubicación autorizada y luego se verificó convergencia de generación.
- Estado de entrega: commit local `3bad1bb573ed991a7921e41ea905c95f9b491b24`, revisión nativa aprobada y reconocimiento exacto completado. Siguiente paso: implementar C2 en una unidad separada; migración real queda pendiente de autorización y entorno con base de datos.

### Evidencia C2

- RED observado: prueba de listado por episodio falló inicialmente porque `service.listForEpisode` aún no existía. La prueba de guardia de envío también falló antes de implementar el bloqueo síncrono del submit. GREEN: `npm.cmd run test -- src/components/EfaCommunicationStepper.test.tsx src/components/EfaEpisodePanel.test.tsx src/lib/efa-communications.client.test.ts src/lib/efa-communications.queue.test.ts src/lib/efa-communications.server.test.ts src/lib/efa-communications.functions.test.ts` — 6 archivos, 29 pruebas aprobadas.
- `npm.cmd run test`: 23 archivos, 128 pruebas aprobadas. `npm.cmd run typecheck`: aprobado. `npx.cmd --no-install eslint` sobre las 12 superficies TypeScript C2: aprobado sin errores ni avisos.
- `npm.cmd run build`: aprobado. Avisos existentes: resolución `vite-tsconfig-paths`, deprecaciones `inputValidator()` de módulos ajenos y tiempos de plugin. La primera compilación del candidato falló porque la protección SSR bloqueó un import estático desde `*.client.ts`; el gate se movió al módulo SSR del stepper y la compilación final quedó aprobada.
- Prettier focalizado y `git diff --check` acotado aprobados. No se ejecutó generación/aplicación de migraciones ni se conectó a PostgreSQL.
- Límite de verificación: las pruebas SSR y el store fake no ejercitan layout táctil en navegador ni durabilidad/concurrencia real de IndexedDB. La cola se carga sólo en el cliente y filtra mediante índice compuesto propietario+episodio; estas garantías de almacenamiento deben validarse en navegador real.
- Estado de entrega: sin commit ni revisión nativa en este bloque; parent gestiona commit selectivo y evaluación. Próximo paso: revisión/commit del segmento C2 y prueba manual de navegador; migración real permanece fuera de alcance.

### Corrección acotada C1-A1

- [x] Ajustar el orden de finalización para que el `UPDATE ... WHERE version = expectedVersion` tenga éxito antes de agregar auditoría o aviso.
- [x] Completar aserciones de auditoría con actor, acción, versiones y estado íntegro antes/después para correcciones propias y administrativas; probar que un CAS fallido no agrega auditoría ni aviso.
- [x] Verificar el ajuste: RED observado en finalización CAS fallida (se agregó una segunda auditoría antes del rechazo); GREEN en `npm.cmd run test -- src/lib/efa-communications.server.test.ts` — 9 pruebas aprobadas. La suite focalizada de C1 pasó 22/22; suite completa 20 archivos/115 pruebas; typecheck, build, ESLint, Prettier y diff check aprobados.
- El fake sólo valida el orden de invocación: no simula rollback transaccional ni acredita comportamiento concurrente real de PostgreSQL. Build conservó avisos existentes de Vite y `inputValidator()`; no se accedió a la base ni se aplicó migración.

### Correcciones acotadas C2 — seguridad de envío y recuperación

- [x] Comprobar inmediatamente antes de cada envío, también después de leer IndexedDB, que siguen vigentes cuenta, episodio, montaje y permiso actual; cancelar sin invocar servidor si el contexto cambió.
- [x] Separar errores de transporte de recibos confirmados o incompatibles. Si falla la limpieza local, conservar una barrera terminal en memoria mientras viva el controlador y permitir sólo limpieza local; no reenviar tras confirmación o discrepancia conocida.
- [x] Dar salida explícita a conflictos CAS: cargar versión actual sin borrar el payload local; permitir resolver únicamente la operación conflictiva seleccionada con confirmación explícita y volver a validar identidad tras cada espera.
- [x] Respetar `communication.canEdit` además del permiso actual para modificar/finalizar; las llamadas no editables mantienen lectura de historial y avisos.
- [x] Observar RED/GREEN para cambio de cuenta durante lectura, fallas de limpieza tras recibos, resolución aislada de conflictos y permisos de edición; repetir suite completa, typecheck, build, lint, Prettier y diff check acotados.

**Límite conocido:** si IndexedDB no puede persistir un estado terminal y la página se recarga, no es posible garantizar localmente que la misma operación no vuelva a enviarse; los recibos idempotentes del servidor siguen siendo la protección remota. No afirmar prueba real de navegador/IndexedDB.

### Corrección acotada C2-A4 — restauración de finalización en conflicto

- [x] Restaurar operaciones `finalize` usando la llamada actual como fuente de dirección y horas reales, aplicando sólo la prioridad congelada del recibo; cargar el registro si aún no está disponible y cercar cada espera por cuenta/episodio/operación.
- [x] Al elegir conservar los datos locales en una resolución explícita, conservar la prioridad de la operación, pero tomar dirección e inicio/fin de la versión actual y su baseline; no borrar observaciones reales ni reutilizar la versión esperada vieja.
- [x] Observar RED/GREEN en recarga de finalización pausada seguida de edición válida sin pérdida de tiempos con segundos/milisegundos; comprobar suite focalizada/completa, typecheck, build, lint, formato y diff check.

**Evidencia C2-A4:** RED observado en la prueba de restauración de una finalización en conflicto, que falló porque el helper de reconstrucción aún no existía. GREEN focalizado: `npm.cmd run test -- src/lib/efa-communications.client.test.ts src/components/EfaCommunicationStepper.test.tsx src/lib/efa-communications.queue.test.ts` — 3 archivos, 18 pruebas; conjunto C2 final `npm.cmd run test -- src/lib/efa-communications.queue.test.ts src/lib/efa-communications.client.test.ts src/components/EfaCommunicationStepper.test.tsx src/components/EfaEpisodePanel.test.tsx src/lib/efa-communications.server.test.ts src/lib/efa-communications.functions.test.ts` — 6 archivos, 36 pruebas; suite completa `npm.cmd run test` — 23 archivos, 135 pruebas. `npm.cmd run typecheck`, `npm.cmd run build`, ESLint, Prettier y diff check aprobados sobre el candidato final. Build mantiene avisos existentes de `vite-tsconfig-paths` y `inputValidator()` ajenos al cambio.

**Evidencia C2-A3:** RED observado en las regresiones de cola para permiso revocado después de lectura, recibo confirmado con fallas de eliminación/estado y recibo discrepante con falla de persistencia; las tres fallaron antes del ajuste. RED adicional observado al introducir la prueba de lectura de conflicto cancelada por cambio de selección. GREEN: `npm.cmd run test -- src/lib/efa-communications.queue.test.ts src/lib/efa-communications.client.test.ts src/components/EfaCommunicationStepper.test.tsx src/components/EfaEpisodePanel.test.tsx src/lib/efa-communications.server.test.ts src/lib/efa-communications.functions.test.ts` — 6 archivos, 35 pruebas; `npm.cmd run test` — 23 archivos, 134 pruebas. `npm.cmd run typecheck`, `npm.cmd run build`, ESLint focalizado, Prettier focalizado y `git diff --check` acotado aprobados. Build mantiene avisos preexistentes de `vite-tsconfig-paths` y deprecación de `inputValidator()` en funciones ajenas. Sin navegador real ni IndexedDB real; la barrera terminal en memoria dura sólo mientras vive el store y no promete recuperación durable si el almacenamiento no puede guardar el estado.

### C1 — Commit y revisión cerrada

- Commit `3bad1bb573ed991a7921e41ea905c95f9b491b24`: 4.050 adiciones en diez archivos. Código, pruebas y documento: 1.913 líneas; SQL 96, snapshot generado 2.034 y journal 7. El crecimiento conserva permisos, recibos, restricciones y pruebas en una unidad funcional; no se comprimió por la previsión orientativa. Mantener `feature-branch-chain` para futura publicación; no se abrió PR ni se hizo push.
- Verificador independiente posterior a C1-A1: 22/22 pruebas focales y typecheck aprobados, CAS antes de auditoría y snapshots completos comprobados. Spot check del padre: 9/9 pruebas del servicio. Suite completa final del escritor: 115/115; build, lint y formato aprobados. No PostgreSQL ni UI de llamadas ejecutados.
- Evaluación `medium`, `review_due: true`, motivo `slice_budget_reached`, desde `e696501`. Con consentimiento explícito, la revisión `review-3861ec2c4c5fa968` evaluó `review-reliability` sobre el candidato `sha256:cd0e396dcbdca5d1f38f0397995a964235d9981a1a84945b2e3bb16461a8773f`.
- Aprobada con una observación informativa no bloqueante. El reconocimiento exacto devolvió `gentle-ai.review-acknowledged/v1`, acción `acknowledged`, autoridad `burned`; límite revisado `3bad1bb573ed991a7921e41ea905c95f9b491b24`. No reabrir este candidato por su advisory; no se ofreció corrección nativa. La aprobación no valida ejecución SQL real ni autoriza publicación.

### C1-A2 — Precisión temporal superior al milisegundo, pendiente

- [ ] `R3-time-precision`, `src/lib/efa-communications.server.ts:161`: la validación admite fracciones de segundo sin límite, pero `Date` reduce a milisegundos antes de guardar, auditar y calcular hash. Las pruebas actuales conservan segundos/milisegundos, no precisión superior. Preservar toda la precisión aceptada o resolver explícitamente un contrato limitado de precisión; añadir regresiones con más de tres decimales y distinguir payloads que hoy se normalizan igual.
- Seguimiento separado e informativo; no implementado ni autorizado automáticamente por el resultado de revisión. C2 debe comunicar los límites actuales sin prometer precisión arbitraria. E2-A/E3-A del bloque anterior siguen pendientes.
