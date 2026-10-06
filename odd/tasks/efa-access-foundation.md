# Fundación de acceso EFA

**Estado:** T1 con comprobaciones funcionales completas; cierre por commit y evaluación/revisión nativa pendientes. T2/T3 no iniciadas.

**Autorización:** el usuario autorizó la primera etapa local de acceso. Esta tarea documenta su alcance; no autoriza operaciones con una base real, cuentas reales, despliegue ni cambios remotos.
**Copia Engram:** pendiente porque el runtime no confirmó una identidad de sesión autorizada; las escrituras de memoria no están disponibles.

## Objetivo

Agregar la base relacional y de autenticación del área privada EFA: inicio y cierre de sesión con correo y contraseña, sin autorregistro; administración de cuentas de enfermería, roles y estado; y auditoría inmutable de cambios. Los formularios públicos y sus integraciones actuales deben seguir funcionando sin cambios.

## Por qué

La etapa establece identidad y permisos antes de incorporar guardias o registros operativos. Debe conservar la autoría real de la cuenta autenticada sin convertir la identidad de las personas observadas en un dato de dotación.

## Alcance autorizado

- Esquema PostgreSQL y migraciones versionadas con Drizzle; seleccionar un driver compatible con transacciones de Neon/Vercel.
- Better Auth con contraseña/correo, sin autorregistro público. La aplicación no exige cambio de contraseña en el primer inicio.
- Administración puede crear cuentas, otorgar o quitar permisos EFA/administración, desactivar/reactivar cuentas y restablecer contraseñas.
- Toda cuenta de enfermería conserva el rol base de enfermería de ambulancia. Administración hereda EFA aunque no tenga concesión EFA explícita.
- Autorización del lado servidor en cada operación protegida; una condición visual o `beforeLoad` no basta como límite de seguridad.
- Eventos de auditoría inmutables con actor, entidad, acción, fecha de base de datos y metadatos anteriores/nuevos permitidos. Nunca guardar contraseñas, hashes, tokens ni secretos.
- Preparar más adelante un comando manual seguro para crear los tres administradores iniciales, sin credenciales precargadas ni endpoint permanente de instalación.
- La aplicación debe compilar sin credenciales ni una base conectada. Generar migraciones no equivale a aplicarlas.

## Fuera de alcance

- Crear o conectar una base real, aplicar migraciones a un servicio remoto, crear cuentas reales, desplegar o usar sesiones autenticadas.
- Pantallas de guardias, episodios, comunicaciones, móviles, dotaciones o análisis; se definirán en etapas posteriores.
- Cambiar, migrar, duplicar o reescribir formularios públicos, Google Forms o Apps Script.
- Impersonación, borrado destructivo de usuarios, autorregistro, cambio forzoso de contraseña inicial, credenciales de bootstrap reales o cualquier inclusión de secretos en el repositorio.

## Decisiones y restricciones técnicas

- El proyecto ya usa TanStack Start y funciones de servidor en `src/lib/*.functions.ts`; mantener ese límite servidor/cliente y el middleware CSRF de `src/start.ts`.
- La instalación parcial fijó Better Auth y `@better-auth/drizzle-adapter` 1.7.7, Drizzle ORM 0.45.3, Drizzle Kit 0.31.11, Neon Serverless 1.2.0 y Vitest 5.0.3. Better Auth 1.7.7 requiere Zod `^4.5.4`; npm rechazó la combinación con el Zod 3 existente. El usuario aceptó continuar con Zod 4.6.5 después de revisar las validaciones existentes.
- El usuario informó que ya creó la DB en Neon, sin Neon Auth. No se verificó ni se accedió a esa DB; conexión, migraciones y cuentas reales siguen fuera de la autorización actual. Better Auth se integrará en la aplicación sobre PostgreSQL, sin requerir Neon Auth.
- Better Auth Admin ofrece operaciones de creación, roles, bloqueo y contraseñas, pero también expone capacidades de eliminación e impersonación. No exponer sin filtro un manejador general de administración ni permitir que se omita la auditoría.
- La documentación consultada de Better Auth no establece que sus hooks o llamadas administrativas hagan atómica una escritura propia de auditoría. Antes de implementar, demostrar y probar el límite transaccional de cambios de cuenta/rol/estado más auditoría; no atribuir atomicidad a hooks sin evidencia.
- Desactivar debe bloquear el acceso y revocar sesiones, sin borrar la cuenta ni su historial. Al reactivar, respetar la autorización vigente. Verificar en servidor los roles vigentes después de cambios; no confiar en roles obsoletos de una sesión cliente.
- Una modificación de roles conserva la base de enfermería correspondiente; el permiso EFA efectivo es EFA explícito o administración.
- No introducir URL o secreto de base real. `.env.example` se agregó con valores vacíos; no contiene credenciales reales.
- El usuario confirmó npm como único gestor del proyecto; `package-lock.json` es el lockfile de referencia. No instalar ni sincronizar Bun. El archivo existente `bun.lock` se conserva sin modificar hasta autorizar su limpieza; no se considera un lockfile activo ni un bloqueo para la implementación con npm.

