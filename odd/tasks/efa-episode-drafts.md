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

- **Decisión de alcance:** la persona usuaria deja ambos seguimientos pendientes y autoriza continuar con E3. E3 no cambiará la clasificación de errores ni la precisión de segundos; no cerrar ni reabrir estos advisories.
- [ ] R3-001, `src/lib/efa-episodes.client.ts:109`: distinguir rechazos definitivos (por ejemplo, guardia cerrada antes de crear) de una respuesta incierta, y permitir recuperar el formulario conservando lo ingresado sin quedar limitado al mismo reintento. Registrar como trabajo posterior separado; no hubo transición de corrección nativa.
- [ ] R3-002, `src/lib/efa-episodes.client.ts:79`: conservar segundos/milisegundos de la hora original al editar otro campo, o mantener esa precisión en el control. La conversión actual a minutos puede alterar inadvertidamente la hora del hecho. Agregar regresión de edición con timestamp no alineado al minuto.

### E3 — Continuidad temporal del navegador

**Ruta:** delegado; persistencia IndexedDB inyectable, integración cliente y estados explícitos del panel. Estimación: 350–650 líneas propias; la cifra es orientativa, sin comprimir una máquina de estados para cumplirla.
**Estado:** implementación y corrección precommit locales verificadas; pendiente de revisión/commit del padre. No reemplaza los dos seguimientos E2-A pendientes.

- La cola guarda solo operaciones enviadas, con propietario actual, UUID y payload exactos e inmutables. La escritura local ocurre antes del envío; un payload diferente no puede ocupar una clave existente.
- El adaptador real usa IndexedDB en navegador; las pruebas inyectan una tienda determinista sin sumar dependencias. Las claves separan propietario y operación, no se persiste un arreglo compartido de cuenta.
- La recuperación recarga únicamente la cola de la cuenta activa, restaura fecha/campos/versión exactos y nunca rebasea una operación pendiente. Varias pendientes se seleccionan explícitamente.
- Una respuesta confirmada elimina únicamente la operación del mismo propietario y mismo `operation.id`; respuesta incongruente conserva la entrada. Si la escritura del servidor se confirma pero falla la limpieza local, el aviso sigue siendo de éxito confirmado y la operación local no se ofrece como un nuevo UUID.
- Un inicio/enlace `online` permite como máximo un intento por operación elegible durante ese evento/montaje. Se evita concurrencia duplicada; conflicto y permiso quedan pausados, sin reintento automático ni temporizadores. El reintento incierto manual conserva exactamente UUID/payload.
- Cambio de cuenta y desmontaje invalidan callbacks antiguos; controles de escritura permanecen bloqueados hasta hidratar almacenamiento. Cuenta sin EFA actual no despacha; no se borra automáticamente su cola ni se copian sus datos al siguiente usuario.
- Cola disponible solo después de enviar el borrador; texto no enviado puede perderse. La advertencia explica que IndexedDB conserva dirección privada en texto legible del origen y no es una bóveda segura; no almacena sesiones ni credenciales. Si el almacenamiento no está disponible, no se envía ni se presenta como guardado.
- Conflictos conservan texto local hasta una elección explícita para cargar o resolver; permisos y conflicto no se descartan silenciosamente. No permitir descartar a ciegas una operación incierta que pudo haber llegado al servidor.

- [x] Implementar contrato de cola por propietario con put idempotente y store IndexedDB; pruebas con store inyectable.
- [x] Persistir antes del dispatch y reconocer únicamente respuesta con misma identidad; separar confirmación servidor de fallo al limpiar local.
- [x] Hidratar/restaurar únicamente la cuenta activa antes de habilitar controles; proteger cambio de cuenta/desmontaje contra callbacks obsoletos.
- [x] Permitir reintento manual incierto estable y recuperación online acotada; pausar conflictos/permisos; conservar pendiente hasta resolución explícita.
- [x] Mantener manejo del borrador sin EFA: lectura propia disponible, sin dispatch ni edición restringida, sin borrar cola.
- [x] Documentar privacidad/limitaciones IndexedDB y texto aún no enviado; no presentar almacenamiento local como bóveda ni como confirmación DB.
- [x] Probar pérdida de respuesta, doble envío, múltiples pendientes, almacenamiento fallido, respuesta/cleanup y cambio de cuenta; build y checks completos.

**Aceptación:** una operación se restaura para la cuenta correcta y conserva UUID, payload y `expectedVersion` al reintentar; el servidor recibe como máximo una llamada concurrente por entrada/trigger; solo el recibo coincidente limpia su entrada. El UI distingue “pendiente local”, “confirmado en servidor” y “no pudo limpiarse en este dispositivo”. Los avisos/conflictos no se presentan como éxito ni las credenciales como parte de la cola.

**Superficies E3:** `src/lib/efa-episodes.queue.ts`, `src/lib/efa-episodes.queue.test.ts`, `src/lib/efa-episodes.client.ts`, `src/lib/efa-episodes.client.test.ts`, `src/components/EfaEpisodePanel.tsx`, `src/components/EfaEpisodePanel.test.tsx` y este documento. Sin cambios a esquema, migración, autenticación, rutas, dependencias, endpoint ni otras pantallas.

**Comprobaciones E3:** tests RED/GREEN deterministas sobre contrato/store/controlador; prueba por fake inyectable sin afirmar durabilidad real de IndexedDB; suite completa, typecheck, build, ESLint/Prettier focalizados y `git diff --check`. Sin DB ni navegador real autorizado en esta unidad.

#### E3 — Evidencia observada

