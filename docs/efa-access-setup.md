# Preparación de acceso privado EFA

El área privada permite iniciar sesión, consultar el panel y administrar cuentas de enfermería. Esta guía prepara un bootstrap manual; no se ejecutó contra una base de datos ni se crearon cuentas reales.

## Antes de activar una base autorizada

1. Confirma que el destino PostgreSQL/Neon y la ventana de operación estén autorizados por la persona responsable.
2. Configura localmente `DATABASE_URL`, `BETTER_AUTH_SECRET` y `BETTER_AUTH_URL` en el entorno aprobado. No pegues secretos en chat, argumentos, registros ni repositorio.
3. Aplica manualmente las migraciones revisadas solo después de obtener autorización específica para ese destino.
4. Ejecuta el bootstrap en una terminal interactiva segura, desde el checkout y entorno autorizados.

La aplicación necesita `BETTER_AUTH_SECRET` y `BETTER_AUTH_URL` cuando se usa autenticación. No se incluyen valores de ejemplo válidos ni credenciales precargadas.

## Crear las tres cuentas iniciales

El comando rechaza cualquier modo que no sea explícito. `--help` no requiere ni consulta la base:

```sh
npm run bootstrap:admins -- --help
```

Después de aplicar las migraciones con autorización, ejecuta:

```sh
npm run bootstrap:admins -- --apply
```

El comando exige confirmación literal, solicita tres nombres/correos y lee cada contraseña sin mostrarla. Cada contraseña se pide dos veces y debe tener entre 12 y 128 caracteres. Las cuentas, credenciales con hash Better Auth, acceso base de enfermería, concesión de administración y auditoría segura se escriben en una transacción con el mismo advisory lock que las mutaciones administrativas. La concesión inicial registra actor nulo: no se inventa una identidad autenticada.

El proceso se detiene si ya existe alguna concesión de administración. No tiene endpoint web, no trae nombres/correos/contraseñas incorporados y no imprime detalles de cuentas, secretos o errores del controlador. El comando nunca se ejecuta automáticamente al importar el módulo.

**No se ejecutó `--apply`.** La ayuda y las pruebas locales usan un entorno controlado y no establecen conectividad, cookies, rollback ni bloqueo real de PostgreSQL. Una operación posterior debe validar el destino y la recuperación bajo autorización específica.

## Acceso de la aplicación

- El inicio de sesión no ofrece autorregistro. Administración crea las cuentas y asigna permisos explícitos.
- Todas las cuentas tienen el rol base de enfermería. Administración implica acceso EFA efectivo, pero no guarda una concesión EFA explícita.
- `/panel` requiere una sesión activa. `/admin-usuarios` requiere además administración vigente; las funciones servidor vuelven a autorizar cada operación.
- Cambios de estado y contraseñas revocan sesiones. El restablecimiento usa una contraseña nueva provista por administración, nunca la devuelve y no muestra secretos en auditoría.
- Los flujos operativos EFA no están implementados en esta etapa.