## Línea base y preservación

- HEAD observado al planificar: `500b7dd`, rama `feat/ingreso-check-in`.
- Estrategia de entrega: `ask-on-risk`; estrategia de encadenamiento aceptada por el usuario: `feature-branch-chain`. La previsión total es de 540–790 líneas de autoría, sin contar archivos generados. Se conservarán unidades pequeñas con sus pruebas y documentación. No se abrirán PR ni se publicará nada sin autorización posterior.
- Rama de trabajo creada: `feat/efa-access-foundation`, desde `500b7dde4246e8876cb466819922368cd18af3a4`. Límite inicial para futuras evaluaciones por commit: ese mismo SHA. Entregas previstas: T1 (esquema/pruebas), T2 (servicios/permisos), T3 (interfaz/bootstrap); commits aún pendientes.
- No crear una rama, commit, stage, despliegue ni modificación de fuente durante la preparación de esta tarea. Antes de commits de implementación, trabajar desde una rama dedicada de la funcionalidad y preservar la historia.
- Preservar cambios preexistentes en `.atl/.skill-registry.cache.json`, `.atl/skill-registry.md`, `.gitignore` y `vite.config.ts`, además de `.codex-remote-attachments/`, `docs/efa-mvp-scope-and-plan.md` y cualquier salida local. No incluirlos por accidente en commits nuevos.
- El orquestador confirmó receipt-driven development **activo por defecto** mediante una consulta autorizada. Esto reemplaza el estado previo desconocido por acceso denegado. No se cambió el modo; la evaluación/revisión del candidato y el commit siguen pendientes y corresponden al orquestador. No hay consentimiento ni aprobación de revisión registrados para T1.

## Tareas ODD

T1 está en curso. T2 y T3 aún no comenzaron. Una tarea solo se marca completa cuando se observan su resultado y sus comprobaciones.

### T1 — Esquema, migraciones y base de prueba — estimación: 150–220 líneas

**Ruta:** delegada directa por la exploración de dependencias, configuración y esquema, más cambios coordinados en varios archivos y verificación local.

- [x] Seleccionar versiones e incorporar Zod 4.6.5, aceptado por el usuario después de las comprobaciones de compatibilidad. El gestor confirmado es npm, no Bun.
- [x] Identificar los avisos de seguridad y corregir la nueva cadena moderada con un override acotado; conservar como seguimiento la vulnerabilidad alta preexistente. No considerar comprobada la seguridad total del conjunto.
- [x] Incorporar tablas de autenticación, permisos de cuenta y auditoría/versionado con claves y restricciones relacionales.
- [x] Preparar configuración de Drizzle y migraciones generables localmente; no aplicar migraciones a una base real.
- [x] Establecer un runner de pruebas enfocado y comprobar que imports/build no requieren conexión o credenciales de DB.

**Superficies candidatas:** `package.json`, `package-lock.json`, `bun.lock`, `.env.example`, `drizzle.config.ts`, `drizzle/**`, `src/db/**`, `vitest.config.ts`, `src/db/**/*.test.ts`.

**Corrección de dependencias y evidencia de T1:**

