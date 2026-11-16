# Compensatorios: resumen de continuidad del MVP

**Actualizado: 5 de noviembre de 2026.** El circuito central está implementado localmente. El usuario informa que creó y gestionó solicitudes, validó el circuito y recibió un correo real. El siguiente bloque es preparar la operación y entrega, no desarrollar otro importador ni agregar confirmaciones de recepción.

Este resumen no acredita despliegue, carga completa de datos reales ni inspección de producción. Ver también el [checklist vigente](./compensatory-mvp-pendientes.md).

## Implementación disponible

| Área | Funcionalidad |
| --- | --- |
| Padrón | Lectura del CSV combinado, revisión e importación de fichas por DNI; datos profesionales y correcciones desde la ficha. |
| Solicitudes anteriores | Lectura de JSON, vinculación con agentes persistidos y guardado individual revisado. Las tarjetas guardadas salen de los pendientes de esa revisión; los posibles duplicados no se descartan automáticamente. |
| Formulario público | Solicitud interna sin login, selección de nombre oficial, preservando el estilo y el contenido de Art. 68. Elegir un nombre no autentica identidad. |
| Correo del agente | Si existe en la ficha, se resuelve en el servidor sin revelar la dirección en la vista pública. Si falta, campo vacío obligatorio para la solicitud. Coordinación puede revisarlo y elegir «Agregar al perfil»; no hay actualización pública automática. |
| Carga administrativa | Registro de contingencia con autoría, como pendiente, sin aprobar ni descontar por el solo registro. |
| Horas | Banco manual, movimientos y correcciones auditadas; liquidaciones por períodos, saldo contable/reservado/disponible diferenciados. |
| Historial | Períodos, movimientos y solicitudes por agente, filtros y descarga CSV; acceso unificado desde «Gestionar horas». |
| Resolución | Aprobación/rechazo con responsable y fundamento. Aprobar reserva; si es para hoy, consume inmediatamente. Cancelar antes del corte libera la reserva. |
| Solicitudes vencidas sin resolver | Al actualizar la vista, salen de Pendientes y figuran en Historial como «Sin resolución · Fecha vencida». Se comparan con el día de servicio de Buenos Aires; no se cambia el estado persistido ni se descuentan horas o envían correos por vencer la fecha. |
| Quién cubre | Registro opcional del horario y personas que cubren, con confirmación parcial/completa e historial. No condiciona la aprobación ni genera créditos automáticos. |
| Correo de resolución | Revisión de destinatario y envío opcional en el mismo modal de aprobación/rechazo. La decisión y su notificación se guardan antes del envío; un fallo no revierte la resolución. |
| Copia adicional | «Enviar una copia», opcional y sin advertencia inicial de destinatario faltante. Requiere revisión y envío explícitos; no es un CC automático ni tiene destinatario fijo. |

### Reglas contables acordadas

- 2024 y 2025: saldos anuales disponibles ya depurados, agregados al banco sin descontar nuevamente horas utilizadas.
- 2026: liquidación mensual de horas generadas y tomadas. El neto mensual puede ser negativo y descontarse del saldo previo, respetando las validaciones del banco.
- Los consumos ya registrados por solicitudes no deben descontarse nuevamente en los períodos.
- Importar fichas o antecedentes no crea por sí solo saldo disponible ni presume aprobación de solicitudes antiguas.
- Ajustes manuales y períodos tienen propósitos distintos: no cargar las mismas horas por ambas vías.

## Resend y plantilla

El usuario registró `enfermeriaseliar.com.ar` en NIC Argentina, configuró DNS con Vercel y reportó el dominio habilitado para enviar en Resend. Informó guardar la clave como `EMAIL_API_KEY`. No se incluyen credenciales en este documento.

Remitente acordado:

```env
EMAIL_FROM="Coordinación de Enfermería · SeLIAR <notificaciones@enfermeriaseliar.com.ar>"
```

