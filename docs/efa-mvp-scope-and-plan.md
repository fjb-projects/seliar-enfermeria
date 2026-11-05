# MVP EFA Alcance y plan

**Fecha:** 2026-10-05  
**Estado:** Documento de definición; implementación no iniciada.  
**Alcance de autorización:** Se autorizó este documento de alcance y planificación, no cambios en la aplicación.

## Resumen ejecutivo

El MVP agrega un área autenticada para registrar observaciones de procesos de la Central 107 y de los móviles. El personal observado se representa por roles anónimos y períodos, mientras que la cuenta autenticada identifica al autor real y permite aplicar permisos y auditoría. Los episodios no son totalmente anónimos: pueden incluir una dirección privada exacta opcional. Se conservan intactos los formularios públicos actuales. El área EFA registra guardias, episodios, comunicaciones, despachos, coordinación compartida, tiempos observados, dotaciones anónimas y conductas observables.

El modelo será relacional, no un único documento JSON por episodio. No incluye tableros, estadísticas, metas, umbrales, alertas automáticas ni inferencias de desempeño. Tampoco convierte el proyecto en un ERP de licencias, compensatorios o asignaciones laborales nominales.

## Estado de los componentes

| Componente | Estado |
|---|---|
| Definición funcional del MVP | Alcance aceptado en conversación; los detalles marcados como pendientes siguen abiertos. |
| Aplicación pública actual | Debe continuar operativa sin cambios en sus formularios o integraciones. |
| Nueva base de datos | El usuario informó que la creó en Neon, sin Neon Auth. Conexión y contenido no verificados; no se accedió ni se aplicaron migraciones. |
| Autenticación y permisos del área privada | Definidos funcionalmente; todavía no implementados. |
| Stack técnico | Propuesta base pendiente de validar compatibilidad con el proyecto y el alojamiento. |
| Cuenta, repositorio y despliegue | Diferidos hasta que el usuario suba o habilite el proyecto correspondiente. |
| Espejo en Engram | Pendiente. El runtime no confirmó una sesión registrada y autorizada para atribuir escrituras; no se intentó registrar una sesión ni se usó una vía alternativa. |

## Objetivo y límites

### Objetivo

- Registrar hechos operativos con autoría, contexto, tiempos y relaciones claras.
- Permitir observación desde EFA sin identificar al personal observado.
- Mantener separados el tiempo del hecho, el tiempo ingresado y las marcas de auditoría.
- Dejar los datos crudos disponibles para análisis posterior, sin calcular ni publicar resultados en este MVP.
- Preservar indefinidamente la operación actual de los formularios públicos mientras esta área privada evoluciona; no migrarlos, reemplazarlos ni duplicarlos.

### Fuera del MVP

- Reemplazar, importar o duplicar en la nueva base las respuestas de Google Forms.
- Modificar los formularios públicos existentes o sus despliegues de Apps Script.
- Licencias, compensatorios, reemplazos laborales, solicitudes de personal o gestión integral de enfermería.
- El flujo independiente de asignación/traslado por profesional médico.
- Incorporar completo el instrumento unificado de observación por turno o convertir sus anexos en requisitos automáticos.
- Asignar turnos de personas identificadas o enlazar dotaciones observadas con cuentas de usuario.
- Métricas, reportes, dashboards, metas, umbrales, alertas o conclusiones automáticas.
- Seguimiento GPS de EFA, de pacientes o de móviles; comparación automática con GPS/AVL.
- Despacho automático de policía o de otros recursos.
- Cumplimiento de protocolos clínicos, puntuaciones individuales o inferencias de estados mentales.

## Cuentas, roles y acceso

### Cuentas

- El acceso privado usa cuentas con correo y contraseña creadas por administración. No hay autorregistro público.
- Se crearán manualmente tres cuentas administradoras iniciales.
- Una persona administradora puede crear cuentas y restablecer el acceso de usuarios.
- El cambio obligatorio de contraseña en el primer inicio queda diferido.
- Desactivar una cuenta bloquea su acceso, pero conserva los registros históricos. Administración puede reactivarla.
- Los permisos y cambios de rol quedan auditados.

### Roles

