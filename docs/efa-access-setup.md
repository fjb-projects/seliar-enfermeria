# Preparación de acceso privado EFA

El área privada permite iniciar sesión, consultar el panel y administrar cuentas de enfermería. Esta guía prepara un bootstrap manual; no se ejecutó contra una base de datos ni se crearon cuentas reales.

## Antes de activar una base autorizada

1. Confirma que el destino PostgreSQL/Neon y la ventana de operación estén autorizados por la persona responsable.
2. Configura localmente `DATABASE_URL`, `BETTER_AUTH_SECRET` y `BETTER_AUTH_URL` en el entorno aprobado. No pegues secretos en chat, argumentos, registros ni repositorio.
3. Aplica manualmente las migraciones revisadas solo después de obtener autorización específica para ese destino.
4. Ejecuta el bootstrap en una terminal interactiva segura, desde el checkout y entorno autorizados.

La aplicación necesita `BETTER_AUTH_SECRET` y `BETTER_AUTH_URL` cuando se usa autenticación. No se incluyen valores de ejemplo válidos ni credenciales precargadas.

## Crear el administrador inicial

El comando rechaza cualquier modo que no sea explícito. `--help` no requiere ni consulta la base:

```sh
node --env-file=.env scripts/bootstrap-admin.mjs --help
```

La persona usuaria informó que ya aplicó las migraciones; este estado no se verificó en la base. Antes de ejecutar el bootstrap, confirma por un canal autorizado que el destino tiene el esquema requerido. El comando no aplica migraciones.

Ejecuta el bootstrap solo con autorización para la base elegida y para crear una cuenta:

```sh
node --env-file=.env scripts/bootstrap-admin.mjs --apply
```

Si el entorno local usa `.env.local`, sustituye el nombre en `--env-file=.env.local`. Node carga el archivo explícitamente; el comando y el atajo npm `npm run bootstrap:admins -- --apply` no cargan archivos `.env` por sí solos. El atajo npm requiere que `DATABASE_URL` ya esté definido en el proceso.

El comando exige la confirmación literal `CREATE THE INITIAL ADMINISTRATOR`, solicita un nombre/correo y lee la contraseña sin mostrarla, dos veces, con 12–128 caracteres. Rechaza cualquier lista que no contenga exactamente una cuenta. El usuario y la credencial con hash Better Auth, acceso base de enfermería, concesión de administración y auditoría segura se escriben en una transacción con el mismo advisory lock que las mutaciones administrativas. La concesión inicial registra actor nulo: no se inventa una identidad autenticada.

El proceso se detiene si ya existe alguna concesión de administración. Una vez que la primera cuenta pueda iniciar sesión, administración crea las demás cuentas desde `/admin-usuarios`. No hay un endpoint web de bootstrap, ni nombres/correos/contraseñas incorporados; tampoco se imprimen detalles de cuenta, secretos ni errores del controlador. El comando nunca se ejecuta automáticamente al importar el módulo.

**No se ejecutó `--apply`.** La ayuda y las pruebas locales usan un entorno controlado y no establecen conectividad, cookies, rollback ni bloqueo real de PostgreSQL. La ejecución real requiere autorización para el destino y la cuenta, incluso si las migraciones ya fueron aplicadas.

## Acceso de la aplicación

- El inicio de sesión no ofrece autorregistro. Administración crea las cuentas y asigna permisos explícitos.
- Todas las cuentas tienen el rol base de enfermería. Administración implica acceso EFA efectivo, pero no guarda una concesión EFA explícita.
- `/panel` requiere una sesión activa. `/admin-usuarios` requiere además administración vigente; las funciones servidor vuelven a autorizar cada operación.
- Cambios de estado y contraseñas revocan sesiones. El restablecimiento usa una contraseña nueva provista por administración, nunca la devuelve y no muestra secretos en auditoría.
- Los flujos operativos EFA no están implementados en esta etapa.