- Se conservó el override existente de Rolldown y se agregó únicamente `@esbuild-kit/core-utils` → `esbuild: 0.25.12`. [La versión está publicada en npm](https://registry.npmjs.org/esbuild/0.25.12); corrige [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99), cuyo primer parche es 0.25.0. No se aplicó override global, downgrade de Drizzle Kit ni `audit fix`.
- El override excede el rango upstream `~0.18.20`: es una decisión acotada y debe revisarse cuando el loader actualice su dependencia. El código instalado de core-utils utiliza `version`, `transform` y `transformSync`; seis comprobaciones sintéticas de sus funciones reales (TS, TSX y JSON, síncronas/asíncronas) pasaron sustituyendo esbuild por 0.25.12. La API de transformación conserva las opciones empleadas; [documentación oficial](https://esbuild.github.io/api/#transform). Esto prueba los usos comprobados, no toda compatibilidad futura del paquete.
- La instalación npm se ejecutó con `--ignore-scripts`. El primer intento sandbox quedó sin salida y se detuvo únicamente su proceso identificado; el retry autorizado contra el registro público terminó con exit 0 e informó dos paquetes cambiados. El parser de config quedó comprobado después con generación offline.
- El nodo efectivo de esbuild de core-utils pasó de 0.18.20 a 0.25.12, incluido su binario de plataforma. Los esbuild independientes de Drizzle Kit (0.25.12) y raíz (0.28.2) permanecen en sus versiones. Contra la línea base `500b7dd`, las únicas versiones de nodos preexistentes que cambiaron siguen siendo `ws` 8.21.3→8.22.0 y Zod 3.25.76→4.6.5. Los snapshots temporales previos no estuvieron disponibles desde la ejecución posterior; no se afirma un inventario exhaustivo de todos los nodos opcionales antes/después del parche.
- `npm run db:generate` se ejecutó dos veces: exit 0 en ambas y **No schema changes, nothing to migrate**. `npm run test`: 4/4, exit 0. `npm run typecheck`: exit 0. `npm run build`: exit 0; permanecen los avisos previos de `inputValidator()` y `vite-tsconfig-paths`. No se conectó, aplicó ni probó una DB real, ni se enviaron formularios reales.
- Auditoría completa posterior: exit 1, **0 moderadas y 1 alta** (`brace-expansion`). Auditoría `--omit=dev`: exit 0, **0 vulnerabilidades reportadas**. Los cuatro avisos moderados nuevos de Drizzle Kit/esm-loader/core-utils/esbuild desaparecieron del informe. Drizzle Kit ya está declarado como dev, pero npm lo incluía en el grafo productivo mientras Better Auth lo declara peer opcional; moverlo a dev no era una corrección adicional.
- Seguimiento fuera de alcance: `brace-expansion` 1.1.18 y 5.0.9 son transitorios dev idénticos a `500b7dd`, con fixes disponibles; no se modificaron. [Advisory y parches](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr). El conjunto completo no tiene una auditoría limpia.
- Normalización: Prettier sobre `package.json` antes de las comprobaciones funcionales (sin cambios); normalización/readback de esta documentación antes de entregar al orquestador. Commit y revisión del candidato todavía pendientes.

### T2 — Sesión, autorización y operaciones administrativas — estimación: 220–320 líneas

**Ruta prevista:** delegada directa por lógica sensible de autenticación/autorización, servicios de varias operaciones y pruebas de seguridad.

- [ ] Configurar correo/contraseña y desactivar autorregistro; implementar login, cierre de sesión y lectura de sesión.
- [ ] Centralizar autorización de sesión activa, administración, EFA heredado y rol base; aplicarla dentro de cada función sensible.
- [ ] Implementar creación de cuenta, cambios de roles, desactivación/reactivación y restablecimiento de contraseña mediante servicios internos acotados.
- [ ] Escribir estado/roles y auditoría permitida en la misma transacción cuando corresponda; probar rollback, concurrencia, acceso no autorizado, conservación de roles y revocación de sesiones.
- [ ] Asegurar que ningún resultado, log, auditoría o respuesta incluya contraseña, hash, token o secreto. Prohibir eliminación e impersonación en la interfaz y en las rutas expuestas.
- [ ] Evaluar y proteger el caso de perder el último administrador efectivo, sin inventar una política de aprobación o excepción.

**Superficies candidatas:** `src/lib/auth.server.ts`, `src/lib/auth.functions.ts`, `src/lib/accounts.server.ts`, `src/lib/accounts.functions.ts`, `src/start.ts` solo si hace falta integración, `src/db/**`, `src/lib/**/*.test.ts`.

### T3 — Pantallas privadas, bootstrap manual y verificación — estimación: 170–250 líneas

**Ruta prevista:** delegada directa por integración de interfaz, comando seguro, documentación y verificación funcional.

- [ ] Agregar pantallas de login y gestión administrativa de cuentas/roles/estado/restablecimiento; mantener intacto el flujo público.
- [ ] Crear un comando local manual de bootstrap con entrada segura de credenciales, guardas de ejecución, sin valores reales versionados y sin endpoint web permanente.
- [ ] Documentar precondiciones, ejecución manual segura y recuperación, sin conectar servicios reales.
- [ ] Verificar el flujo de interfaz y roles con DB de prueba/local autorizada; dejar como pendientes las comprobaciones que requieran una base real.

**Superficies candidatas:** `src/routes/login.tsx`, `src/routes/admin-usuarios.tsx`, `scripts/bootstrap-admin.ts`, `docs/efa-mvp-scope-and-plan.md`, `src/routeTree.gen.ts` solo como salida generada, `src/routes/**/*.test.tsx`.

## Comprobaciones y criterios de aceptación

- Aplicar TDD a servicios de autorización y cambios de cuenta una vez exista un runner: observar primero una prueba de seguridad fallida, implementar y volver a ejecutarla. La generación de esquema/configuración puede no tener un RED funcional significativo; justificar esa excepción y comprobar tipos, generación de SQL y build.
- `npm run typecheck` y `npm run build` pasan sin DB ni secretos presentes; preservar formularios públicos y sus rutas. Los resultados previos fueron satisfactorios, con avisos existentes de `inputValidator()` y `vite-tsconfig-paths`.
- No se aceptan altas públicas. Los cambios de cuenta requieren sesión y rol administrador vigente en servidor.
- El retiro de EFA no retira el acceso heredado de administración; quitar administración conserva EFA solo cuando hay una concesión EFA efectiva.
- Desactivar bloquea login y sesiones existentes sin borrar usuario ni auditoría; reactivar conserva identidad e historial.
- Los eventos de auditoría son inmutables y no contienen secretos. El comportamiento atómico se considera probado solo tras testear la implementación real elegida.
- Las migraciones se generan y revisan localmente; la aplicación a DB, prueba de credenciales, creación de tres administradores y despliegue quedan pendientes de autorización/entorno.
- Las pruebas específicas de T1 y la configuración local se ejecutaron; no se realizaron pruebas contra una DB.

## Progreso y siguiente paso

- **Completado:** documentación de alcance, mapeo local y validación previa de `npm run typecheck` / `npm run build`.
- **T1 parcial (sin cierre ni commit):** se agregaron tablas relacionales de Better Auth, acceso/roles, auditoría versionada con trigger append-only, cliente Neon lazy server-only, configuración Drizzle, migración offline y Vitest. La prueba de modelo Better Auth produjo RED porque la librería busca claves singulares; tras alinear las exportaciones con los nombres `user/session/account/verification`, `npm run test` pasó (4/4) y `npm run typecheck` pasó. También pasaron `npm run db:generate` (segunda ejecución sin cambios) y `npm run build`. No se conectó ni migró ninguna base. El lock npm recibió 129 nodos nuevos; solo cambiaron versiones existentes de `ws` (8.21.3→8.22.0) y Zod (3.25.76→4.6.5), con tres nodos removidos.
- **Compatibilidad de formularios revisada:** se ejecutaron 1.550 casos sobre las expresiones reales de seis esquemas con Zod 4.6.5 y el subpath de compatibilidad `zod/v3`, más ocho pruebas de cuerpos JSON de cuatro formularios y dieciséis pruebas de helpers/transporte de Registro. Los payloads normales coinciden; Ingreso mantiene timestamps `toISOString()` válidos y la URL de horario publicado se normaliza eliminando espacios exteriores. No se ejecutaron handlers ni envíos reales. La equivalencia exacta con la instalación histórica 3.25.76 no está demostrada. TypeScript y las cuatro pruebas persistentes del proyecto pasaron. El usuario aceptó continuar; no se modificaron los formularios públicos.
- **Pendiente para cerrar T1:** commit de la tarea y evaluación/revisión del candidato por el orquestador con RDD activo por defecto. La auditoría ya está identificada y la nueva cadena moderada corregida; queda una alta preexistente dev documentada, no corregida. Organización aceptada: rama propia, commits pequeños y `feature-branch-chain`, sin publicación. La sincronización de Bun ya no es un pendiente: el usuario confirmó npm.
- **También pendiente:** validación real de transacciones/trigger en una DB autorizada y toda implementación T2–T3.
- **Siguiente paso:** realizar la evaluación/revisión nativa aplicable, registrar el commit de T1 y continuar con T2 (login y autorización). La DB Neon fue declarada creada por el usuario, pero su uso real requiere autorización específica y configuración segura, no credenciales por el chat. Mantener la copia Engram pendiente hasta disponer de identidad de sesión autorizada.