- Toda cuenta de enfermería parte con el rol operativo de enfermero/a de ambulancia.
- EFA es un permiso adicional, otorgado o revocado por administración.
- Administración incluye implícitamente los permisos EFA y puede iniciar guardias sin una concesión EFA separada; quitar una concesión EFA explícita no elimina el permiso heredado mientras se conserve el rol de administración.
- Los roles de cuenta pueden combinarse; no se confunden con las funciones reales del personal observado.

### Visibilidad y autoría

- Una persona EFA consulta y corrige sus propios registros; no transfiere normalmente sus episodios a otra persona EFA.
- Administración puede consultar y corregir todos los registros.
- La cuenta autenticada conserva autoría real. Los datos de personas observadas solo indican roles anónimos por período.
- Al revocarse EFA, la persona conserva lectura de su historial EFA si no mantiene otro permiso efectivo EFA. Administración incluye ese permiso; quitar una concesión explícita no vuelve de solo lectura a una cuenta administradora.
- Los catálogos compartidos no habilitan acceso a episodios ajenos. Administración sí puede consultar y corregir todos los registros, incluidos los que contienen direcciones privadas.

## Guardias EFA y bases

- La persona EFA inicia y termina su guardia manualmente; declara presencia en la Central. No se usa geolocalización.
- Durante una guardia puede seguir cualquier base, varias a la vez, y agregar o quitar bases.
- La selección de bases se hace desde el catálogo institucional. Administración administra el catálogo de bases y móviles.
- **Aclaración MVP aceptada el 06-10-2026:** las 14 opciones de Móvil existentes en los formularios se cargan como etiquetas de bases operativas EFA. Esto no define una flota separada, patentes ni asignaciones de móviles a personal; esas relaciones quedan para una etapa futura.
- Una guardia no se cierra ni se completa automáticamente por el horario planificado o porque un móvil quede disponible.
- Una persona puede completar después de terminar la guardia un registro que inició durante ella.
- Los cambios de guardia y de asociación a bases conservan autoría e historial.

## Planificación de móviles

- Administración mantiene patrones futuros y excepciones por día, móvil y rol; los horarios pueden variar entre móviles y entre conductor/a, enfermero/a y médico/a.
- Los patrones A/B/C/D continúan entre meses cuando corresponda. No se presupone un ciclo universal 24x72.
- Se admiten varios relevos en un mismo día. El móvil 15, según el ejemplo recibido, tiene cobertura hasta las 22; no se agrega automáticamente un tramo 22–06.
- El horario planificado es versionado y tiene vigencia efectiva. Las excepciones y los cambios futuros no reescriben el plan que aplicaba antes.
- La planificación no crea una nómina de personas ni sustituye los períodos reales observados.
- La disponibilidad del móvil no equivale a cobertura de la base; la cobertura tampoco demuestra disponibilidad.

## Personal observado

- Los períodos de dotación son independientes de las cuentas autenticadas.
- Se registran roles anónimos: enfermero/a, conductor/a y médico/a; puede haber varias personas concurrentes por rol.
- Se registran ingresos, egresos y múltiples relevos por rol, sin nombres ni identificadores personales.
- Un traslado de personal separa hora de salida del origen y hora de llegada al destino; las salidas temporales tienen regreso cuando se observa.
- Causas opcionales: requerimiento médico, coordinación, salida temporal u otra. “Otra” requiere descripción.
- Una ausencia de observación no demuestra falta de cobertura. Los roles desconocidos no se rellenan por inferencia.
- El conductor/a y enfermero/a integran la dotación operativa; el médico/a se trata por separado.

## Episodios, comunicaciones y despachos

### Episodio

- El episodio agrupa llamadas entrantes o salientes, otras comunicaciones, coordinaciones y varios despachos de móviles.
- Puede comenzar sin llamada telefónica.
- Tiene un ID interno inmutable, autor, guardia de origen, tiempos y estado. El número de intervención es opcional, separado del ID, y puede agregarse después de finalizar.
- Motivo y dirección exacta son opcionales. La dirección se conserva en el episodio privado, no en el catálogo compartido.
- Para usuarios autorizados, la identificación del episodio muestra “Motivo — dirección” cuando esos datos están disponibles; si no hay motivo, dirección ni etiqueta útil, se recurre a hora y prioridad. La dirección no se excluye de la visualización autorizada.
- Si no se despacha ningún móvil, el episodio puede registrar como motivo de no despacho: trasladado por medios propios, trasladado por policía, deja sin efecto, atendió otro servicio de ambulancia u otros. La explicación es opcional. Esto no sustituye los resultados propios de cada despacho móvil.
- Un episodio real sin despacho puede quedar «Finalizado sin despacho», registrando el motivo correspondiente. «Anulado» se reserva para registros creados por error o duplicados y conserva su historial. La distinción también se aplica a episodios que solo contienen comunicaciones con policía u otros servicios.
- Una llamada puede finalizar mientras siguen abiertos uno o más despachos.
- El episodio finaliza solo cuando todos los despachos no anulados tienen finalización confirmada por la base de datos.
- Un episodio finalizado puede reabrirse para agregar una comunicación relacionada, con auditoría.