El correo usa HTML y texto alternativo. El encabezado lleva gradiente CSS naranja con color sólido de respaldo, sin imagen remota. Se conservaron las ediciones del usuario en el pie/contacto. Las nuevas resoluciones expresan las horas solicitadas sin mostrar el total crudo de minutos; se mantiene exactitud si es necesario usar horas/minutos. Las notificaciones anteriores conservan su texto guardado: no se reescriben ni reenvían automáticamente.

**Alcance del MVP:** informar aceptación por Resend, fallo definitivo o resultado incierto en la misma pantalla; revisión/reintento manual ante fallo definitivo, sin reenvío a ciegas de mensajes aceptados o inciertos. La aceptación no prueba entrega ni lectura.

El usuario decidió postergar confirmaciones posteriores de entrega/rebote. Un rebote posterior no se detecta automáticamente. Tampoco hay recuperación ampliada de resultados inciertos: la consulta depende del intento conservado en memoria y recargar no reconcilia por sí solo esos casos. Son límites conocidos, no nuevos bloqueos funcionales impuestos al MVP.

## Validaciones y evidencia

- **Usuario:** confirmó crear y gestionar solicitudes y validar el funcionamiento. No repetir ese QA ordinario como pendiente sin un defecto concreto. No equivale a verificar todos los casos de fallo ni todos los clientes de correo.
- **Suite completa más reciente:** 981/982 pruebas aprobadas; único fallo preexistente de texto en `EfaObservationPanel.test.tsx`. No presentar la suite como totalmente verde.
- **Vencidas sin resolución:** 16 pruebas enfocadas y TypeScript aprobados. Se comprobó el límite ayer/hoy/futuro con día de servicio explícito y la ausencia de cambio al estado del registro; queda aceptación visual del usuario.
- **Copia opcional:** 26 pruebas enfocadas y TypeScript aprobados. Gradiente: 10 pruebas enfocadas aprobadas, con RED → GREEN.
- **PostgreSQL aislado:** períodos, cobertura y notificaciones se probaron con datos ficticios en esquemas temporales de la copia local; según los respectivos registros, se verificaron transacciones, rechazos, idempotencia y concurrencia y se retiraron los esquemas. Las migraciones se probaron con precursores sintéticos mínimos, no con la reproducción completa de toda la cadena histórica.
- **Corrección del adaptador:** el reloj SQL devolvía texto y `sql<Date>` no lo convertía. Se añadió decodificación explícita a Date, prueba de regresión, repetición PostgreSQL y revisión independiente.
- **Correo real:** recepción informada por el usuario; el agente no envió correos reales durante los cambios de plantilla/interfaz.
- **Visualización del template:** el intento automático con Chromium no produjo capturas. Falta comprobar el diseño final en los clientes usados; el gradiente puede mostrarse como color sólido.

### Migraciones de la copia local

| Migración | Evidencia disponible |
| --- | --- |
| 0029–0031 | Aplicación/esquema verificados localmente según registros de implementación. |
| 0032 | Aplicación local con respaldo previo y lectura independiente del esquema. |
| 0033 | Aplicación manual informada por el usuario; sin lectura independiente posterior registrada. |
| 0034–0035 | Pruebas aisladas; aplicación manual posterior informada por el usuario, sin lectura independiente de esa aplicación. |

Estos hechos no determinan qué tiene aplicado producción actualmente.

## Pendientes reales y siguiente paso

### 1. Preparar producción — próximo bloque técnico

- Identificar despliegue/commit publicado y migraciones efectivamente aplicadas.
- Probar las migraciones pendientes contra una copia reciente de producción y comprobar compatibilidad con la aplicación anterior.
- Preparar respaldo verificable, procedimiento de aplicación y tratamiento de errores/bloqueos. No ejecutar ni reintentar migraciones a ciegas.
- Ordenar los cambios locales en unidades coherentes para entrega; publicación, push, mezcla y acceso remoto requieren autorización específica.
- Preparar ejecución automática y supervisada del consumo a fecha: el ejecutor actual se probó como `once`/`watch` local, restringido a PostgreSQL loopback, y no está acreditado como servicio de arranque o ejecución contra base remota.

### 2. Datos y corte — no falta un importador

