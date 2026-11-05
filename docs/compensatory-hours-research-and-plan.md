# Horas compensatorias: investigación y plan gradual

**Fecha:** 2026-10-26, actualizado el 2026-10-27. **Estado:** exportador y C1 (agentes por DNI y banco manual) preparados localmente y verificados con datos simulados. Migración real, piloto y publicación pendientes; importador expresamente diferido hasta disponer del formato real.
**Prioridad:** P1, antes del [banco de candidatos y ATS](./candidate-bank-ats-research-and-plan.md).
**Alcance de esta entrega:** investigación pública, inspección local, documentación y exportador con pruebas simuladas; sin acceso a respuestas reales, bases, buzones o despliegues.

## Recomendación

El primer sistema utilizable debe reunir **gestión administrativa, banco manual de horas, solicitudes del formulario existente, historial por agente, resolución manual y envío de correos**. Se divide en C1 (base administrativa) y C2 (circuito completo), pero C1 por sí sola no cumple el alcance inicial actualizado.

**Decisión del usuario:** conservar la manera actual de cargar solicitudes, sin exigir inicio de sesión al agente. El portal y la carga con usuario autenticado quedan diferidos hasta que el usuario decida implementarlos. Los correos se adelantan a C2 y no dependen de ese portal. La administración sí debe actuar con su cuenta para dejar autoría verificable.

### Clasificación

| Aspecto | Clasificación |
| --- | --- |
| Tipo de producto | Gestión operativa de personal, banco de tiempo y autorizaciones; no solamente formulario o calendario. |
| Tamaño | Feature grande por sus entregas separadas, reglas pendientes y recuperación entre sesiones; dividir por resultados utilizables. |
| Riesgo de implementación | Alto: datos e importaciones (1), permisos e identidad (2), integración sin romper el formulario existente (3), concurrencia (4), correo y procesos programados (5). |
| MVP actualizado | C1 + C2: agentes, banco manual, importación, historial, solicitudes actuales, carga administrativa, decisiones y correos. |
| Primer circuito de decisiones | C2: pendientes resueltas manualmente con responsable, fundamento y cobertura; correo al agente y aviso a administración. |
| Fuera del primer MVP | Cálculo automático, integración de calendarios y acceso/carga autenticada del agente. |

## Pedido y reglas todavía no validadas

Se conservan como requisitos declarados, no como conclusiones normativas:

- “se excede de las 160 ha mensuales”: se interpreta provisionalmente como 160 horas; confirmar alcance y método de cómputo.
- “cuando le toca trabajar un feriado”, “cubre un evento” y “realiza un traslado hacia otra localidad”: causas de generación; faltan equivalencias y reglas de acumulación.
- Aclaración confirmada: “el agente puede prorratear lo” y “debería ser editable por agente el límite mensual”. Se admite distribuir horas entre solicitudes; 24 h/mes es el valor habitual, no un bloque indivisible ni un límite universal fijo. El límite se configura individualmente; su administración y vigencia deben quedar auditadas.
- “debe hacerlo con anticipación”: falta plazo, unidad y tratamiento de urgencias.
- “cada solicitud debe ser aprobado rechazada” y debe registrar “con quién será cubierto”: resolución explícita, fundamento e identificación de cobertura cuando se defina. Aclaración posterior: en el MVP no se exige cobertura identificada ni confirmada para aprobar, porque la disponibilidad puede surgir a último momento.
- “en una primera instancia me gustaría mínimamente poder cargar los agentes”: no exigir que cada agente tenga una cuenta para registrar su banco.
- “cargar sus solicitudes pasadas si fueron aprobadas o no”: importar antecedentes sin inventar decisiones ni fechas.

**No se investigó una regla laboral provincial específica:** todavía faltan jurisdicción, régimen de empleo y disposición/convenio aplicable. Las cifras informadas no se presentan como derechos legales universales. Su validación corresponde a la administración responsable y, si aplica, asesoría jurídica.

## Qué existe y qué falta

Inspección del checkout local; no prueba de funcionamiento en producción. Las referencias corresponden al código observado en esta fecha.

| Evidencia local | Consecuencia para el diseño |
| --- | --- |
| `src/routes/panel.tsx:7-22` y `src/routes/admin-usuarios.tsx:19-36` | Hay entrada autenticada y protección administrativa; integrar nuevas herramientas en esa navegación, no crear otra aplicación. |
| `src/lib/access.ts:1-12,31-37` | Los roles actuales son `efa` y `admin`; no hay un rol separado llamado enfermero. Diseñar el vínculo agente-cuenta y sus permisos sin equiparar EFA con todo el personal. |
| `src/routes/compensatorio.tsx:26-37,135-147` | El formulario actual confirma el envío; no representa una resolución administrativa. |
| `src/lib/compensatorio.functions.ts:78-135` | Se envía a Apps Script y se recibe estado de correo. No se persiste allí una solicitud local con decisión y saldo. No se inspeccionó el sistema remoto: podría conservar información fuera de esta aplicación. |
| `src/lib/published-schedule.functions.ts:16-38` | Existe integración del cronograma publicado; no demuestra asistencia efectiva ni una fuente suficiente para liquidar horas. |
| `src/db/index.server.ts:1-16` | Ya se usa PostgreSQL/Neon con Drizzle; no hay motivo demostrado para otra base. |
| `src/db/schema.ts:1041,1092,1186`; `src/lib/efa-communications.server.ts:164-190` | Hay patrones EFA de transacciones, auditoría y avisos por destinatario. Reutilizar el enfoque; no mezclar historias laborales nominales con observaciones EFA. |

El mapeo no encontró un banco compensatorio, identidad laboral separada ni calendario de feriados persistidos. Hay avisos internos EFA, pero **no se verificó un sistema general completo de notificaciones laborales ni de correo transaccional**. Revisar sus adaptadores y despliegue al iniciar C2.

## Fases y criterio de inauguración

El alcance funcional aclarado por el usuario se incorpora abajo. C1 tiene autorización de implementación local; quedan definiciones operativas por completar y pruebas por realizar. Las siguientes fases y el despliegue requieren su autorización correspondiente.