- RED antes de implementar el store/controlador: el test focal de la cola no podía importar `src/lib/efa-episodes.queue.ts` porque todavía no existía el módulo. En la corrección precommit, RED focal observado: `npm.cmd run test -- src/lib/efa-episodes.queue.test.ts` falló 3 de 13 por ausencia de helpers de busy, selección de entradas y “Usar ahora” con fence; otro test RED mostró que una lectura asíncrona no debía confirmar datos de una cuenta cuyo ticket ya venció. GREEN final: `npm.cmd run test -- src/lib/efa-episodes.queue.test.ts src/components/EfaEpisodePanel.test.tsx` pasó 19/19; cubre persistencia previa y reintento exacto tras fallo de storage, error de lectura con liberación busy, A confirmada/B incierta con selección/restauración, timestamp con ticket vigente y cambio de cuenta.
- `npm.cmd run test`: 18 archivos, 101/101 pruebas; `npm.cmd run typecheck`: aprobado.
- `npm.cmd run build`: aprobado. Conserva advertencias existentes de `vite-tsconfig-paths` y usos deprecados de `inputValidator()` en módulos ajenos a E3; el build incluye chunks separados de `efa-episodes.queue` y `efa-episodes.client`.
- `npx.cmd --no-install eslint src/lib/efa-episodes.queue.ts src/lib/efa-episodes.queue.test.ts src/components/EfaEpisodePanel.tsx src/components/EfaEpisodePanel.test.tsx`: aprobado sin errores ni warnings. `npx.cmd --no-install prettier --check src/lib/efa-episodes.queue.ts src/lib/efa-episodes.queue.test.ts src/components/EfaEpisodePanel.tsx src/components/EfaEpisodePanel.test.tsx odd/tasks/efa-episode-drafts.md`: aprobado; antes se ejecutó `prettier --write` sobre esos mismos archivos soportados. `git diff --check` sobre las cinco superficies: aprobado.
- Corrección precommit: el mismo formulario/UUID/payload se puede volver a persistir antes de reenviar tras fallo local; las lecturas de cola y callbacks comprobados validan el ticket propietario tras esperar antes de tocar estado; retry libera `busy` incluso ante error de lectura; una operación remanente se puede elegir explícitamente aunque sea la única. La reconciliación en línea actualiza el historial sin reemplazar un formulario distinto del pendiente/seleccionado. No se agregó automatización de borradores no enviados ni se modificaron los dos seguimientos E2-A.
- Sin navegador real: el contrato de cola se verificó con store fake inyectable, no se acredita persistencia/durabilidad real de IndexedDB ni comportamiento multi-tab de navegador. Sin DB/Neon, sin tokens o credenciales locales y sin migración.
- Runtime harness: N/A para esta unidad automatizada; no hubo navegador con sesión real disponible/autorizado. Rollback limitado al módulo de cola, sus pruebas y su integración/panel; E1/E2 y la API no cambian. Commit pendiente del padre.
- Corrección precommit autorizada dentro de E3: agregar pruebas RED/GREEN sobre persistencia reintentable con el mismo UUID/payload después de un fallo local, fences de callbacks posteriores a cada `await`, liberación del estado ocupado aun si falla `store.get`, y restauración manual explícita de otra operación cuando queda una sola en cola. No cambia E2-A ni agrega capacidades.
- Corrección precommit adicional autorizada dentro de E3: vincular un conflicto pausado a su propietario, operación y episodio exactos. Una respuesta de fondo para A no debe reemplazar ni eliminar una operación B seleccionada; cargar la versión remota resuelve solo el conflicto que la persona eligió explícitamente y verifica que selección/propietario sigan vigentes después de cada `await`. La prueba RED/GREEN debe cubrir conflicto A de fondo mientras B incierta permanece intacta. También se evita que avisos de permiso/error de A congelen el editor de B; E2-A permanece sin cambios.
- Evidencia de esta corrección: RED focal (`npm.cmd run test -- src/lib/efa-episodes.queue.test.ts`) falló 1 prueba porque faltaba el predicado de selección por identidad. GREEN (`npm.cmd run test -- src/lib/efa-episodes.queue.test.ts src/components/EfaEpisodePanel.test.tsx`) pasó 20/20; se verifica que A no es la operación activa mientras B está seleccionada, y que resolver explícitamente A elimina solo A y preserva UUID/payload/campos de B. El panel consulta el helper desde el módulo de cola cargado dinámicamente, preservando el límite SSR/client-only.
- Checks finales posteriores a esta corrección: `npm.cmd run test` 18 archivos/102 pruebas; `npm.cmd run typecheck`; `npm.cmd run build`; ESLint focal de los cuatro TS/TSX E3; Prettier check de las cuatro superficies de código y este documento; `git diff --check` de las cinco superficies. Todo aprobado. Build mantiene advertencias conocidas de `vite-tsconfig-paths` y `inputValidator()` legado en funciones ajenas. Sin prueba de navegador real ni PostgreSQL/Neon.

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

E1 y E1-A1 quedaron implementadas; E1-A1 refuerza las aserciones del fake sin modificar el servicio. E2 implementa la interfaz privada y avisos, registrada y con revisión aprobada/cerrada. E2-A conserva sus dos seguimientos expresamente pendientes por decisión de la persona usuaria; E3 no los cambia. E3 implementa la continuidad local de operaciones enviadas; la corrección precommit cubre persistencia recuperable, cuenta actual y selección de pendientes. Queda pendiente probar IndexedDB en navegador real y la aplicación/verificación real de la migración. Comunicaciones, conductas observables, despachos y coordinación policial continúan conforme al alcance acordado. El espejo Engram permanece pendiente por falta de identidad runtime registrada; no usar otra identidad ni invocar herramientas de memoria.
