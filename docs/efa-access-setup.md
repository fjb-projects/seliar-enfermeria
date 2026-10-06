# Preparación de acceso privado EFA

El área privada permite iniciar sesión, consultar el panel y administrar cuentas de enfermería. Esta guía prepara un bootstrap manual; no se ejecutó contra una base de datos ni se crearon cuentas reales.

## Antes de activar una base autorizada

1. Confirma que el destino PostgreSQL/Neon y la ventana de operación estén autorizados por la persona responsable.
2. Configura localmente `DATABASE_URL`, `BETTER_AUTH_SECRET` y `BETTER_AUTH_URL` en el entorno aprobado. No pegues secretos en chat, argumentos, registros ni repositorio.
3. Ejecuta `npm run db:migrate` solo después de obtener autorización específica para aplicar las migraciones al destino elegido.
4. Ejecuta el bootstrap en una terminal interactiva segura, desde el checkout y entorno autorizados.

## Aplicar migraciones pendientes

El comando requiere `DATABASE_URL` en el entorno y una autorización explícita para el destino PostgreSQL/Neon. Carga `.env` y `.env.local` si existen; cuando ambos definen la misma variable, `.env.local` prevalece. Lee los `.sql` de `drizzle/` en orden, consulta el registro `drizzle.__drizzle_migrations`, ejecuta las migraciones que no figuran como aplicadas y registra cada éxito:

```sh
npm run db:migrate
```

Al repetirlo, Drizzle omite las migraciones que ya están registradas. No ejecutes este comando como prueba local sin autorización: conecta y escribe en la base configurada. El alias carga ambos archivos de forma opcional y también admite `DATABASE_URL` provisto en el proceso. No inspecciones ni compartas los valores de entorno.

`npm run db:generate` solo compara el esquema TypeScript y genera archivos SQL; no conecta ni aplica cambios. `npm run db:migrate` sí ejecuta los SQL pendientes del directorio de migraciones. `drizzle-kit push` difiere del flujo de archivos y no ejecuta SQL personalizado que no puede inferir del esquema, como los triggers append-only de auditoría. Por eso `generate` o `push` no sustituyen la aplicación de esas migraciones.

Si migraciones anteriores se aplicaron manualmente desde el editor SQL de Neon o mediante `push`, el historial de `drizzle.__drizzle_migrations` podría no reflejar ese estado. No supongas que el journal está alineado, no marques migraciones como aplicadas manualmente ni reintentes a ciegas: pide verificación del historial y del esquema real por un canal autorizado antes de usar `db:migrate`.

La aplicación necesita `BETTER_AUTH_SECRET` y `BETTER_AUTH_URL` cuando se usa autenticación. No se incluyen valores de ejemplo válidos ni credenciales precargadas.

## Crear el administrador inicial

El comando rechaza cualquier modo que no sea explícito. `--help` no requiere ni consulta la base:

```sh
node --env-file=.env scripts/bootstrap-admin.mjs --help
```

La persona usuaria informó que ya aplicó migraciones anteriormente; este estado y el journal de Drizzle no se verificaron en la base. Antes de ejecutar el bootstrap, confirma por un canal autorizado que el destino tiene el esquema requerido. El comando de bootstrap no aplica migraciones.

Ejecuta el bootstrap solo con autorización para la base elegida y para crear una cuenta:

```sh
node --env-file=.env scripts/bootstrap-admin.mjs --apply
```

Si el entorno local usa `.env.local`, sustituye el nombre en `--env-file=.env.local`. Node carga el archivo explícitamente; el comando y el atajo npm `npm run bootstrap:admins -- --apply` no cargan archivos `.env` por sí solos. El atajo npm requiere que `DATABASE_URL` ya esté definido en el proceso.

El comando exige la confirmación literal `CREATE THE INITIAL ADMINISTRATOR`, solicita un nombre/correo y lee la contraseña sin mostrarla, dos veces, con 12–128 caracteres. Rechaza cualquier lista que no contenga exactamente una cuenta. El usuario y la credencial con hash Better Auth, acceso base de enfermería, concesión de administración y auditoría segura se escriben en una transacción con el mismo advisory lock que las mutaciones administrativas. La concesión inicial registra actor nulo: no se inventa una identidad autenticada.

El proceso se detiene si ya existe alguna concesión de administración. Una vez que la primera cuenta pueda iniciar sesión, administración crea las demás cuentas desde `/admin-usuarios`. No hay un endpoint web de bootstrap ni nombres/correos/contraseñas incorporados. Ante un error, el comando muestra una etapa, una categoría/código conocido cuando está allowlisted y una acción recomendada; nunca imprime mensajes/cadenas/causas del controlador, SQL, valores, secretos, URL, hostnames ni stack. Si falla el commit, el resultado es incierto: verifica si el administrador existe antes de reintentar. Si el commit terminó pero falla la limpieza del pool, el mensaje indica que la cuenta fue creada y recomienda iniciar sesión, no repetir el bootstrap. El comando nunca se ejecuta automáticamente al importar el módulo.

**No se ejecutó `--apply`.** La ayuda y las pruebas locales usan un entorno controlado y no establecen conectividad, cookies, rollback ni bloqueo real de PostgreSQL. La ejecución real requiere autorización para el destino y la cuenta, incluso si las migraciones ya fueron aplicadas.

La persona usuaria informó que su ejecución anterior mostró un error genérico y que el inicio de sesión no funciona. No se inspeccionó esa ejecución ni se accedió a su entorno, secretos o base; por lo tanto, no se atribuye una causa. En una nueva ejecución autorizada, comparte solo la etapa y el código/categoría sanitizados para orientar el diagnóstico; no compartas `DATABASE_URL`, contraseñas ni trazas. Si el mensaje indica resultado de commit incierto, primero comprueba por un canal autorizado si existe la cuenta y evita reintentos ciegos. El login fallido no demuestra por sí mismo que el bootstrap haya fallado ni permite inferir un problema específico de Neon.

## Acceso de la aplicación

- El inicio de sesión no ofrece autorregistro. Administración crea las cuentas y asigna permisos explícitos.
- Todas las cuentas tienen el rol base de enfermería. Administración implica acceso EFA efectivo, pero no guarda una concesión EFA explícita.
- `/panel` requiere una sesión activa. `/admin-usuarios` requiere además administración vigente; las funciones servidor vuelven a autorizar cada operación.
- Cambios de estado y contraseñas revocan sesiones. El restablecimiento usa una contraseña nueva provista por administración, nunca la devuelve y no muestra secretos en auditoría.
- Los flujos operativos EFA no están implementados en esta etapa.
