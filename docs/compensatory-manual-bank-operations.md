# Operación del banco manual de horas compensatorias

La sección **Coordinación → Compensatorios** permite mantener agentes identificados por DNI, registrar horas ya existentes mediante movimientos auditables y guardar solicitudes revisadas como antecedentes. No crea cuentas de acceso ni aprueba solicitudes.

## Uso rápido

La selección de agentes permite escribir apellidos o abrir las sugerencias del campo.
Selecciona una opción completa con nombre y DNI; un texto parcial no identifica un agente.
El saldo y **Registrar horas** quedan visibles. **Nuevo agente**, **Editar ficha**, movimientos,
solicitudes, auditoría y ayuda se despliegan solo cuando se necesitan.

1. Desde el panel privado de una cuenta administradora, abre **Coordinación** y selecciona **Compensatorios**.
2. Registra el agente con DNI y nombre; el correo es opcional. La referencia mensual comienza en 24 horas y puede editarse luego. El DNI no se modifica desde esta pantalla.
3. Selecciona al agente y usa **Registrar horas** para cargar el saldo inicial, un crédito o un débito. Informa horas y minutos, fecha efectiva y motivo o respaldo.
4. Revisa el saldo y el historial. Si hace falta corregir un movimiento, crea una reversión indicando su motivo y fecha; el registro original permanece visible.

## Reglas de operación

| Elemento           | Comportamiento                                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identidad          | El DNI identifica al agente; el correo no vincula una cuenta ni habilita acceso.                                                                     |
| Referencia mensual | El valor inicial es 24 horas. Es una referencia editable, no un tope del saldo ni una regla automática de solicitud.                                 |
| Saldo inicial      | Solo puede ser el primer movimiento del agente. Registra horas ya existentes; no anticipa horas futuras.                                             |
| Crédito o débito   | Cada asiento requiere cantidad positiva, fecha efectiva y motivo o respaldo. No se admite dejar el saldo por debajo de cero.                         |
| Auditoría          | El historial muestra fecha efectiva, fecha de registro, responsable, motivo y saldos anterior y posterior. Los cambios de perfil también se auditan. |
| Reversión          | Agrega un asiento inverso con su propio motivo y fecha. No edita ni elimina el original; un movimiento solo puede revertirse una vez.                |
| Desactivación      | Conserva el perfil, el historial y el saldo. No permite nuevos movimientos hasta reactivar al agente.                                                |
| Eliminación        | Solo un administrador puede eliminar agentes sin solicitudes ni movimientos. Requiere confirmar DNI y motivo; conserva una constancia auditada. Si hay historial, usa desactivación. |

## Alcance actual

- La implementación local permite importar agentes del CSV individualmente, guardar solicitudes revisadas y copiar un correo al perfil mediante una acción explícita y auditada.
- No se aprueban solicitudes ni se reservan horas, envían correos o modifican saldos por importar antecedentes.
- La migración `0026_compensatory_requests` se aplicó a la copia local autorizada. Se verificó una inserción sintética con reversión; no se cargaron los archivos reales ni se desplegó en producción.
- La migración `0027_tiresome_brother_voodoo` agrega el archivo de auditoría de eliminaciones y sus protecciones. Está aplicada en la copia local; su aplicación en producción requiere autorización independiente. No se eliminaron agentes reales durante las pruebas.
- La pantalla informa estados sin datos, carga y error de historial; un error de actualización posterior a un guardado indica explícitamente que el cambio pudo haberse registrado.

## Ficha laboral ampliada

### Eliminar un agente importado por error

1. Selecciona el agente y abre **Editar ficha**.
2. Abre la confirmación de **Eliminar agente**, comprueba nombre y DNI, escribe el DNI exacto y un motivo.
3. Confirma **Eliminar agente definitivamente**. Cancelar no modifica datos.

La pantalla espera a cargar solicitudes e historial. Si existen solicitudes o cualquier movimiento,
incluso movimientos cuyo resultado neto sea cero, el servidor rechaza la eliminación. Desactiva el
agente si necesitas retirarlo del uso sin perder su historial. La eliminación válida conserva una
instantánea de la ficha, sus auditorías previas, responsable, fecha de servidor y motivo. Una
respuesta perdida permite reintentar la misma operación sin duplicar la eliminación.

### Datos del perfil

El alta y la edición incluyen matrícula, situación de revista, función laboral,
región, teléfono de contacto, lugar de desempeño, condición operativa y función
operativa. Son campos opcionales; no determinan automáticamente si una cuenta está
activa ni cambian el banco de horas. Los cambios conservan responsable, motivo y
valores anteriores y posteriores. Las dos funciones son campos distintos.
`OBS.` no se incorpora.

La migración local `0025_lethal_nova.sql` agrega estas columnas y debe aplicarse
después de la base del banco (`0024`) en un entorno expresamente autorizado. No se
ejecutó contra una base real.

## Revisión local de vinculaciones

En **Coordinación → Compensatorios**, selecciona **Revisar vinculaciones**.
Primero importa los agentes aceptados del CSV. Para revisar solicitudes después,
basta abrir la exportación JSON: el selector usa los agentes ya guardados en la base,
sin necesitar volver a abrir el CSV. Los archivos
se leen en el navegador, sin subirlos al servidor. El límite es 2 MiB por archivo
y 5.000 filas; un archivo que supera los límites se rechaza, no se recorta.

