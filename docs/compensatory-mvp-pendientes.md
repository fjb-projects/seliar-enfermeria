# Compensatorios: pendientes del MVP

**Estado al 5 de noviembre de 2026:** el circuito principal está implementado localmente y el usuario informó la recepción de un correo real de resolución. El usuario acotó el correo del MVP al resultado inmediato del envío y al reintento manual ante fallo definitivo; no exige confirmaciones posteriores de entrega/rebote. C2 todavía requiere conciliación de datos, aceptación integral y preparación operativa. Esta lista contrasta el [plan original](./compensatory-hours-research-and-plan.md), los registros de implementación y la [guía del ejecutor](./compensatory-lifecycle-operations.md). No acredita despliegue ni conciliaciones no verificadas.

## Base implementada localmente

**Validación funcional informada por el usuario:** creó y gestionó solicitudes y confirmó que el circuito funciona. No repetir ese QA ordinario como pendiente sin un defecto concreto; los casos de error específicos y la preparación productiva se evalúan por separado. [Resumen de continuidad](./compensatory-mvp-resumen-2026-11-05.md).

- Agentes por DNI, banco manual, movimientos y correcciones auditadas; importación y revisión de padrón y solicitudes.
- Bandeja e historial, clasificación explícita, decisiones administrativas, reserva de saldo, cancelación previa y consumo al día efectivo. Una solicitud histórica sin decisión documentada no se presume aprobada.
- Ejecutor `once`/`watch` probado localmente. La migración 0028 se aplicó a la copia local; el registro indica que las tres solicitudes existentes entonces seguían sin clasificar.
- Formulario público interno, carga por períodos anuales/mensuales y acceso unificado **Gestionar horas** implementados localmente; historial por agente y descarga CSV filtrada. Migraciones 0029–0031 verificadas en copia local. QA visual del usuario pendiente; sin publicación.
- Carga administrativa de contingencia validada localmente con autoría y estado pendiente; verificación automatizada, navegador sintético y 10 casos reales PostgreSQL en esquema aislado aprobados. Usuario informa QA manual aprobado. No hubo carga real. [Guía de contingencia](./compensatory-admin-request-operations.md).
- Registro opcional de quién cubre y sus horarios, confirmación parcial/completa e historial; no cambia la aprobación ni genera créditos automáticos. Migración 0032 aplicada y verificada en copia local; aceptación integral pendiente.
- Solicitudes pendientes cuya fecha ya pasó: se excluyen de la bandeja activa y se muestran en Historial y su detalle como «Sin resolución · Fecha vencida», usando el día de servicio del servidor. Es clasificación visual al actualizar los datos, sin mutación de estado, saldo ni envío de correo; no se presume aprobación o uso.
- Correo del perfil resuelto en el servidor sin mostrar la dirección en el formulario público; si falta, campo obligatorio en la solicitud y acción explícita «Agregar al perfil» en Coordinación. El usuario informa que aplicó 0033; no hubo lectura independiente de esa aplicación.
- Decisión y envío opcional integrados en el mismo modal, con revisión del destinatario; notificaciones e intentos persistidos, sin revertir la decisión si falla el correo. 0034/0035 y el servicio se probaron con datos ficticios en esquemas aislados; el usuario informa su posterior aplicación manual. Resend, dominio y recepción de un correo real informados por el usuario; no equivalen a seguimiento automático de entrega.
- Plantilla HTML con alternativa de texto y horas solicitadas legibles. Encabezado con gradiente CSS y naranja sólido de respaldo; sin imagen remota, conservando el contacto agregado por el usuario. Su visualización aún requiere QA en clientes de correo.

Fuentes: [banco manual](../odd/tasks/compensatory-manual-bank.md), [importación persistente](../odd/tasks/compensatory-persistent-import.md), [bloque operativo](../odd/tasks/compensatory-operational-workspace.md), [UX unificada](../odd/tasks/compensatory-hours-ux.md), [carga administrativa](../odd/tasks/compensatory-admin-request.md), [correo y perfil](../odd/tasks/compensatory-request-email.md) y [resoluciones por correo](../odd/tasks/compensatory-resolution-email.md). Sigue identificado un fallo preexistente de texto de EFA; los resultados automatizados no sustituyen pruebas con datos operativos ni aceptación visual.

Verificación del 5 de noviembre: gradiente 10/10, copia opcional 26/26 y solicitudes vencidas 16/16 pruebas enfocadas; TypeScript aprobado. Última suite completa 981/982, único fallo de texto de EFA ya identificado. Sin envío real ni nueva comprobación visual de clientes de correo en estos cambios.

