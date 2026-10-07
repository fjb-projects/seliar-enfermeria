# Despachos y MVP-08 — registro EFA integrado

Completar los despachos de ambulancia y las observaciones de conducta/coordinación policial en la aplicación existente. Conservar los formularios públicos, autoría, historial, permisos y continuidad de operaciones pendientes.

## Alcance y decisiones vigentes

- Autorización: el usuario pidió completar despachos y MVP-08 mediante los runs necesarios. Implementación local, sin publicar ni ejecutar migraciones reales en Neon.
- Despacho: pertenece a un episodio; puede existir sin llamada o vincular una del mismo episodio. Al crearlo desde una llamada, copia su prioridad una sola vez. Una vinculación tardía no sobrescribe prioridad. Varias ambulancias producen despachos independientes.
- Selección operativa: usar el catálogo de bases ya sembrado desde Compensatorio como la identidad móvil/base de este MVP. No agregar flota, patentes, correspondencias inventadas ni administración paralela de móviles.
- T0–T6, según el instrumento original (tablas 4, 5 y 7): despacho, en camino, llegada a escena, sale de escena, llega a destino, entrega efectiva y disponible. Son horas reales independientes, con captura rápida al clic y edición manual. Primera respuesta no equivale a T1; encuentro policial no equivale a T2. Guardado/corrección tienen sus propias marcas de sistema.
- Tiempos ausentes: por defecto «No observado» según el plan vigente; «No informado» y «No aplica» son estados distintos seleccionables, nunca cero. No imponer cronología ni horas ficticias.
- Intentos de contacto repetibles y primera respuesta de rol anónimo/hora. Solicitud de apoyo relacionada al despacho solicitante con hora propia; el refuerzo se registra como otro despacho con su T0, sin duplicar la solicitud.
- Finalizar despacho requiere prioridad roja/amarilla/verde y resultado: con traslado, atención en domicilio sin traslado, rechazo, no ubicado, cancelado, óbito o no informado. Aclaración breve opcional, especialmente rechazo/no traslado/no ubicado. No inferir quién rechaza. T6, cierre de llamada o cierre de guardia no finalizan despachos automáticamente.
- MVP-08: observaciones opcionales de conductas concretas del catálogo aceptado de teléfono, radio, coordinación, relevo y registro. Clasificación adecuada/a mejorar, comentario opcional; «Otra conducta» exige descripción propia del registro. Sin identificar operadores ni evaluar estados mentales/protocolos clínicos. Ausencia de observación no es valoración negativa.
- Contextos tipados: guardia, episodio, llamada, despacho y coordinación/evento interinstitucional cuando exista. Validar dueño y parentesco; no IDs genéricos sin FK. La matriz de competencias es línea de base del proyecto, no certificación institucional.
- Policía: coordinación compartida por episodio con varios despachos asociados. Iniciador Central/ambulancia; destino incidente/punto de encuentro; referencia privada opcional. Solicitud/respuesta/reiteración compartidas; llegada/espera/encuentro por despacho. Sin GPS, inferencia de escena segura ni envío automático de policía.
- Permisos actuales: cuenta activa lee lo propio aun sin EFA; EFA edita lo propio; administración hereda EFA y puede corregir, conservando dueño original. Creación y correcciones revalidan en servidor. Historial inmutable, CAS e idempotencia; cambios administrativos reales avisan al autor original.
- Cola local temporal por usuario/episodio y tipo de operación: solicitud congelada antes del envío, identidad estable, confirmación solo por recibo coincidente, errores de permiso/conflicto pausados y recuperación explícita. No prometer respaldo o acceso sin conexión. No perder recuperación al fallar el almacenamiento.
- Fuera de esta entrega: dotación/relevos (MVP-10), flota/catálogos nuevos (MVP-11), informes derivados, correcciones E2-A/E3-A/C1-A2 explícitamente postergadas y expansión de anulaciones/reactivaciones generales de MVP-13.

## Entrega y recuperación

- Rama `codex/efa-dispatches-and-observations`, punto inicial `a4d22c0`, apilada sobre comunicaciones.
- Estrategia acordada `feature-branch-chain`: unidades funcionales con pruebas y documentos; publicación/PR siguen sin autorización. Previsión orientativa 6.000–9.000 líneas propias, generados excluidos. No comprimir código para alcanzar presupuestos; registrar cifras reales por commit y conservar el mejor corte coherente.
- RDD desactivado explícitamente solo en este repositorio: `disabled/unmanaged`. No iniciar revisiones nativas ni cambiar el ajuste global. Mantener pruebas/checks e inspección independiente proporcional de cambios críticos.
- Documento único de recuperación: este archivo. Espejo Engram `odd/efa-dispatches-and-observations/tasks` pendiente: el runtime no registró identidad, por lo que no se invocan herramientas de memoria ni se suplanta una sesión.
- No leer `.env`, credenciales ni sesiones autenticadas; no conexión a base de datos, migraciones reales, push o PR. Generación de SQL/snapshot offline autorizada.

## Tareas

