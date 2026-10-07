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

**Ruta:** delegada directa; derivar superficies exactas después de C1.

- [ ] Integrar listado y carga por pasos dentro del episodio seleccionado, coherentes con los estilos existentes.
- [ ] Ofrecer inicio y fin opcionales con acción rápida independiente y edición manual; conservar el horario original al editar otro dato.
- [ ] Mostrar prioridad y cierre de llamada independiente, historial y avisos autorizados.
- [ ] Conservar confirmación/reintentos sin duplicados y documentar límites de continuidad local; no reutilizar una cola de episodios como si aceptara comunicaciones sin adaptar su contrato.
- [ ] Verificar controles, autorización y transiciones con runners existentes, sin dependencias innecesarias.

## Comprobaciones

- TDD para comportamiento determinista: RED observado antes de implementar, GREEN después. Pruebas focales y suite completa, typecheck, build, ESLint/Prettier focalizados y diff check.
- C1: generación offline y repetición convergente. Inspección SQL de relaciones, unicidad y auditoría append-only. No ejecutar migraciones reales.
- Pruebas fake no acreditan locks, rollback, constraints ni timestamps de PostgreSQL. La prueba real de navegador sigue separada.
- Preservar cambios ajenos y eliminaciones staged intencionales de los scripts bootstrap. Parent registra commits selectivos y resultados nativos; no publicar.

## Estado y siguiente paso

Horas de inicio/fin confirmadas; C1 implementado localmente. C2 aún sin implementar y permanece fuera de esta entrega. Mirror Engram pendiente por falta de identidad runtime; conservar avances en este documento.

### Evidencia C1

- RED observado: pruebas de esquema y funciones fallaron porque faltaban las tablas y API de comunicaciones; una prueba de recibo no-op también falló antes de implementar su comportamiento. GREEN: suite focalizada `npm.cmd run test -- src/db/schema.test.ts src/lib/efa-communications.server.test.ts src/lib/efa-communications.functions.test.ts` — 3 archivos, 21 pruebas aprobadas.
- `npm.cmd run test`: 20 archivos, 114 pruebas aprobadas. `npm.cmd run typecheck`: aprobado después de precisar el literal `direction` en el fixture de corrección administrativa.
- `npm.cmd run build`: aprobado; emitió avisos preexistentes de `vite-tsconfig-paths` y `inputValidator()` de módulos ajenos a C1.
- `npm.cmd run db:generate -- --name=efa_communications`, ejecutado dos veces: ambas ejecuciones informaron que no hay cambios de esquema. Sin conexión ni aplicación de SQL; no demuestra ejecución PostgreSQL, locks, rollback o triggers en servidor real.
- ESLint focalizado, Prettier focalizado y `git diff --check` sobre superficies C1 aprobados. No se ejecutó `db:migrate`.
- La migración y snapshot generados se conservaron; un intento de retirar/recrear artefactos generados fue rechazado por el entorno, por lo que se ajustaron en su ubicación autorizada y luego se verificó convergencia de generación.
- Estado de entrega: sin commit ni revisión nativa en este bloque; parent gestiona commit selectivo y evaluación. Siguiente paso: implementar C2 en una unidad separada; migración real queda pendiente de autorización y entorno con base de datos.

### Corrección acotada C1-A1

- [x] Ajustar el orden de finalización para que el `UPDATE ... WHERE version = expectedVersion` tenga éxito antes de agregar auditoría o aviso.
- [x] Completar aserciones de auditoría con actor, acción, versiones y estado íntegro antes/después para correcciones propias y administrativas; probar que un CAS fallido no agrega auditoría ni aviso.
- [x] Verificar el ajuste: RED observado en finalización CAS fallida (se agregó una segunda auditoría antes del rechazo); GREEN en `npm.cmd run test -- src/lib/efa-communications.server.test.ts` — 9 pruebas aprobadas. La suite focalizada de C1 pasó 22/22; suite completa 20 archivos/115 pruebas; typecheck, build, ESLint, Prettier y diff check aprobados.
- El fake sólo valida el orden de invocación: no simula rollback transaccional ni acredita comportamiento concurrente real de PostgreSQL. Build conservó avisos existentes de Vite y `inputValidator()`; no se accedió a la base ni se aplicó migración.