### Comunicaciones y llamadas

- Una llamada telefónica es una comunicación con canal telefónico, no dos registros separados.
- Cada comunicación tiene episodio, canal, dirección, tiempo del hecho, autor y datos observados pertinentes.
- El despacho puede enlazarse opcionalmente a la comunicación telefónica que lo originó. La relación no se fuerza cuando el episodio comenzó presencialmente o por otra vía.
- Una solicitud de apoyo se vincula al despacho que la solicita y conserva su propia hora de pedido. El despacho del móvil que responde es otro registro con su propio T0; el refuerzo entre móviles existente sigue representándose como solicitud y despacho relacionados, no como duplicación de la solicitud.
- El origen no telefónico puede ser presencial u “Otro”; “Otro” exige explicación. El tiempo de recepción no telefónica es opcional.
- Una comunicación telefónica tiene su propio cierre; su cierre no finaliza automáticamente los despachos ni el episodio.
- Una llamada telefónica requiere prioridad roja, amarilla o verde para finalizar; un borrador puede guardarse sin prioridad. “No observado” no es una prioridad válida para finalizar.
- Las horas se capturan con una acción rápida de “Ahora” o mediante edición manual. El tiempo del hecho no se confunde con el tiempo de pulsación ni con la marca de guardado.

### Tiempos y datos ausentes

- Cada hora operativa se puede capturar con “Ahora” o ingresar/editar manualmente. El momento del hecho se conserva aparte del momento de captura, creación o corrección.
- Un campo temporal ausente no bloquea por sí solo el cierre, salvo los requisitos explícitos de prioridad de la llamada y de prioridad/resultado del despacho. No se inventan horas ni se convierten faltantes en cero.
- El estado predeterminado de un tiempo de móvil no observado es “No observado”. “No informado” se selecciona cuando el móvil no comunicó el evento; “No aplica” solo cuando realmente no corresponde. Son estados distintos y nunca se convierten en cero.

### Despacho móvil

- Cada despacho pertenece a un episodio y puede enlazarse a una llamada telefónica. Incluye móvil y prioridad propios.
- La prioridad es roja, amarilla o verde. Si se crea desde una llamada, copia su prioridad una sola vez; luego ambas se editan independientemente.
- Vincular tardíamente una llamada no sobrescribe la prioridad preexistente del despacho.
- T0 es la hora de despacho, no la recepción de la llamada. La primera respuesta de la dotación tampoco equivale a T1 (salida en camino).
- T0–T6 son tiempos crudos independientes cuando se observan; no se guardan intervalos calculados como si fueran mediciones directas.
- Un campo de tiempo faltante puede ser “No observado”, “No informado” o “No aplica” únicamente cuando corresponda. No se registra como cero.
- La primera respuesta registra rol (conductor/a, enfermero/a, médico/a, otro o “No observado”) y hora cuando se conocen. No se completan nombres desde el plan de dotación.
- Se pueden registrar intentos de contacto repetidos con hora y primera respuesta con un acceso rápido independiente. La primera respuesta no cambia T1.
- Los eventos de coordinación entre móviles no sustituyen ni eliminan el flujo existente de refuerzo entre ambulancias.
- Para finalizar el despacho se requieren prioridad roja/amarilla/verde y resultado: con traslado, atención en domicilio sin traslado, rechazo, no ubicado, cancelado, óbito o “No informado”. “No informado” es válido como resultado; “No observado” no es prioridad válida. Un borrador puede carecer de ambos.
- Se permiten despachos borrador incompletos. Tiempos ausentes no bloquean el cierre si el resultado y la prioridad requeridos están completos.
- La aclaración breve de rechazo, falta de traslado o no ubicación es opcional. “Rechazo” no presupone quién rechazó.
- No se cierra el despacho automáticamente al terminar una guardia, por un horario planificado ni por el evento T6 de móvil disponible.