- [x] **D1 — Persistencia/API de despachos y apoyo.** Ruta delegada: esquema, contratos y servicio multiar­chivo. Auditoría, recibos, avisos, relaciones y listado por episodio. Generar migración 0008 offline. Pruebas RED/GREEN para prioridad heredada independiente, tiempos/ausencias, parentesco, permisos, cierre, contactos/apoyo, replay y CAS.
- [ ] **D2 — Pantalla mobile-first y continuidad de despachos.** Ruta delegada: componente/cliente/cola tipada e integración con episodio. Guía por sección activa, captura rápida/manual, resultados, contactos/refuerzo e historial. Pruebas de recuperación de almacenamiento, conflictos y aislamiento de cuenta/episodio.
- [ ] **P1 — Persistencia/API de coordinación policial.** Ruta delegada: relación compartida episodio/despachos, eventos comunes y por móvil, auditoría/recibos/avisos. Generar siguiente migración offline; validar pertenencia y no duplicación de reiteraciones.
- [ ] **O1 — Persistencia/API y catálogo de conductas.** Ruta delegada: ítems aceptados, contexto con FK tipadas, historial/recibos/avisos; observaciones propias y otras con descripción. Generar siguiente migración offline. Pruebas de contexto/propiedad y clasificación opcional sin penalizar ausencias.
- [ ] **P2 — Pantalla y cola de coordinación policial.** Ruta delegada: registro progresivo compartido, asociaciones de despachos y eventos rápidos por móvil; tiempos editables y recuperación idempotente. No certificar seguridad de escena.
- [ ] **O2 — Captura mobile-first y cola de conductas.** Ruta delegada: ítems agregables, evaluación/comentario/otra conducta, contextos existentes, historial y avisos; sin formulario obligatorio de toda la matriz ni perfiles personales.
- [ ] **V1 — Integración y cierre local de los bloques.** Ruta delegada: comprobar llamada finalizada con despachos abiertos, eventos no duplicados, permisos y formularios existentes. Suite completa, typecheck, build y checks focales finales; registrar límites de prueba real de navegador/IndexedDB/PostgreSQL y comandos de migración para el usuario.

## Verificación y aceptación

- Política test-first para comportamiento determinista: observar RED antes de implementar y GREEN después. Vitest existente; ningún framework nuevo sin necesidad demostrada. Si no existe prueba RED meaningful para una tarea pasiva, documentar excepción y lectura estructural.
- Por unidad: `npm run test -- <archivos focales>`, `npm run typecheck`, `npm run build`, ESLint/Prettier focales y `git diff --check`; normalizar antes de pruebas finales. Suite completa al cierre de unidad. Generación offline convergente en tareas de esquema.
- Las pruebas con fake/SSR no certifican locks/rollback reales PostgreSQL, layout táctil ni durabilidad real IndexedDB. No inventar aprobación o pruebas de navegador. Verificación independiente para servicio/autorización y cola en límites de async, más un spot check del padre.
- Cada unidad cierra con commit convencional selectivo en rama de feature. No incluir cambios ajenos ni eliminaciones staged intencionales de bootstrap. Registrar commit, resultado exacto y rollback limitado al comportamiento incorporado.
- Completo significa código integrado, pruebas locales aprobadas, migraciones preparadas y límites declarados; no significa SQL aplicado ni aplicación publicada.

## Progreso

- Exploración completada: despachos/coordinación/conductas aún no implementados; última migración del journal: 0007 comunicaciones. Fuente original de T0–T6 verificada mediante DOCX XML, sin usar el instrumento unificado excluido por el usuario.
- D1 implementado: API en `src/lib/efa-dispatches.functions.ts` y servicio Drizzle/fake-store en `src/lib/efa-dispatches.server.ts`; incluye creación/replay estable, prioridad copiada desde la llamada vinculada al crear (incluso si el cliente manda otra prioridad), edición posterior independiente, edición CAS, cierre manual, T0–T6 con estados independientes, intentos de contacto, apoyo tipado mismo episodio, historial, avisos solo al dueño original y listado filtrado por episodio. 0008 es aditiva; la UNIQUE compuesta de llamada se declara antes de la FK que la usa y la migración añade triggers append-only para auditorías, recibos e intentos.
- Evidencia D1: la regresión de prioridad observó RED (`green` recibido frente a `red` esperado), luego GREEN al forzar la copia de la llamada; el focused `npm.cmd run test -- src/db/schema.test.ts src/lib/efa-dispatches.server.test.ts src/lib/efa-dispatches.functions.test.ts` pasó 25/25. `npm.cmd run test` pasó 150/150; `npm.cmd run typecheck`, `npm.cmd run build`, ESLint focal, Prettier `--check` y `git diff --check` pasaron. `npm.cmd run db:generate -- --name=efa_dispatches` generó 0008 y una segunda ejecución convergió sin cambios. El build conserva avisos previos de `vite-tsconfig-paths` y validadores obsoletos no pertenecientes a D1.
- Límite: fake-store y comprobaciones estructurales no prueban transacciones/rollback, locks o sintaxis operativa contra PostgreSQL; 0008 sigue sin aplicar a Neon. Engram no se actualizó porque el runtime no registró identidad. No se creó commit en esta unidad.
- Siguiente paso: D2, construir pantalla mobile-first/cola de despachos sobre estas exportaciones; D1 queda cerrado localmente y sin afirmar verificación PostgreSQL.
- Comprobación independiente D1: permisos/adapter/relaciones/recibos/CAS/migración inspeccionados; corrección de herencia inicial confirmada. Recheck del servicio 9/9 y typecheck aprobados. Spot check del padre 9/9; no ejecución real PostgreSQL. RDD sigue desactivado, sin aprobación nativa inventada.