## Checklist para completar C2

### Datos y solicitudes

- [ ] Conciliar la fuente completa de solicitudes y el padrón: identificar registros faltantes, ambiguos y posibles duplicados; verificar identidades y contactos antes de asociarlos. El flujo de revisión y guardado existe localmente, pero no hay evidencia de que la fuente completa esté conciliada. No usar el ID de Drive como identidad persistida: prevalece la decisión posterior documentada en el registro de importación.
- [ ] Acordar y verificar saldos de apertura, fecha de corte, responsables y procedimiento de corrección; realizar un piloto y conciliación del banco antes de operar con saldos reales.
- [ ] Completar el corte operativo del formulario Google al nuevo formulario interno sin login, ya implementado localmente; validar que todos los antecedentes se concilien y las nuevas solicitudes lleguen a Pendientes. No se realizó un despliegue o corte remoto.
- [x] Validar localmente la carga administrativa de contingencia con autoría real, sin aprobar ni descontar al registrar; prueba PostgreSQL sintética aprobada y QA manual informado como aprobado por el usuario. No equivale a despliegue/piloto productivo.
- [ ] Conciliar y clasificar las solicitudes según la fecha de corte acordada: pasadas como evidencia histórica; de hoy o futuras como pendientes sujetas a revisión. Preservar decisiones históricas documentadas sin inventarlas ni descontar por el solo paso del tiempo.

### Resolución y comunicación

- [ ] Identificar solo los casos visuales/móviles o de error que no cubra la validación funcional ya informada; no reabrir todo el circuito por defecto. [Guía de cobertura](./compensatory-coverage-operations.md).
- [x] Implementar localmente la decisión con notificación persistida y el envío explícito revisado al agente, sin deshacer la resolución por un fallo de envío; probar rollback, idempotencia y concurrencia en esquema PostgreSQL aislado. Recepción de prueba real informada por el usuario.
- [ ] Cerrar QA del resultado inmediato: aceptación por Resend, fallo definitivo con revisión/reintento manual y resultado incierto sin reenvío a ciegas. Recargar la vista no resuelve automáticamente un resultado incierto; dejar explícito ese límite. Un rebote posterior no se detecta automáticamente en este alcance.
- [x] Presentar el segundo correo como «Enviar una copia», opcional, sin un aviso inicial de destinatario faltante. No se envía automáticamente; se conserva revisión explícita y los controles de estado. No equivale a una copia CC automática ni establece un destinatario administrativo fijo.
- [ ] Validar el template final en Gmail/Outlook y celular, incluyendo respaldo de color cuando el gradiente no se soporte, manteniendo legibilidad.
- [ ] Resolver y documentar las decisiones operativas aún aplicables: autoridad y permisos, excepciones y cómputo del cupo. Resend y revisión explícita del destinatario ya están definidos; no volver a tratarlos como decisiones abiertas.

### Operación y entrega

- [ ] Diseñar y autorizar por separado el entorno de operación, migraciones, despliegue y piloto. Mantener el trabajo separado de `main` hasta una decisión de entrega.
- [ ] Preparar arranque automático, supervisión y recuperación del ejecutor en ese entorno; comprobar zona horaria, recuperación tras caída e idempotencia. El `watch` local no es un servicio de arranque y el ejecutor actual acepta únicamente PostgreSQL loopback: no asumir que ya sirve para una base remota.
- [ ] Verificar el circuito integral con datos y destino expresamente autorizados: formulario, conciliación, resolución, reserva, cobertura, correo y consumo. Investigar o aceptar explícitamente el fallo preexistente de la suite antes de usarla como evidencia de cierre.

## Fuera de este MVP

- Confirmaciones posteriores de entrega/rebote y lectura: diferidas por decisión del usuario; la aceptación del proveedor no confirma recepción. El seguimiento con webhooks y recuperación ampliada puede evaluarse después.
- Portal y solicitud autenticada del agente (C3): solo con una decisión expresa posterior.
- Cálculo automático de horas generadas (C4): etapa posterior; no confundirlo con el consumo automático de reservas de C2.

## Próximo paso propuesto

Preparar la puesta en funcionamiento: identificar versión/migraciones de producción, verificar compatibilidad con la versión publicada y una copia de la base, acordar respaldo/aplicación y ejecución supervisada del consumo. Los importadores ya existen; comprobar la carga real y los saldos es preparación operativa, no una función faltante. Si la carga ya se realizó, verificarla sin reimportar a ciegas. Terminar únicamente el QA específico no cubierto y preparar corte/piloto autorizados. No se accedió a producción en la revisión de compatibilidad.