## Coordinación compartida con policía

- Una coordinación pertenece al episodio y puede vincular varios despachos.
- Registra si la inicia Central o si la solicita una ambulancia, y si refiere al lugar del incidente o a un punto cercano de encuentro.
- La dirección de encuentro, si se declara, es referencia privada del registro y no se comparte como domicilio institucional.
- La solicitud inicial y las respuestas comunes se registran una vez en la coordinación, no una vez por cada móvil.
- Se pueden agregar eventos de solicitud, respuesta y reiteración a la misma coordinación; una reiteración no crea por sí sola una segunda coordinación ni un nuevo recurso policial.
- Cada móvil puede tener su propio evento de llegada al punto, espera y encuentro efectivo, asociado a su despacho.
- La llegada al punto de encuentro no es T2 (llegada a escena). Un encuentro solo se marca si se informa; falta de confirmación no significa que no ocurrió.
- No se presume que la escena es segura por la presencia policial y no se usa GPS como prueba.
- Los tiempos pueden faltar y no bloquean por sí mismos la finalización. La aplicación no despacha automáticamente a la policía.
- La decisión final sobre si se captura un booleano separado de “zona segura” queda pendiente; no se agrega como campo obligatorio ni equivale a una certificación de seguridad.

## Conductas observadas

- La matriz de 24 competencias se acepta como línea de base del proyecto para definir el catálogo de conductas observables. El documento fuente no está validado institucionalmente para SeLIAR/SIES 107; esta adopción no certifica protocolos clínicos ni protocolos locales.
- El MVP implementa solo las conductas concretas que se definieron para observación desde Central. No transforma todas las competencias en preguntas obligatorias.
- Cada observación es opcional y se clasifica como adecuada o a mejorar; el comentario es opcional. No seleccionar una conducta no cuenta como observación negativa.
- “Otra conducta” requiere descripción local al registro; administración puede promoverla luego al catálogo común.
- Los contextos permitidos son guardia, episodio, llamada/comunicación, despacho o comunicación interinstitucional específica.
- Teléfono: ubicación temprana, confirmación por repetición, contacto, preguntas para entender el motivo sin presumir un protocolo local, explicación de las preguntas, lenguaje comprensible e instrucciones prearribo paso a paso con verificación de comprensión.
- Radio: ubicación y datos del servicio, prioridad, confirmación de recepción, lenguaje claro, novedades y seguimiento de estado. Se vincula al despacho cuando puede identificarse; si no, al episodio.
- Coordinación: solicitud de intervención y ubicación/motivo, confirmación de recepción/respuesta y comunicación de novedades; se vincula a la comunicación correspondiente.
- Guardia: pendientes al relevo, pedido de colaboración y preservación de información entre teléfono y radio.
- Registro: completitud, actualización ante información nueva y constancia de acuerdos, solo si EFA puede inspeccionar el registro.
- No se evalúan estados mentales, estrés, empatía inferida ni desempeño personal. No se puntúan nombres ni perfiles individuales.
- Sin un formato local conocido de reporte por radio, se usa una observación libre opcional del despacho para información comunicada por el móvil y observaciones propias de EFA, distinguiéndolas sin duplicar notas.
- No se evalúa cumplimiento de protocolo clínico ni se usan encuestas o observaciones a bordo en este MVP.

## Catálogos institucionales

### Móviles

La lista inicial candidata conserva las opciones de los formularios actuales: Móvil 1, 2, 3, 4, 5, 6, 7, 9, 11, 12, 15 y 26. “Móvil Flotante” es una categoría de asignación, no necesariamente una unidad física. “Otro Movil no Nomenclado” es un valor de compatibilidad/captura, no un móvil numerado.

No hay un mapeo autoritativo móvil–base en el catálogo actual. Administración debe cargar las bases y asignaciones aprobadas. No se deduce que toda opción móvil sea una ambulancia ni se importa el personal de una grilla mensual.

### Instituciones y domicilios