| Fase | Alcance utilizable | Condición para comenzar a usarla | Límite explícito |
| --- | --- | --- | --- |
| C0 — Acuerdo operativo | Definir identidad de agentes, responsables, corte inicial, evidencia, unidad de tiempo y correcciones. Resolver las reglas necesarias para la próxima fase. | Administración valida ejemplos y responsable del saldo inicial; se identifica origen de los datos. | No necesita resolver toda la automatización para habilitar C1. |
| C1 — Base administrativa del MVP | Alta/desactivación de agentes; límite mensual individual editable; saldo de apertura; créditos manuales por causa; reversión/corrección con fundamento; listado y cronología. | Piloto concilia con la fuente; el prorrateo acumula por agente/mes y límite vigente; reintentos no duplican saldo; recuperación desde backup probada en entorno seguro. | Habilita preparar datos, pero no se presenta como el MVP completo pedido. No requiere cuentas de agentes. |
| C2 — MVP operativo con correo | Importar todas las solicitudes recuperables del formulario actual; historial por agente; seguir recibiendo por ese formulario; carga administrativa manual; pendientes resueltas por admin con identidad, fecha, fundamento y cobertura; enviar correos y conservar intentos. | Importación conciliada e idempotente; separación histórico/pendiente validada; una nueva solicitud llega sin login; decisión manual notifica sin duplicación; autoría y correcciones trazables; no hay doble descuento. | Fechas pasadas no prueban aprobación ni disfrute. No se crea portal ni se exige login al solicitante. |
| C3 — Portal del agente, diferido | Solo cuando el usuario lo decida: vincular cuenta, consulta propia, solicitud autenticada, avisos internos al agente y acuse explícito. | Nueva autorización de alcance; permisos cruzados y versión compartida verificados. | No es requisito de C1/C2 ni condición para recibir correos. No se programa automáticamente como próxima entrega. |
| C4 — Devengamiento automático | Calendario aplicable, trabajo efectivo, feriados, cierre mensual, eventos y traslados; cálculo trazable con reglas versionadas y conciliación. | Ejecutar primero en modo comparación sin escribir al banco; administración valida resultados; reprocesar un período no duplica créditos; correcciones quedan auditadas. | No otorgar horas por una planificación futura ni por el mero cambio de fecha. |

**Orden actualizado:** C0 → C1 → C2. C4 queda para una etapa posterior de automatización; C3 requiere decisión expresa del usuario y no tiene una posición comprometida. Se retira la recomendación anterior de adelantar el portal: el correo permite comunicación inicial sin cambiar cómo se solicita.

### Ubicación y agrupación de herramientas

Organización de navegación aceptada por el usuario: agregar un apartado administrativo **“Coordinación”** como centro de gestión del servicio, que reúna **“Usuarios y accesos”** (actual administración de cuentas), **“Compensatorios”** y la **“Coordinación EFA”** existente. Debe admitir futuras herramientas y el trabajo híbrido con Drive. No significa crear un nuevo rol ni ampliar permisos: se accede con la cuenta administrativa actual.

Estructura aceptada: **Panel → Coordinación → Usuarios y accesos / Compensatorios / Coordinación EFA**. La administración de cuentas se incluye en este centro, no queda fuera: sirve a usuarios actuales y futuros, no solo al uso EFA. Cada módulo conserva su pantalla y responsabilidad; la pantalla de cuentas no se convierte en un formulario que mezcle todos los trámites. El nuevo acceso debe ser coherente entre panel, cabecera y navegación móvil.

**Salvedad de aceptación visual:** la barra lateral de escritorio debe poder contraerse a iconos y expandirse para recuperar espacio. Reutilizar el comportamiento existente de Coordinación EFA (`collapsible="icon"` y `SidebarTrigger`); el boceto entregado todavía no incluye ese control. La aceptación del diseño no autoriza asumir las reglas operativas aún pendientes.

“Usuarios y accesos” debe contemplar creación, permisos, estado de cuenta y el mecanismo de entrega/activación de acceso que se defina. Actualmente `src/components/AccountAdminForm.tsx` pide una contraseña inicial e indica comunicarla por un canal seguro; no se verificó un envío automático de credenciales. Este agrupamiento no autoriza agregarlo ni ampliar permisos automáticamente. No crear un repositorio de contraseñas para la coordinación.

Mantener separados el **agente** como persona del padrón y el **usuario** como cuenta de acceso. Un agente puede tener historial y banco de horas sin cuenta; crear su ficha no obliga a crear login ni habilita el portal diferido. Cuando corresponda, se vincularán ambas identidades.

El trabajo híbrido con Drive se incorpora como contexto de gestión: definir qué recursos siguen allí y sus accesos o integraciones concretas antes de añadirlos. No se presupone una migración masiva, un módulo de Drive ya implementado ni autorización para entrar a unidades o archivos remotos.

La entrada a Coordinación puede ser una página sencilla con accesos a cada herramienta; cada módulo mantiene sus propias pantallas. Agrupar la navegación no requiere cambiar de inmediato las URL existentes ni romper enlaces a `/coordinacion-efa`. El formulario público de compensatorios conserva su ubicación y funcionamiento. La contrapartida es un nivel adicional de navegación, a cambio de evitar sumar un botón global por cada herramienta nueva.

Esta sección define la organización aceptada, no una implementación ni un rediseño general de la aplicación. Los recursos del servicio/Drive se incorporarán gradualmente con alcance específico; no requieren migrarse para habilitar el MVP de compensatorios.

### Pantallas mínimas

- C1: herramienta administrativa “Horas compensatorias”, listado de agentes con saldo, límite mensual editable y ficha con movimientos; acciones “Registrar horas”, “Registrar débito” y “Corregir movimiento”.
- C2: bandeja de pendientes y detalle con fechas/horas, saldo, cobertura, fundamento, responsable de resolución, estado del correo y cronología. Historial importado separado de pendientes. Acción de carga manual para administradores; el agente conserva el formulario actual.
- C3: “Mis compensatorias” con saldo disponible/reservado, estado explícito e historial compartido. Los avisos enlazan a la versión de la decisión y muestran si fue reemplazada.

### Criterios de UI: continuidad con Coordinación EFA y Laws of UX

**Directriz del usuario, 2026-10-27:** «Sobre ui investiga lawsofux.com y además seguí manteniendo la consistencia visual que ya hay en coordinación EFA para crear todo lo nuevo que se precisa hacer».

**Resultado:** las nuevas pantallas deben sentirse parte del mismo producto. Laws of UX orienta decisiones de interacción; no se copia el aspecto de ese sitio ni se introduce otra paleta, tipografía o biblioteca de componentes. Son principios de diseño, no garantía de usabilidad ni sustituto de pruebas con usuarios. Las aplicaciones siguientes son recomendaciones específicas para este MVP, no reglas de negocio deducidas de esas leyes.

#### Base existente verificada en código