El CSV combinado muestra procedencia, faltantes, campos con diferencias y los valores anteriores
disponibles. Esta información no confirma una identidad ni actualiza automáticamente perfiles
existentes. Revisa las diferencias antes de importar cada fila. Las filas sin DNI válido quedan
pendientes hasta corregirlo; matrícula sigue siendo opcional y `OBS.` se excluye.

La pantalla conserva las filas pendientes de identificación y propone coincidencias
por nombre. Una sugerencia no verifica la identidad. Selecciona explícitamente el
agente e inspecciona los datos antes de usar **Vincular y guardar**.
No se crean agentes con DNI faltante, inválido o duplicado. El campo
móvil de la solicitud identifica normalmente una ambulancia y no se usa como teléfono
ni como clave de identidad.

Las selecciones y los estados temporales de revisión se pierden al salir, recargar
o reemplazar un archivo; los antecedentes guardados permanecen en la base.
Volver temporalmente al banco conserva la revisión montada.
**Importar agente** guarda un perfil; **Vincular y guardar** agrega el antecedente al agente elegido;
**Copiar correo revisado al perfil** actualiza el correo con auditoría. Las posibles
duplicaciones requieren revisión explícita. No se interpreta una solicitud como
aprobación ni se modifican saldos.

## Procedimiento repetible: local y producción

El flujo objetivo es **CSV persistente → JSON en memoria → revisar y guardar cada solicitud**.
El selector usa los agentes de la base destino. Después de guardar, la tarjeta sale
de pendientes y el registro permanece en el historial del agente. El filtro
**Guardadas en esta revisión** permite inspeccionar las confirmaciones de la sesión.

### Ensayo en la copia local

1. Confirmar la base destino y las migraciones aplicadas. Usar una cuenta administradora.
2. Validar el CSV e importar los perfiles aceptados. Conservar matrícula original y mostrar
   licenciatura cuando corresponda a su letra `L`. Corregir filas con DNI faltante o duplicado;
   no fusionar personas ni sobrescribir perfiles por nombre.
3. Leer el JSON en memoria del navegador, sin almacenar el archivo en el servidor ni en
   almacenamiento persistente del navegador. La casilla **Solo fechas futuras**, activada por
   defecto, muestra las solicitudes cuya **fecha solicitada** sea hoy o posterior, según el día
   de Buenos Aires, no la fecha de envío. Desactivarla muestra también fechas anteriores sin
   volver a cargar el archivo; se puede alternar sin perder las vinculaciones de la revisión.
   Se aceptan fechas `YYYY-MM-DD` y `dd/MM/yyyy`; los datos originales no se reescriben.
   Con la casilla activada, las solicitudes anteriores se omiten con un aviso del total.
   Las fechas no válidas permanecen
   visibles para revisión, sin permitir guardarlas. El filtro no modifica el JSON ni Google Forms.
4. Para cada solicitud, mostrar los datos originales y permitir elegir entre los agentes
   ya guardados. Las sugerencias por nombre requieren inspección humana.
5. Usar la acción individual de vincular y guardar. Enviar únicamente los campos revisados
   y el identificador interno del agente, no el JSON completo ni el ID de respuesta de origen.
   Revisar aparte duplicados y correos diferentes del perfil.
6. Retirar la tarjeta de pendientes solo tras confirmación de guardado del servidor.
   Mantener el registro accesible en el historial del agente. Un error conserva la tarjeta;
   un reintento debe reutilizar la misma operación para evitar duplicar el guardado.
7. Verificar el historial tras recargar. Al cerrar la revisión se descartan los datos temporales;
   los registros guardados permanecen y lo no guardado necesita volver a leerse del archivo.
   El archivo original de la computadora no se borra.

### Repetición futura en producción

1. Obtener autorización expresa para el destino, la operación y la cuenta o sesión de producción.
   La autorización de la copia local no habilita acceso remoto.
2. Realizar respaldo y verificar el estado de migraciones antes de aplicar las necesarias.
3. Repetir el mismo procedimiento con los archivos autorizados y registrar cantidades de agentes,
   solicitudes guardadas y casos pendientes, sin copiar datos personales a logs o al repositorio.
4. Verificar el historial y conciliar pendientes. No copiar IDs internos de la base local a producción:
   el mapeo debe usar los agentes disponibles en la base destino.

Recargar o cerrar la revisión pierde los vínculos aún no guardados. Volver a leer el JSON
no debe eludir la revisión de posibles duplicados de registros ya importados.

## Verificación de interfaz sin base de datos

El probe opcional utiliza los componentes reales con una API ficticia y solo un
servidor HTTP local. Requiere `esbuild` del proyecto, un módulo Playwright ya
instalado y Microsoft Edge disponible; no instala herramientas ni accede a la base.

```sh
node scripts/probes/compensatory-bank-ui.cjs /ruta/al/modulo/playwright
node scripts/probes/compensatory-directory-review-ui.cjs /ruta/al/modulo/playwright
```

Comprueba el aislamiento del borrador al cambiar de agente, reintentos tras una
respuesta perdida, descarte de historiales desactualizados, colapso de la barra
lateral y navegación móvil. Genera el bundle únicamente en un directorio temporal.
No carga CSS: verifica interacción, no apariencia ni contraste visual.