- Las instituciones/destinos se eligen desde un catálogo compartido; EFA puede crear una opción en línea.
- Administración puede corregir o desactivar instituciones; no borra referencias históricas.
- Los domicilios particulares solo se registran en el episodio, nunca en el catálogo institucional.
- La selección compartida del catálogo no habilita lectura de episodios de otras personas EFA. Administración conserva acceso a todos los episodios, incluidas las direcciones privadas.

### Conservación de opciones existentes

Los flujos públicos de Compensatorio e Ingreso tienen catorce opciones de móvil (doce numeradas y las dos categorías anteriores); Cambio de guardia usa texto libre. No se modifica ni sincroniza esa fuente en este MVP. No hay evidencia para declarar obsoleto un móvil numerado; se conserva la etiqueta exacta al preparar semillas, hasta que administración provea una equivalencia aprobada.

## Modelo relacional conceptual

Las relaciones siguientes son una propuesta de diseño, no un esquema implementado:

| Entidad | Relaciones y campos mínimos |
|---|---|
| Cuenta | ID, correo, estado activo y credencial gestionada por autenticación. |
| Concesión de rol | Cuenta, rol, actor y hora de concesión/revocación; admite varias funciones por cuenta. |
| Guardia EFA | Cuenta EFA propietaria, inicio/fin declarados, estado y auditoría. |
| Base de guardia | Relación repetible entre guardia y base; conserva alta/baja y actor. |
| Período de dotación | Guardia, rol anónimo, entrada/salida, relevo, reemplazo temporal y causa opcional. No referencia cuentas. |
| Episodio | Guardia y autor, ID interno, tiempos, estado, motivo/dirección opcionales. |
| Comunicación | Episodio, canal, dirección, tiempo del hecho, origen, campos telefónicos opcionales, prioridad de llamada y estado. La llamada no se duplica. |
| Solicitud de apoyo | Despacho solicitante, hora del pedido, motivo observado y despacho de respuesta opcional cuando se crea. No asigna por sí sola un recurso. |
| Despacho | Episodio, llamada origen opcional, móvil, base, prioridad independiente, tiempos crudos, resultado obligatorio al finalizar y auditoría. El despacho que responde a un apoyo mantiene su T0 propio. |
| Coordinación policial | Episodio, iniciador, lugar/punto de encuentro y referencia privada opcional. |
| Vínculo coordinación–despacho | Asociaciones múltiples entre una coordinación y despachos cubiertos. |
| Evento de coordinación | Coordinación, tipo, tiempo, autor y despacho opcional para hitos propios de un móvil. |
| Observación de conducta | Autor y guardia; ítem de catálogo o descripción local; clasificación, comentario y referencia tipada al contexto observado. |
| Auditoría/versión | Actor, entidad, acción, antes/después y hora de base de datos; conserva las versiones corregidas. |

Las observaciones usan asociaciones explícitas a guardia, episodio, comunicación o despacho; no un par genérico de tipo/ID en texto que impida validar la referencia. Una llamada se referencia mediante su registro de comunicación. La validación también comprueba que el contexto observado pertenece a la guardia y al episodio correspondientes.

Cada hecho conserva por separado: hora en que ocurrió, autor que lo ingresó, hora de alta/corrección y versión. Las marcas de creación no sustituyen la hora operativa declarada.

## Auditoría, corrección y avisos

- Creación, modificación, anulación, reactivación, cambio de estado y cambios de roles/catálogos conservan actor, hora de base de datos y valores anteriores/nuevos.
- EFA corrige sus propios datos; administración puede corregir los de cualquier autor. No se exige motivo de corrección.
- Una corrección administrativa avisa al autor original dentro de la aplicación. Cada destinatario tiene su propio estado de lectura.
- EFA puede anular registros propios y administración cualquiera; la anulación preserva historial y no anula hijos en cascada.
- No se permite anular un episodio mientras tenga alguna llamada o despacho no anulado. La reactivación restaura el estado anterior con los mismos permisos, sin crear duplicados ni cambiar hijos.
- Los episodios que solo contienen otras comunicaciones distinguen finalización sin despacho de anulación por error o duplicado. No se elimina ni oculta contenido en cascada por inferencia.

## Borradores, conexión y conflictos