| Referencia local | Mantener / aplicar |
| --- | --- |
| `src/routes/coordinacion-efa.tsx:44-50`; `src/components/PrivateAccountShell.tsx:70-87` | Composición del área con `PrivateAccountShell`, ancho completo y superficie `calm`; conservar la relación entre superficie de contenido y fondos del shell. No convertir cada sección en un dashboard con estética distinta. |
| `src/styles.css:48-50,69-92` | Familias existentes Archivo SemiCondensed/Manrope y tokens semánticos de fondo, texto, primario, borde, aviso y error; radio base actual. Sin fuentes nuevas ni colores aislados por módulo. |
| `src/components/EfaCoordinationLayout.tsx:300-342` | Jerarquía de título/contexto, separaciones `space-y-4` y `gap-6`, navegación lateral colapsable de escritorio; referencia estructural, no componente genérico listo para todos los dominios. |
| `src/components/EfaCoordinationLayout.tsx:202-296` | Navegación de secciones en sheet móvil y filtros en drawer separado. Mantener etiquetas, espacio táctil y comportamiento por teclado. |
| `src/components/EfaCoordinationPanel.tsx:82-109` | Resumen sobrio, lista y dos vacíos diferentes: todavía no hay registros / los filtros no tienen coincidencias. Tabla o tarjetas según ancho disponible en el contenedor principal. |
| `src/components/EfaCoordinationGuardTable.tsx:29-30,68-69,108-128`; `src/components/EfaCoordinationGuardCard.tsx:67-84` | Encabezados compactos y detalle expandible con semántica accesible; conservar un patrón equivalente donde el detalle sea breve. |
| `src/components/EfaCoordinationGuardDetail.tsx:114-121,197-202`; `src/components/ui/` | Primitivas existentes Button, Input, Badge, Table, Dialog, Sheet y mensajes de error/estado. No duplicar controles ni acoplar las compensatorias al modelo de guardias para reutilizar su apariencia. |

La lista EFA alterna presentación con `md:@[44rem]/main`, no únicamente con el ancho de ventana. Al introducir navegación compartida, evitar dos barras laterales simultáneas que estrechen el contenido y activen tarjetas innecesariamente. Los filtros actuales están ligados al dominio EFA; reutilizar las primitivas y el patrón, no sus campos ni la dependencia de datos de guardias.

Esta verificación fue estructural: lectura de fuentes por un explorador `gpt-6-luna` y comprobación puntual del agente principal. No se ejecutó la aplicación ni se verificaron capturas, medidas o accesibilidad en navegador. Mantener apariencia no implica copiar posibles defectos: comprobar contraste de texto sobre gradientes, foco y controles estrechos antes de aprobar el resultado.

#### Research aplicado

Fuentes consultadas el 2026-10-27. Cada fila separa el principio publicado de nuestra aplicación propuesta.

