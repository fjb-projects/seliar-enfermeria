# Operación del banco manual de horas compensatorias

La sección **Coordinación → Compensatorios** permite mantener agentes identificados por DNI y registrar horas ya existentes mediante movimientos auditables. No crea cuentas de acceso ni tramita solicitudes de horas.

## Uso rápido

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

## Alcance actual

- No existe interfaz de importación; la importación queda diferida hasta acordar el formato de origen.
- No se crean ni reservan horas futuras, solicitudes, aprobaciones, entregas, avisos por correo ni acumulaciones automáticas.
- La migración se prepara en el repositorio, pero **no se aplicó a una base de datos real**. Tampoco se cargaron datos reales ni se desplegó la función.
- La pantalla informa estados sin datos, carga y error de historial; un error de actualización posterior a un guardado indica explícitamente que el cambio pudo haberse registrado.

## Verificación de interfaz sin base de datos

El probe opcional utiliza los componentes reales con una API ficticia y solo un
servidor HTTP local. Requiere `esbuild` del proyecto, un módulo Playwright ya
instalado y Microsoft Edge disponible; no instala herramientas ni accede a la base.

```sh
node scripts/probes/compensatory-bank-ui.cjs /ruta/al/modulo/playwright
```

Comprueba el aislamiento del borrador al cambiar de agente, reintentos tras una
respuesta perdida, descarte de historiales desactualizados, colapso de la barra
lateral y navegación móvil. Genera el bundle únicamente en un directorio temporal.
No carga CSS: verifica interacción, no apariencia ni contraste visual.