- Las respuestas y eventos se guardan como borrador sin finalizar; se conserva el historial de respuestas/eventos, no cada pulsación del teclado.
- La confirmación final solo ocurre después de persistir en la base de datos.
- Si falla la conexión, se mantiene una cola local por usuario con identificadores de operación para evitar duplicados al reintentar.
- Una operación cuya respuesta se perdió queda pendiente de confirmación; no se presenta como guardada definitivamente.
- Una cola local del navegador es temporal, no una copia de seguridad ni una garantía de recuperación en otro dispositivo o inicio de sesión.
- Si el borrador local y el registro de servidor divergen, se muestran ambas versiones para resolución manual. No se aplica “última escritura gana”.
- Los errores de autenticación/permisos no se reintentan indefinidamente ni se sincronizan con la cola de otra persona.
- Una operación pendiente del navegador es temporal: no constituye copia de seguridad y no garantiza iniciar sesión sin conexión ni recuperar datos desde otro dispositivo.

## Propuesta técnica pendiente de validación

- Base relacional PostgreSQL en Neon y acceso con Drizzle ORM.
- Autenticación en el servidor con Better Auth; sin registro público.
- TanStack Start y sus funciones del servidor para validar entrada/permisos y llamar servicios de dominio; persistencia y lógica separadas.
- Propuesta de persistencia: cada registro editable conserva una versión actual y un historial de auditoría inmutable; la actualización del registro y su evento de auditoría se escriben atómicamente en una misma transacción de base de datos.
- Propuesta de continuidad: una cola IndexedDB por usuario mantiene borradores/operaciones pendientes en el navegador; cada operación lleva un ID idempotente para reintentos sin duplicados. Es almacenamiento temporal del cliente, no una copia de seguridad ni garantía de nuevo inicio de sesión sin conexión o sincronización entre dispositivos.
- La aplicación local inspeccionada ya usa React 19 y TanStack Start/Router; no se encontraron dependencias de autenticación ni de acceso a base de datos instaladas.
- La configuración actual incluye integración de Vite de Lovable. Debe comprobarse compatibilidad antes de decidir arquitectura de despliegue.
- El alojamiento declarado por el usuario es Vercel sobre la rama principal. La compatibilidad concreta del plan/cuenta institucional se verifica antes de una puesta en producción; no se cambia alojamiento ni se crea una cuenta aquí.
- Antes de una puesta en producción institucional debe verificarse si el plan Vercel Hobby es elegible para el uso previsto. Este documento no formula una conclusión legal ni recomienda contratar un plan.
- Las versiones y compatibilidades de paquetes se fijarán recién después de revisar el proyecto que se suba y probar el objetivo de despliegue autorizado.

## Plan de implementación futuro

Estos bloques ordenan trabajo futuro; no son tareas iniciadas ni autorización para modificar la aplicación.

### Bloque 1 — Base y acceso

- [ ] **MVP-01** Validar el repositorio y el destino que aporte el usuario.
- [ ] **MVP-02** Confirmar el stack compatible con Vercel y el proyecto existente.
- [ ] **MVP-03** Crear el modelo relacional, auditoría/versionado y permisos desde el inicio.
- [ ] **MVP-04** Habilitar cuentas administradoras iniciales manuales, creación/restablecimiento de cuentas y concesiones de roles.
- [ ] **MVP-05** Verificar lectura/escritura real en base de datos, control de acceso y preservación de autoría.

### Bloque 2 — Registro EFA principal

- [ ] **MVP-06** Guardias EFA y seguimiento de una o varias bases.
- [ ] **MVP-07** Episodios, llamadas/comunicaciones, prioridades y despachos con tiempos y resultados.
- [ ] **MVP-08** Observaciones de conducta opcionales, relación con su contexto, coordinación policial compartida y eventos por móvil.
- [ ] **MVP-09** Verificar que una llamada pueda finalizar con despachos abiertos y que los eventos relacionados no se dupliquen.

### Bloque 3 — Dotación, catálogos y continuidad

- [ ] **MVP-10** Períodos anónimos de dotación, relevos, patrones y excepciones planificadas con historial de vigencia.
- [ ] **MVP-11** Catálogos administrables de móvil, base e instituciones, con desactivación sin borrar historia.
- [ ] **MVP-12** Avisos de corrección, estados de lectura, borradores locales, reintentos idempotentes y resolución manual de conflictos.
- [ ] **MVP-13** Verificar anulaciones/reactivaciones, límites de acceso y continuidad sin afectar los formularios públicos.