| Principio | Aplicación concreta a Coordinación y Compensatorios |
| --- | --- |
| [Jakob: expectativas y modelos familiares](https://lawsofux.com/jakobs-law/) | Mantener posiciones, lenguaje, filtros y comportamiento ya aprendidos en EFA. Acceso a Coordinación desde panel y navegación existente; conservar enlaces directos y el formulario público. |
| [Hick: cantidad y complejidad de elecciones](https://lawsofux.com/hicks-law/) | Hub con las herramientas reales, sin tarjetas de módulos inexistentes. Compensatorios abre en solicitudes pendientes; el resto se encuentra mediante filtros. Lista con acción clara “Revisar solicitud”; no ofrecer aprobación/rechazo de una fila sin contexto ni precargar una decisión para hacerla parecer recomendada. |
| [Región común: agrupación visual](https://lawsofux.com/law-of-common-region/) y [proximidad](https://lawsofux.com/law-of-proximity/) | Separar resumen, solicitud, decisión, cobertura, comunicación e historia. Estado “Aprobada” junto a los datos de la decisión; cobertura pendiente dentro de cobertura; correo fallido dentro de comunicación. Evitar una etiqueta genérica “Pendiente” que mezcle responsabilidades. |
| [Fitts: tamaño, distancia y separación de objetivos](https://lawsofux.com/fittss-law/) | Acciones visibles y con texto, cerca del contenido sobre el que actúan; sostener los tamaños táctiles actuales y espacio entre confirmar/cancelar. No esconder decisiones importantes en iconos pequeños o acciones solo por hover. |
| [Carga cognitiva](https://lawsofux.com/cognitive-load/) y [Tesler: complejidad que no desaparece](https://lawsofux.com/teslers-law/) | Mostrar saldo disponible/reservado y horas solicitadas al resolver; no obligar a reconstruirlos desde la historia. Conservar autoría, motivos y evidencia aunque el resumen sea corto. Desplegar detalles secundarios sin convertir una tarea simple en un asistente de muchos pasos. |
| [Doherty: respuesta y percepción de espera](https://lawsofux.com/doherty-threshold/) | Al guardar, indicar procesamiento y prevenir envíos repetidos; conservar los datos si falla. Confirmar la decisión solo después de persistirla. El correo puede seguir pendiente sin presentar la aprobación como fallida. No introducir demoras artificiales, porcentajes inventados ni prometer un tiempo de backend a partir del umbral del artículo. |

#### Composición propuesta de las pantallas

- **Inicio de Coordinación:** accesos consistentes a Usuarios y accesos, Compensatorios y Coordinación EFA. Recursos del servicio se agregan cuando haya recursos concretos definidos, sin prometer una integración de Drive todavía inexistente.
- **Solicitudes:** encabezado/contexto, resumen compacto y listado. Entrada por pendientes; acceso a otras decisiones y antecedentes mediante filtros por agente, período y estado. Mantener separación entre la decisión, la cobertura y la comunicación; en móvil mostrar la misma información esencial en tarjetas, no una tabla ancha encogida.
- **Detalle de solicitud:** resumen del agente, fecha y horas; disponible/reservado; decisión con fundamento; cobertura asignable después; estado de correo e historia. Antes de confirmar una resolución, mostrar persona, fecha, horas y resultado elegido. No confundir “Cancelar esta operación” con “Cancelar compensatorio”. Un fallo de correo ofrece seguimiento sin volver a resolver la solicitud.
- **Agentes y ficha:** búsqueda por identidad y resumen de horas; detalle con movimientos y solicitudes de esa persona. “Registrar horas” abre una carga con causa y fecha; la corrección conserva el original y explica su efecto. El límite mensual es referencia individual: no sustituye la cantidad pedida ni crea un rechazo automático al recibirla.

Este boceto funcional orienta la próxima validación visual; no fija todavía cada columna o el uso de página/dialog para todos los detalles. Una cronología extensa puede necesitar una página propia aunque EFA tenga detalles expandibles. Esa adaptación conserva el lenguaje visual sin copiar una composición que resulte estrecha para otro dominio.

#### Estados, accesibilidad y verificación futura

- Distinguir carga inicial, lista vacía, filtros sin coincidencias, guardado en curso, éxito y error recuperable. Conservar filtros y contexto al volver desde una ficha; no mostrar contenido inventado como sustituto de un error.
- Usar texto además de color: por ejemplo, “Aprobada”, “Cobertura pendiente” y “Correo pendiente de envío” son estados independientes. El recibo de solicitud no se presenta como autorización. El histórico importado no se presenta como una decisión recién tomada.
- Mantener labels asociados, orden de foco, teclado y regreso de foco al cerrar overlays. Los avisos de estado deben poder anunciarse sin obligar a mover el foco. [W3C: mensajes de estado](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).
- Conservar los controles táctiles de 44 px ya usados como referencia local de diseño. Esto no atribuye ese número a Laws of UX ni certifica conformidad WCAG: el criterio AA 2.5.8 especifica un mínimo de 24 × 24 píxeles CSS con excepciones y reglas de separación. Verificar tamaño y separación reales en el resultado. [W3C: tamaño de objetivos](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- En la futura implementación, comprobar escritorio y móvil con navegación abierta/cerrada, zoom, textos largos, teclado y lectores de pantalla. Medir contraste y foco; una sombra en texto sobre gradiente no sustituye esa comprobación.
- Recorrer con datos ficticios: revisión → aprobación sin cobertura → asignación posterior; rechazo fundamentado; cancelación previa al corte; decisión guardada con correo fallido; registro de horas y corrección. Separar pruebas de usabilidad de las pruebas contables del saldo y del descuento automático.

No se ejecutaron pruebas de UI ni se modificaron componentes durante esta investigación. El siguiente entregable recomendado es un boceto visual con datos ficticios basado en estos patrones, antes de implementar pantallas reales. No se agregan nuevas funciones ni se resuelven por diseño las políticas operativas que continúan pendientes.

## Modelo conceptual propuesto

Los nombres son orientativos, no una migración aprobada.

| Entidad | Responsabilidad |
| --- | --- |
| `staff_members` | Identidad laboral estable, referencia interna, nombre, contacto, móvil/base y estado. Vínculo opcional con cuenta; no usar nombre o correo como clave de identidad. |
| `compensatory_accounts` | Cuenta por agente y ámbito, apertura y punto de serialización de operaciones concurrentes. |
| `compensatory_monthly_limits` | Límite individual en minutos, vigencia, responsable del cambio y motivo. Propuesta de gestión administrativa; el agente no puede modificarse el límite desde el formulario público. No reescribir el límite histórico al editar el actual. |
| `compensatory_ledger_entries` | Minutos enteros con signo, tipo, causa, fecha efectiva, fecha de registro, autor, origen, operación única y referencia de reversión. No borrar movimientos para corregir. |
| `compensatory_requests` | Agente, intervalos solicitados, minutos, estado y versión; distinguir solicitante de operador que carga en su nombre. |
| `compensatory_request_events` | Solicitud, decisión, motivo, actor, fecha de servidor y cambios de estado; historia acumulativa. |
| `coverage_assignments` | Agente que cubre, intervalo/minutos, confirmación y cambios. Permitir varias coberturas para una solicitud sin dar por cubierta una franja incompleta. |
| `notification_outbox` / `notification_deliveries` | Evento de negocio, destinatario, canal, versión del contenido, intentos y estado de entrega. |
| `work_facts` / `accrual_rules` | Solo C4: trabajo efectivo y reglas vigentes que justifican cada devengamiento. |

### Saldo, reserva y consumo

Regla confirmada por el usuario: **saldo contable = apertura + créditos + ajustes − consumos**; **disponible = saldo contable − reservas activas**. Aprobar reserva las horas. A las **00:00 del día aprobado, en la hora local del servicio**, el sistema convierte automáticamente la reserva en consumo una sola vez, sin que administración deba marcar manualmente su utilización. La solicitud debe seguir aprobada y no cancelada. Pendientes y rechazadas nunca producen ese descuento.

**Sin horas a crédito — regla confirmada:** solo se pueden aprobar horas respaldadas por saldo a favor ya registrado y disponible, descontando las reservas de otras solicitudes. Si lo solicitado supera ese disponible, se bloquea la aprobación; la solicitud se conserva para revisión y no se rechaza automáticamente. No hay excepción administrativa para conceder horas que el agente deba generar o trabajar después. Este MVP no incluye franquicias a devolver con trabajo futuro.

Validar saldo y reservar dentro de una misma transacción para que dos aprobaciones no comprometan las mismas horas. Los créditos manuales deben representar horas a favor reales con su fundamento/origen, no anticipos creados para saltar la restricción. Cualquier corrección que afecte horas ya comprometidas requiere conciliación sin introducir silenciosamente saldo disponible negativo.

La cancelación ordinaria se admite **antes de ese instante** y libera la reserva, devolviendo esas horas al disponible; no genera un segundo crédito porque todavía no hubo consumo. A partir del corte no se usa la cancelación ordinaria: cualquier rectificación posterior requiere un ajuste trazable con fundamento y permisos por definir. El descuento es una regla contable basada en la fecha aprobada, no una verificación de asistencia ni prueba de disfrute efectivo.

Ejemplo del funcionamiento confirmado: saldo de Ana de 48 h y aprobación de 24 h para el 10 de noviembre → contable 48 h, reservado 24 h, disponible 24 h. Al llegar el 10 de noviembre a las 00:00 → contable 24 h, reservado 0 h, disponible 24 h. Si se cancela antes del corte → contable 48 h, reservado 0 h, disponible 48 h. Rechazar no descuenta nada. Se descarta exigir una confirmación manual de utilización como paso normal.

Esta automatización del **descuento** pertenece a C2; no depende del cálculo automático de horas **generadas** de C4. El proceso debe recuperar descuentos vencidos tras una caída sin duplicarlos, usar el instante efectivo previsto y registrar además cuándo se procesó. Cancelación y descuento concurrentes deben respetar el corte en el servidor. Se debe configurar la zona horaria del servicio explícitamente.

**Aprobación para el mismo día después de las 00:00 — regla confirmada:** al aprobar, descontar inmediatamente una sola vez, dejando constancia de que el registro fue posterior al corte ordinario. No esperar al día siguiente ni volver a descontar mediante el proceso programado. Esto no convierte automáticamente en aprobadas las solicitudes importadas para hoy, que siguen pendientes hasta una decisión administrativa.

### Débitos administrativos y reajustes

El usuario requiere que coordinación pueda registrar un descuento por **entrega efectiva de compensatorio** o **reajuste administrativo**, incluyendo la salvedad o fundamento operativo. En la UI se propone **“Registrar débito”**, no una opción para forzar saldo negativo o saltar controles.

- Identificar agente, cantidad de horas, tipo de débito, fecha efectiva y explicación obligatoria de la salvedad. Guardar además responsable autenticado, fecha/hora real de registro y saldo antes/después. Una fecha efectiva anterior no reemplaza la fecha real de carga.
- Vincular la solicitud, el movimiento o la constancia de origen cuando corresponda. Un reajuste de saldo no aprueba ni rechaza una solicitud por sí mismo.
- Si es una entrega sobre una solicitud aprobada con horas reservadas, convertir esa misma reserva en consumo, no descontarla dos veces. Liberación de reserva y débito deben ser una sola operación transaccional; se conserva la protección de las reservas ajenas.
- Si no existe reserva vinculada, el débito solo puede utilizar el disponible no comprometido. **Ni el motivo operativo ni la acción administrativa permiten conceder horas a crédito o generar saldo negativo.**
- Si la solicitud ya fue descontada, no registrar otro consumo por esa misma entrega. También evitar que una carga histórica ya incluida en la apertura vuelva a descontarse.
- Los movimientos no se borran ni se sobrescriben; las correcciones posteriores conservan el original y su relación con el ajuste. Presentar la operación y su efecto antes de confirmar.

Esta definición agrega una capacidad administrativa a implementar; no modifica todavía el boceto ni los datos reales. La atribución de permisos específicos y comunicaciones de estos movimientos se concretará dentro del alcance administrativo y del envío de novedades acordado, sin presuponer acceso del agente.

El prorrateo entre solicitudes está confirmado. **Regla práctica aclarada por el usuario: conservar la cantidad de horas que solicite el agente.** Al recibir o importar, el sistema no sustituye esa cantidad por 24, no la recorta a ese valor ni rechaza la presentación solamente por superar esa referencia. Esto no implica aprobación automática ni autorización de saldo negativo: administración conserva la decisión manual.

Se mantiene el requisito previo de límite mensual editable por agente; recibir la cantidad solicitada y autorizarla son operaciones distintas. Propuesta de seguimiento: sumar reservas y consumos del mes de disfrute contra la referencia individual, sin contar dos veces la conversión de reserva a consumo. Falta confirmar el mes de imputación, la unidad mínima, la política de aprobación ante excedentes y cómo aplicar cambios de límite a solicitudes ya aprobadas. No asumir sobregiros. Guardar minutos enteros evita errores de aritmética decimal. El usuario relaciona las tres jornadas con jornadas de ocho horas (24 h); se registra como su explicación de la práctica, no como conclusión jurídica sobre la aplicación indistinta de los incisos del artículo 68.

### Estados y cobertura

Propuesta de nombres: `submitted` → `under_review` → `approved` o `rejected`; luego `approved` → `consumed` automáticamente al corte, o `cancelled` antes del corte. `consumed` identifica el descuento contable, no una comprobación manual de asistencia. No convertir silencio, vencimiento, envío de correo o lectura en aprobación. Cambios de fecha/horas después de una decisión generan nueva versión y revisión, no edición silenciosa.

**Regla inicial confirmada:** se puede aprobar sin tener identificado o confirmado quién cubrirá las horas. Mantener el estado de cobertura separado (`pending`, `confirmed`, `changed`): una solicitud puede estar **“Aprobada · cobertura pendiente”**. Es una aprobación real, no una solicitud todavía pendiente de resolución; la ausencia de reemplazante no debe bloquear la decisión ni presentarla como rechazada.

La administración podrá asignar o modificar la cobertura posteriormente, incluso cuando la disponibilidad aparezca a último momento, dejando actor, fecha y cambios en la cronología sin sobrescribir la decisión original. No condicionar automáticamente la aprobación, su correo o el descuento ya acordado a completar la cobertura; cualquier regla adicional por falta de personal requiere una decisión expresa. Se retira la recomendación anterior que exigía cobertura confirmada antes de aprobar.

Al registrar una cobertura, validar intervalos, identidad del reemplazante y conflictos conocidos; una franja incompleta no se presenta como totalmente cubierta. Sin calendario completo, una confirmación administrativa debe indicar su método de verificación, no afirmar que se validaron todos los cruces automáticamente.

La cobertura no genera automáticamente compensatorias para el reemplazante: es otro hecho de trabajo sujeto a las reglas aplicables, evitando una cadena de créditos duplicados.

## Historia confiable, sin prometer evidencia infalible

Mostrar por separado:

1. **Solicitud registrada:** identificador y fecha; texto inequívoco “Solicitud registrada. Pendiente de aprobación”.
2. **Decisión registrada:** aprobada/rechazada, intervalos, minutos, fundamento, responsable y versión; solo un evento administrativo autorizado cambia este estado.
3. **Notificación:** pendiente, enviada, entregada al servidor receptor, fallida/rebotada; cada canal conserva sus intentos.
4. **Acuse del agente, futuro C3:** acción autenticada “He tomado conocimiento” vinculada a la versión exacta. No significa conformidad ni aprobación adicional. C2 no exige cuenta ni presume acuse por correo; cualquier constancia manual se identifica como tal.

Resend distingue solicitud de envío aceptada de entrega al servidor receptor; ninguno equivale por sí solo a acuse humano. Es evidencia del comportamiento de un proveedor, **no selección de proveedor**. [Documentación de eventos](https://resend.com/docs/webhooks/event-types).

Una base con auditoría reduce ambigüedad, pero no vuelve el registro legalmente incontestable ni impide que un administrador de infraestructura altere datos. Proponer permisos mínimos, prohibición de edición/borrado desde la aplicación, auditoría de acciones privilegiadas y backups verificados; evaluar sellado externo o almacenamiento inmutable solamente si el requisito probatorio lo exige. OWASP recomienda proteger registros frente a alteración y acceso indebido. [Guía de logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html).

## Consistencia técnica y comunicación

- Guardar decisión, auditoría, reserva/consumo y evento de notificación pendiente en una transacción. El envío de correo ocurre después, desde una cola persistida/outbox; un fallo de correo no revierte una aprobación ya confirmada ni crea una segunda decisión. [Patrón transactional outbox, AWS](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html).
- Reintentos con identificadores idempotentes propios y restricciones únicas; no depender solo del período de deduplicación del proveedor. Webhooks autenticados y deduplicados; mensajes antiguos no pueden sobrescribir una decisión nueva.
- Serializar operaciones sobre la cuenta del agente y verificar la versión de la solicitud dentro de la misma transacción. Elegir y probar bloqueo de fila o aislamiento serializable con reintento completo; no basta leer el saldo y escribir después sin protección. [PostgreSQL: bloqueos](https://www.postgresql.org/docs/current/explicit-locking.html) y [aislamiento](https://www.postgresql.org/docs/current/transaction-iso.html).
- Antes de producción definir transporte, dominio remitente, permisos, ejecución de trabajos, backoff, alertas de fallos y tratamiento de correo faltante o inválido. No elegir un gestor de marketing para resolver transacciones laborales.
- En C2 el correo debe ser comprensible sin iniciar sesión: identificador, decisión explícita, fecha/horas y fundamento pertinente, sin adjuntar toda la historia laboral. Los enlaces al panel administrativo son solo para administradores; no enviar al agente un enlace de login como única forma de conocer su resolución. Conservar la versión comunicada y el destinatario usado. Revisión administrativa del contacto antes de enviar información laboral desde datos declarados en el formulario público; no atribuir identidad autenticada a nombre/correo escritos por el solicitante.

## Importación histórica y convivencia con el formulario actual

1. Elegir fecha de corte, fuente y responsable del saldo de apertura por agente. Separar datos verificados de pendientes de conciliación.
2. Cargar antecedentes con fecha original y fecha de incorporación; autor de la carga no es necesariamente quien decidió históricamente. Si no hay evidencia, usar “sin constancia”, no inferir aprobación o rechazo.
3. Marcar si un antecedente ya está incluido en la apertura. **Importar cronología no vuelve a acreditar ni descontar horas anteriores al corte.**
4. Reimportar por clave de origen sin duplicar; discrepancias van a revisión. Corregir mediante nuevos eventos y ajustes justificados.
5. No reenviar correos históricos automáticamente. Una comunicación nueva debe identificarse como carga de antecedentes, no como decisión recién emitida.
6. Mantener la experiencia y el acceso del formulario existente durante todo C1/C2 y después, hasta decisión expresa del usuario. Identificar su almacenamiento real mediante exportación suministrada o acceso remoto autorizado; no asumir que están todos los datos en este repositorio ni que el correo es la fuente completa.
7. Proponer una importación de ensayo con cantidades de origen, importadas, duplicadas y pendientes de identificar. Asociar a agentes sin fusionar automáticamente por nombre. Conservar ID de origen y datos originales mínimos; fechas inválidas e identidades ambiguas pasan a conciliación, no se pierden ni se asignan arbitrariamente.
8. Regla confirmada de importación: fecha de compensatorio **anterior al día de corte → historial**; fecha **igual o posterior al día de corte → pendiente de resolución manual**. **La fecha de solicitud no decide este grupo.** Las solicitudes para el mismo día también quedan pendientes. Congelar fecha/hora y zona del corte por lote: no usar un “hoy” móvil que reclasifique el lote cada vez que se reintenta. Conservar y conciliar las decisiones previas documentadas según el punto siguiente.
9. “Historial” es una clasificación temporal, no una aprobación, rechazo ni disfrute supuesto. Registrar la decisión histórica solo cuando haya evidencia. Para pendientes, toda resolución nueva requiere administrador autenticado, fecha de servidor y fundamento; no aprobar ni rechazar por el mero paso del tiempo. Si aparecen decisiones previas documentadas, conservarlas y conciliar su estado, no borrarlas ni reenviarlas automáticamente.
10. Además de recuperar el pasado, capturar las solicitudes nuevas que sigan entrando por el formulario, con ID estable, deduplicación y conciliación. Definir el mecanismo de integración luego de inspeccionar la fuente autorizada. La nueva historia administrativa será la fuente de las decisiones; evitar que dos sistemas emitan resoluciones o correos contradictorios. Mantener diferenciados el comprobante de recepción existente y el correo de aprobación/rechazo.

### Fuente confirmada y propuesta de exportación JSON

El usuario identifica las respuestas del formulario de compensatorios como origen y propone exportarlas desde su `.gs`. En el código local, `docs/google-apps-script/compensatorio.gs:43-65` abre el Google Form, construye y envía una `FormResponse`; `:82-87` devuelve su ID. El archivo `.gs` es el puente de recepción, no el archivo que almacena las respuestas. No se verificó el despliegue remoto ni si existen respuestas borradas del Form pero conservadas en una planilla vinculada.

**Exportador preparado localmente; importador pendiente:** `exportCompensatorioResponsesToJson()` en `docs/google-apps-script/compensatorio.gs`, con instrucciones en su [README](./google-apps-script/README.md#manual-private-json-export). El usuario autorizó esta función al responder «Si» a «¿Preparo primero esa función de exportación en el `.gs`, dejando intacto el funcionamiento actual?». No se ejecutó contra Google ni se desplegó. El lector/importador de JSON versionado continúa pendiente. Son piezas complementarias: exportar desde Google y validar/importar en destino. Google documenta `getResponses()` y `getId()`. [Form](https://developers.google.com/apps-script/reference/forms/form#getResponses()) y [FormResponse](https://developers.google.com/apps-script/reference/forms/form-response#getId()).

**Verificación local:** 9 pruebas del exportador, lint focalizado, TypeScript y comprobación independiente aprobados; los manejadores originales permanecen sin cambios. La suite general obtuvo 730 pruebas aprobadas y 1 fallo de texto en `EfaObservationPanel`, reproducido también en el commit base. El exportador crea un archivo vacío, verifica su privacidad antes de escribir datos y no exporta valores de preguntas no mapeadas. No realiza importaciones ni decisiones administrativas.

- Ejecutar la exportación manualmente desde el editor con una cuenta autorizada; conservar `doGet`/`doPost` sin exponer un endpoint público con los datos. Si se genera un archivo en Drive, mantenerlo privado y no registrar su contenido en logs. La preparación local del código no autoriza ejecutarlo contra Google.
- El JSON debe incluir versión de esquema, fecha de exportación, origen y zona horaria; por respuesta: ID original, fecha/hora de envío, nombre, correo declarado, móvil, fecha solicitada y horas. No incluir secretos, credenciales ni enlaces de edición de respuestas.
- Mapear preguntas por ID/tipo, no por posición. El código actual resuelve el correo por el ítem explícito “Correo electrónico” (`:195-213`), con captura automática de correo desactivada; no depender solamente de metadatos de correo del respondente. Preservar faltantes de respuestas antiguas para conciliación.
- Conservar la fecha pedida como fecha laboral y el instante de envío como timestamp separado. Los valores de ítems pueden tener distintos tipos; no adivinar formatos de fechas ambiguos ni descartar registros silenciosamente. [ItemResponse](https://developers.google.com/apps-script/reference/forms/item-response#getResponse()).
- El lector debe ofrecer primero validación sin escritura: cantidades válidas, inválidas, duplicadas y pendientes de asociar a agentes. Usar origen + ID de respuesta para no duplicar; un cambio de contenido requiere conciliación, no sobrescribir decisiones administrativas. No fusionar agentes solo por nombre.
- Importar solicitudes no crea créditos ni consume saldos: se aplican las reglas de historial/pendiente acordadas. No reenviar correos históricos. La escritura final requiere el modelo de solicitudes y una base destino expresamente autorizada.
- Un JSON inicial resuelve el histórico, no la recepción continua por sí solo. Mientras se conserve el formulario, definir reexportación/importación incremental o integración posterior para las nuevas respuestas, con superposición y deduplicación para no perder entradas ni repetir avisos.

El plan no autoriza acceder al buzón, Apps Script ni la base remota. Cualquier migración/importación necesita destino, operación y credencial/sesión autorizados.

## Automatización: qué falta para calcular bien

| Incertidumbre | Regla que debe confirmarse antes de C4 |
| --- | --- |
| Exceso de 160 horas | Qué cuenta como trabajado, cierre del mes, ausencias, contratos parciales y modificaciones retroactivas. |
| Feriados | Jurisdicción nacional/provincial/local, feriados trasladados, días no laborables y calendario versionado aprobado. |
| Cruce de medianoche | Fraccionamiento por día/mes y zona horaria del servicio; no usar la fecha UTC como fecha laboral. |
| Causas coincidentes | Si feriado, evento, traslado y exceso se suman, se excluyen o tienen prioridad; no duplicar un mismo tramo sin regla explícita. |
| Evento y traslado | Horas reales, equivalencia, límites y evidencia de realización. |
| Momento del crédito | Día/turno finalizado y trabajo confirmado; el cambio al día siguiente es condición temporal, no prueba de asistencia. |
| Correcciones tardías | Recalcular diferencias contra lo ya acreditado con reversión/ajuste y trazabilidad de la versión de regla. |

Primero calcular propuestas y comparar contra liquidación manual. Solo publicar créditos automáticos después de aceptación administrativa. Un trabajo programado debe tolerar caídas y recuperar períodos pendientes sin duplicación.

## Validación prevista para la implementación

Vitest existe (`package.json:14`), con ejemplos de servicios en `src/lib/efa-communications.server.test.ts`. Las pruebas siguientes son criterios futuros, **no ejecutados ni aprobados en esta investigación**.

| Etapa | Pruebas de aceptación prioritarias |
| --- | --- |
| C1 | Alta sin cuenta; autor y motivo obligatorios; saldo reconstruible; reversión conserva original; límite individual editable con historia; prorrateo; reintento y concurrencia; acceso no administrador rechazado sin mutación. |
| C2 | Formulario sigue operando sin login; carga manual identifica al administrador; importación completa conciliada; ayer/hoy/mañana según corte acordado; histórico no implica aprobación ni consumo; reimportación no duplica; pendientes requieren resolución con autor; límite acumulado y concurrencia; aprobación/reserva y disfrute sin doble descuento; cobertura; aviso a administración y resolución fundamentada por correo al agente; rollback no envía; rebote conserva decisión; reintento/webhook no duplica. |
| C3 | Solo después de autorización: agente A no lee ni modifica B; solicitud autenticada; ambas partes ven la misma versión; acuse ligado a versión y no confundido con aceptación. |
| C4 | Cruce de día/mes, feriado local, superposición de causas, ausencia real, cambio retroactivo y ejecución repetida; calendario futuro no acredita horas; diferencias contra cálculo manual explicables. |

Usar RED → GREEN cuando existan reglas deterministas acordadas; pruebas de integración de transacciones en una base aislada autorizada, nunca producción. Mantener regresión del formulario público, cuya forma de carga no cambia en este alcance. Por el riesgo, verificar de forma independiente cada unidad que afecte permisos, datos o concurrencia. No fijar un comando de integración inexistente.

Criterios adicionales de C2 por las reglas confirmadas: aprobar sin reemplazante reserva horas y permite enviar la resolución; muestra cobertura pendiente sin confundirla con decisión pendiente; asignar o cambiar reemplazante deja historia sin reaprobar. Descontar automáticamente a las 00:00 una sola vez, permitir cancelación previa con liberación de reserva y comprobar el límite exacto, las carreras entre ambas operaciones y la recuperación tras una caída. No descontar pendientes ni rechazadas.

Comprobar además: aprobación por el disponible exacto permitida; aprobación por encima del disponible bloqueada sin decisión ni correo de aprobación; dos aprobaciones concurrentes no generan sobregiro; horas ya reservadas no cuentan como disponibles; cancelar libera la reserva; ninguna opción administrativa permite otorgar horas a devolver con trabajo futuro. Estas son pruebas previstas para la implementación, no resultados ejecutados.

Pruebas previstas para débitos: aprobación tardía de hoy consume inmediatamente una vez; el proceso programado no repite ese consumo; entrega efectiva convierte su reserva sin doble descuento; reajuste exige fundamento/actor/fechas y conserva saldo antes/después; no consume reservas de otra solicitud ni permite negativos; reintentos no duplican movimientos; registrar un reajuste no cambia silenciosamente una decisión.

La recepción, importación y carga administrativa deben conservar las horas pedidas, incluso si superan la referencia de 24 h: sin truncarlas, reemplazarlas ni convertir ese dato por sí solo en rechazo o aprobación. Las validaciones de formato y cantidad positiva siguen siendo independientes de esa referencia.

## Decisiones pendientes y siguiente paso

**Avance local C1, 2026-10-27:** el usuario confirmó «Sostene dni como identificador». Implementados agentes independientes de cuentas, referencia mensual editable, movimientos manuales y reversión auditada, con navegación de Coordinación y panel lateral colapsable. Especificación y estado en [el registro de implementación](../odd/tasks/compensatory-manual-bank.md); [guía de operación](./compensatory-manual-bank-operations.md). Pasaron 58 pruebas focalizadas, TypeScript y 5 verificaciones de interacción con API ficticia; la suite completa obtuvo 754 aprobadas y el fallo de texto preexistente en EFA. Corrección y verificación independiente de la decodificación de timestamps de Neon y del borrador al cambiar de agente. No se aplicó la migración, no se probaron transacciones contra una base real ni se verificó apariencia con CSS en el probe; hace falta un entorno autorizado antes del piloto. El usuario confirmó mantener el desarrollo separado de main: commits locales `5105165` (backend), `0343e34` (interfaz) y `d9110f4` (evidencia), en `feat/compensatory-manual-bank`, sin publicación ni integración. El padrón usa DNI único; las referencias anteriores a un identificador pendiente quedan resueltas.

Antes de C1: responsable del padrón, identificador laboral, fecha/fuente de apertura y procedimiento de corrección; vigencia y responsable de editar el límite individual. Antes de C2: fuente/exportación de solicitudes, anticipación, autoridad, permisos específicos de cancelación y ajuste posterior, zona horaria configurada, excepciones y cómputo del cupo; proveedor/canal de correo y verificación del destinatario. Ya se definieron el descuento ordinario a las 00:00, consumo inmediato al aprobar para hoy, cancelación previa, prohibición de crédito, débito administrativo fundamentado y aprobación sin cobertura confirmada. Antes de C3: decisión expresa de habilitar el portal, permisos y alcance del acuse. Antes de C4: régimen y ejemplos de todas las reglas de devengamiento.

**Corte confirmado:** las solicitudes para el mismo día de la importación ingresan como pendientes de resolución. Esta clasificación no aprueba, rechaza ni descuenta horas automáticamente.

## Registro de aclaración del usuario

**2026-10-27 — Próximo bloque autorizado e importador diferido:** «Prefiero no preparar el importador ahora más que nada para no trabajarlo dos veces en adecuar cómo vienen los datos. Sigamos con el siguiente bloque de agentes más con manual de horas». Se autoriza desarrollar agentes y banco manual de horas; no preparar todavía el importador, ni siquiera con datos simulados. La carga real de datos, migraciones remotas y despliegue no están autorizados por este pedido. La inspección confirma que las identidades del personal deben ser independientes de las cuentas de acceso; falta confirmar el identificador laboral antes de fijar el alta.

**2026-10-27 — Origen e intercambio JSON propuesto:** «Son las respuestas del form, el archivo .GS del compensatorio al vez podríamos agregar allí, una función para extraer manera de obtener todas las respuestas y luego exportarlas en un json o directamente adecuar un pequeño script para leer un futuro archivo json que directamente obtenga y guarde la información necesaria.» Se confirma el origen informado y se propone exportador administrativo + importador validado; no se ejecutó extracción ni se autorizó acceso remoto por esta descripción.

**2026-10-27 — Débito inmediato y administrativo:** a la pregunta «si administración aprueba para hoy después de las 00:00, ¿descontamos las horas inmediatamente al aprobar?», el usuario respondió: «Si, algo así como que si hay que registrar algún tipo de débito forzado o por razones de operatividad, o administrativas internas de parte de la coordinación, anotando la salvedad del descuento de horas (por entrega efectiva o por reajuste)». Se incorpora el consumo inmediato de aprobaciones para hoy y el registro administrativo de débitos con causa y salvedad, sin excepcionar la prohibición de horas a crédito.

**2026-10-27 — Prohibición de horas a crédito:** «Correcto pero no debe ocurrir que se den horas compensatorias que no estén en el saldo a favor de la gente no pueden ser a crédito para cumplir luego». Solo aprobar con saldo disponible suficiente; no habilitar préstamos de horas ni excepciones que generen saldo negativo.

**2026-10-27 — Organización aceptada:** el usuario respondió «perfecto» a la estructura de Coordinación con Usuarios y accesos, Compensatorios, Coordinación EFA y recursos del servicio graduales. Confirma el diseño, no autoriza todavía la implementación de código ni acceso remoto.

**2026-10-27 — Centro de gestión ampliado:** «Y lo de administrar cuentas también encaja, no solo para crear usuarios efa, sino para usuarios futuros y entregarles las credenciales y gestionar compensatorias y todo lo que hacemos de manera híbrida con drive». Se incorpora administración de cuentas al apartado Coordinación; reemplaza la recomendación anterior de dejarla fuera del centro. No autoriza implementación ni acceso remoto.

**2026-10-27 — Cantidad solicitada:** «No igualmente, tres jornadas habla de 3 jornadas de 8 hs. Que es justamente las 24 hs a devolver de las que estamos haciendo. En la práctica dejaremos la cantidad de horas que solicite el agente.» Se conserva la cantidad pedida; no se fija un recorte automático a 24 h. La cantidad ingresada no sustituye la resolución administrativa.

**2026-10-27 — Cobertura no bloqueante:** a la pregunta «¿para aprobar un compensatorio debe estar identificado y confirmado quién cubrirá esas horas?», el usuario respondió: «En principio no porque las definiciones dependen de disponibilidad de personal que a veces existe y a veces se va abriendo a último momento esa existencia de personal». Se permite aprobar con cobertura pendiente y completarla posteriormente; regla inicial del MVP, revisable por decisión del usuario.

**2026-10-27 — Descuento y cancelación:** el usuario propuso «para ahorrar un paso deberiamos descontarlo el día que efectivamente se produce». A la precisión «¿el descuento automático debería ocurrir al comenzar el día aprobado, a las 00:00?», respondió «Si eso está bienv». Queda confirmado reservar al aprobar, descontar automáticamente al corte y permitir cancelación previa que libera las horas; no se autoriza implementación de código por esta confirmación funcional.

Confirmación posterior: a la pregunta «¿las solicitudes cuyo compensatorio sea para el mismo día de la importación también deben quedar pendientes de resolución?», el usuario respondió: «Si».

La aclaración siguiente reemplaza el alcance inicial que dejaba el correo para el portal; no autoriza implementar ni acceder a datos remotos:

> Si respecto a esto, el agente puede prorratear lo pero habitualmente no superan las 24 mensuales ( debería ser editable por agente el límite mensual).
> Actualmente quiero que sigamos respetando la manera de cargar las solicitudes, en todo caso, luego, cuando yo lo decida implementaremos la carga con usuario logueado. Creo que lo primero puede ser armar el sistema + envío de correos, extraer todas las solicitudes realizadas en el formulario existente, para armar historial de solicitudes por agente. + Posibilidad de carga manual, por parte de los admin. Y todos los compensatorios que ya fueron solicitados pero que superaron la fecha de hoy, quedarán a modo de historial. Y todos los compensatorios que aún no han sido cumplidos quedarán como pendientes de resolución. Por lo que los pendientes debemos ir resolviendo los de manera manual dejando quien lo resuelve.

Fuentes públicas consultadas el 2026-10-26 y el 2026-10-27. La investigación inicial no cambió código; posteriormente se autorizó únicamente el exportador local y se verificó con datos ficticios. No se verificaron servicios desplegados. La planificación no constituye validación legal ni autorización para operaciones remotas.