- Importación de padrón, asociación de solicitudes y carga por períodos ya existen.
- Falta comprobar si la carga completa real se hizo en el destino definitivo; no afirmar que está ausente sin revisarla. Si ya se hizo, comprobar totales, asociaciones, duplicados y saldos, sin reimportar automáticamente.
- Acordar fecha de corte y saldos de apertura; mantener antecedentes y decisiones históricas documentadas sin inventar aprobaciones o descuentos.
- Coordinar el cambio de Google Forms al formulario interno y conservar solicitudes entrantes hasta el corte, evitando dos fuentes que resuelvan o envíen en paralelo.

### 3. Cerrar entrega

- Revisar los casos de error relevantes que falten, sin repetir el circuito ya aceptado.
- Comprobar template final, copia opcional y comportamiento móvil en los clientes utilizados.
- Resolver o aceptar explícitamente el fallo preexistente de EFA antes de usar la suite como evidencia de cierre.
- Ejecutar un piloto en el entorno y con los datos autorizados.

## Migrar producción antes de desplegar: revisión realizada

El usuario considera migrar primero y trabajar desde el proyecto local contra producción. **No se autorizó ni ejecutó acceso a producción en esta revisión.**

0029–0035 son mayormente aditivas, pero no garantizan ausencia de impacto: 0029/0030 validan restricciones sobre solicitudes existentes; otras agregan índices/claves foráneas y pueden requerir validación/bloqueos. Se desconocen versión y datos reales de producción.

El formulario anterior encontrado en el HEAD local llama a Google Apps Script. Si producción usa esa versión, una migración de base no cambia por sí sola ese formulario. HEAD no demuestra qué está desplegado. No se identificó afectación directa de tablas de horarios por esas migraciones, pero no se certificó todo el sitio público contra el despliegue real.

**Aplicación local + base de producción = operaciones reales.** Importaciones, saldos, decisiones y correos pueden afectar a personas reales. No es un entorno de prueba por ejecutarse en la computadora. Preferir una copia de preparación; cualquier operación productiva necesita autorización de destino, operación y credencial/sesión.

## Repositorio y reglas para retomar

- Rama observada: `feat/compensatory-manual-bank`; último commit observado: `ae2971d`.
- Hay numerosos cambios/archivos sin seguimiento de distintos bloques, más datos privados. El trabajo reciente no fue consolidado en commits ni publicado por el agente. No agregar carpetas completas ni incluir datos reales al entregar código.
- Lovable: no reescribir historia publicada ni hacer force push.
- No revelar claves ni copiar `.env` a documentación, pruebas, capturas o repositorio.
- Algunas copias temporales anteriores de pruebas pudieron quedar por bloqueo de limpieza. Revisar solo los directorios concretos registrados; no realizar borrados recursivos amplios.
- RDD se observó desactivado en el clon; no reactivarlo automáticamente. Las pruebas y verificaciones independientes de alto riesgo siguen siendo necesarias.

## Fuera del MVP

- Confirmaciones posteriores de entrega/rebote/lectura, por decisión expresa del usuario.
- Portal autenticado para agentes (C3).
- Cálculo automático de horas generadas (C4); no confundirlo con el consumo a fecha de horas ya aprobadas.

## Archivos para continuar

- [Checklist vigente](./compensatory-mvp-pendientes.md).
- [Plan original](./compensatory-hours-research-and-plan.md); las decisiones posteriores de este resumen prevalecen donde cambió el alcance.
- [Importación](../odd/tasks/compensatory-persistent-import.md), [períodos](../odd/tasks/compensatory-period-history.md), [UX de horas](../odd/tasks/compensatory-hours-ux.md).
- [Carga administrativa](../odd/tasks/compensatory-admin-request.md), [quién cubre](../odd/tasks/compensatory-coverage.md).
- [Correo y perfil](../odd/tasks/compensatory-request-email.md), [resolución y plantilla](../odd/tasks/compensatory-resolution-email.md).
- [Guía del ejecutor](./compensatory-lifecycle-operations.md).