## Criterios de aceptación futuros

- Las personas sin permiso no acceden al área privada ni a datos ajenos.
- EFA solo ve/corrige sus registros; administración puede ver/corregir todos, incluidas las direcciones privadas. Revocar EFA deja el historial propio en solo lectura únicamente si la cuenta ya no conserva otro permiso EFA efectivo; administración hereda EFA.
- Las cuentas y los períodos de personal observado permanecen separados.
- Un episodio puede comenzar sin teléfono, contener varias comunicaciones y despachos y tener una llamada finalizada mientras hay despachos abiertos.
- Cada llamada y despacho requiere prioridad roja, amarilla o verde para finalizar; el borrador puede omitirla. Un despacho requiere además resultado, donde “No informado” es válido. Un despacho nuevo enlazado copia la prioridad de la llamada una sola vez; cambios posteriores no se propagan y un enlace tardío no sobrescribe la prioridad existente.
- Los tiempos faltantes conservan su estado semántico y no se convierten en cero; las relaciones mantienen tiempos de llamada, despacho, respuesta y llegada distintos.
- Una coordinación compartida almacena una vez las solicitudes/respuestas comunes y permite registrar hitos propios de cada despacho.
- Una modificación conserva auditoría; un aviso administrativo llega al autor original; anular no borra hijos ni historia.
- La operación de Google Forms y Apps Script no cambia, no se importa y no se duplica.
- No aparecen tableros, metas, umbrales, informes, puntuaciones individuales ni alertas automáticas en el MVP.

## Pendientes antes de implementar

1. Confirmar si se conserva algún campo independiente “zona segura” en la coordinación policial. No hacerlo obligatorio ni interpretar presencia policial como seguridad.
2. Revisar compatibilidad y versiones del stack propuesto con el repositorio y destino real que el usuario suba.
3. No se requiere un mapeo adicional entre bases y móviles para el MVP: cada opción institucional de Móvil se usa directamente como base operativa según la aclaración aceptada del 06-10-2026. Un modelo futuro de flota/patentes o asignaciones a personal requerirá definición propia.
4. Confirmar los detalles locales de captura de respuesta de base y colaboración sin adoptar como protocolo las categorías de un borrador externo.
5. Definir política de copias de seguridad, recuperación y retención; no se establecen períodos ni garantías en este documento.

## Fuentes y límites de evidencia

- Requerimientos del usuario consolidados en la conversación hasta 2026-10-05; las decisiones aceptadas prevalecen sobre los borradores previos.
- `src/routes/compensatorio.tsx`, `src/lib/compensatorio.functions.ts`, `src/routes/ingreso.tsx` y `src/lib/ingreso.functions.ts`: opciones estáticas de móvil en los formularios públicos actuales.
- `docs/google-apps-script/datosForm.json`: instantánea estática de contratos de formularios; el README de Apps Script indica actualizarla si cambia el esquema. No es consulta en vivo.
- `Matriz de competencias del telecomunicador de emergencias sanitarias.pdf`: borrador v0.1 expresamente no validado para SeLIAR/SIES 107. La matriz se acepta como línea de base del proyecto para el catálogo acotado de conductas, no como certificación de protocolos clínicos o locales ni como lista obligatoria de 24 ítems.
- `1-octubre-por-telegram.pdf`: cronograma mensual de enfermería, útil para observar variación de móviles y horarios; no es una fuente de nombres, asignaciones individuales ni mapeo canónico para importar.
- `1-Instrumento_observacion_bases_operativas.docx`: instrumento de observación propuesto, con campos derivados, umbrales y observaciones a bordo que no forman parte de este MVP salvo donde el usuario los aceptó explícitamente.
- La lectura de documentos fuente no valida protocolos clínicos, normativa, políticas laborales, permisos de tratamiento ni reglas de alojamiento. Esos puntos requieren revisión local antes de cualquier uso institucional.

## Registro de verificación de este documento

- Se creó únicamente este documento de alcance y planificación.
- No se editaron la aplicación, los formularios, configuración, dependencias, tareas de implementación ni archivos de metadatos.
- No se inició implementación, despliegue, prueba, compilación, importación de datos ni escritura de memoria Engram.
- La copia Engram sigue pendiente por falta de confirmación de identidad de sesión autorizada; este documento local conserva el alcance para retomar la conversación.
