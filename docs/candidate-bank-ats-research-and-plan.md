# Banco de candidatos y ATS: investigación y plan gradual

**Fecha:** 2026-10-26. **Estado:** propuesta para validar; sin implementación autorizada.
**Prioridad:** P2, después del primer circuito utilizable de [horas compensatorias](./compensatory-hours-research-and-plan.md).
**Objetivo:** conservar candidatos para vacantes, licencias y reemplazos, con perfiles verificables y coincidencias explicables por necesidad del servicio.

## Recomendación

Construir primero un **banco de candidatos con carga manual y clasificación asistida por criterios explícitos**. No empezar conectando todo el correo ni comprando un motor de IA. La carga gradual funciona con archivos ya descargados y fotos/escaneos de los CV en papel; OCR y extracción automática pueden incorporarse sin bloquear el uso inicial.

“Segunda selección” debe ser relativa a una necesidad concreta, no una etiqueta permanente de menor calidad. Una persona puede ser prioritaria para un reemplazo y estar en reserva para otra vacante. La decisión final corresponde a la administración.

### Clasificación

| Aspecto | Clasificación |
| --- | --- |
| Dominio | Reclutamiento, gestión documental y apoyo a selección. Separado de historia laboral y EFA. |
| Tamaño | Feature grande, con fases independientes y decisiones de criterios, privacidad y proveedores. |
| Riesgo de implementación | Alto: datos personales/importación (1), autorización y archivos (2), correo/proveedores (5); deduplicación y trabajos concurrentes (4) al automatizar. |
| MVP recomendado | A1: candidatos, CV privados, perfiles manuales, filtros por necesidad y selección principal/reserva con justificación humana. |
| Fuera del MVP | Lectura automática del buzón, ranking opaco, rechazo automático, contratación y verificación automática de matrículas. |

## Pedido y evidencia actual

El usuario solicita “filtro ats + generación del perfil, más guardado en la db + clasificador de perfil según determinados criterios”, con “matches acordes a la necesidades del servicio” y “segunda selección”. Tiene CV “en el correo” y “en papel”, y quiere cargar “de a poco”.

Los criterios todavía no están definidos. No inventar pesos, puntuaciones de aptitud ni requisitos excluyentes. El MVP captura un perfil manual persistido; la generación automática de borradores llega en A3 y nunca convierte una inferencia en credencial verificada.

En el mapeo local no aparecieron entidades de candidatos ni almacenamiento privado de CV. Sí existen acceso administrativo (`src/routes/admin-usuarios.tsx:19-36`), PostgreSQL/Drizzle (`src/db/index.server.ts:1-16`) y patrones de auditoría (`src/lib/efa-communications.server.ts:164-190`). Son puntos de integración, no un ATS ya disponible. No se inspeccionaron buzones ni sistemas remotos.

## Fases y criterio de inauguración

Todas las fases están propuestas y pendientes de aceptación.

| Fase | Alcance utilizable | Condición de salida | Contrapartida |
| --- | --- | --- | --- |
| A0 — Reglas del banco | Definir responsable, acceso, campos mínimos, finalidad, aviso al candidato, retención y criterios de una necesidad piloto. | Administración acepta el uso y los criterios; se valida el tratamiento aplicable de datos personales. | Sin esto, digitalizar crea un depósito de información difícil de gobernar. |
| A1 — MVP manual | Subir PDF/foto/escaneo; perfil estructurado; fuente y fecha; detección orientativa de duplicados; búsqueda/filtros; lista principal/reserva por necesidad, decidida por una persona. | Recuperar y clasificar candidatos para una necesidad real; corregir perfil; proteger originales; documentar por qué está en cada grupo. | Más carga manual, menor costo y dependencia; no hay generación automática todavía. |
| A2 — Matching por reglas | Criterios versionados obligatorios/deseables; comparación de evidencia y faltantes; orden sugerido explicable con revisión humana. | Repetir una evaluación con los mismos datos/reglas produce el mismo resultado; cambios y excepciones quedan justificados. | Requiere acordar criterios y mantener datos; un número único puede esconder faltantes. |
| A3 — OCR y borrador de perfil | Extraer texto de CV digital o escaneado; proponer campos con página/evidencia/confianza; revisar antes de publicar el perfil. | Medir errores por campo en una muestra autorizada; documentos ilegibles van a revisión; nada inventado se guarda como verificado. | Menos transcripción a cambio de costo, exposición a proveedor y revisión obligatoria. |
| A4 — Correo autorizado | Conectar exclusivamente buzón/carpeta/proveedor acordados, importar adjuntos incrementalmente y controlar errores. | Alcance de autorización explícito; reintentos, duplicados, expiración de permisos y eliminación verificados; sin mensajes ajenos importados. | OAuth, mantenimiento y privacidad adicionales; posponer si la carga manual basta. |

A2 y A3 son desacoplables: el matching funciona con perfiles manuales. Si la transcripción resulta el mayor costo, se puede priorizar A3 antes de A2 sin cambiar el MVP.

## Flujo mínimo de carga gradual

1. CV recibido por correo: descargar el archivo elegido y cargarlo manualmente. No pedir acceso al buzón para el piloto. Registrar canal y referencia mínima, no todo el hilo.
2. Papel: escanear/fotografiar páginas completas y legibles, verificar orden y asociarlas a una misma versión de CV. Permitir dejar la ficha pendiente si faltan páginas.
3. Registrar nombre y medio de contacto; luego formación, matrícula declarada/verificada, experiencia pertinente, disponibilidad, movilidad y certificaciones cuando correspondan a criterios acordados.
4. Revisar posibles duplicados por contacto y huella del archivo. No fusionar por nombre; una persona puede aportar varias versiones. Un hash evita repetir un archivo, no demuestra identidad personal.
5. Validar la ficha y evaluarla contra una necesidad. Guardar resultado, razones y fecha; actualizar disponibilidad antes de convocar.

No convertir un candidato en agente automáticamente. Una futura incorporación debe crear/vincular la identidad laboral mediante una decisión autorizada, sin copiar el CV completo a la historia de compensatorias.

## Modelo conceptual y límites

| Entidad propuesta | Datos / responsabilidad |
| --- | --- |
| `candidates` | Identidad y contacto mínimos, disponibilidad, última confirmación y estado del banco. |
| `candidate_documents` | Original privado, versión, fuente, fecha, checksum, páginas y estado de revisión/seguridad. |
| `candidate_profile_fields` | Valor, fuente/página, estado declarado/extraído/verificado, revisor y fecha. |
| `service_requirements` | Vacante o cobertura y criterios versionados acordados por administración. |
| `candidate_evaluations` | Evidencia por criterio, faltantes, sugerencia, decisión humana y explicación. |
| `candidate_audit_events` | Accesos relevantes, cambios, revisiones, clasificación y eliminación según política. |

Archivos en almacenamiento privado; metadatos y relaciones en la base existente. Elegir proveedor después de revisar alojamiento, volumen, costo, respaldo y residencia/transferencia de datos. No almacenar CV en rutas públicas ni convertir la base relacional en un repositorio de archivos por defecto.

## Clasificación explicable y supervisada

- Comparar requisitos laborales pertinentes, no características personales irrelevantes. Confirmar qué credenciales requieren verificación oficial y quién la realiza.
- Separar **cumple**, **no cumple con evidencia** y **sin información / pendiente de verificar**. No encontrar una matrícula en el OCR no demuestra que la persona no la tenga.
- Mostrar qué criterio explica cada coincidencia y su fuente. No inferir personalidad, salud, embarazo, religión, afiliación, origen u otras características sensibles desde texto o fotografía.
- Guardar versiones de perfil y requisitos usados; un cambio en la vacante no debe reescribir una evaluación histórica.
- Permitir corrección y revisión humana. Una prioridad baja no envía rechazo ni elimina el perfil. Cualquier filtro excluyente requiere criterio pertinente acordado y evidencia revisada.
- La reserva conserva motivo y disponibilidad; también puede existir “pendiente de información”. No forzar a todas las personas a dos grupos cuando faltan datos.

El marco NIST sirve para evaluar validez, transparencia, privacidad y sesgos; no certifica aptitud de un modelo ni cumplimiento de normas de contratación. [NIST AI RMF](https://airc.nist.gov/airmf-resources/airmf/3-sec-characteristics/).

## OCR, correo y seguridad: resultados de research

| Hallazgo de fuente primaria | Implicación propuesta |
| --- | --- |
| OWASP recomienda defensa en capas para cargas: formatos permitidos, límites, validación, nombres generados, autorización y almacenamiento aislado. | Admitir inicialmente PDF/JPEG/PNG; validar contenido, limitar tamaño/páginas, cuarentena/escaneo y vistas seguras. No confiar solamente en extensión o MIME enviado por el cliente. [OWASP File Upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html). |
| Textract documenta procesamiento asíncrono de documentos multipágina y retención predeterminada de resultados durante siete días. | Es una opción para investigar, no proveedor elegido; OCR no es comprensión ni verificación profesional. Comparar calidad, precio y tratamiento de datos antes de enviar CV reales. [Textract](https://docs.aws.amazon.com/textract/latest/dg/api-async.html). |
| Gmail clasifica `gmail.readonly` como permiso restringido. | La conexión completa agrega obligaciones y alcance; seleccionar una carpeta en la aplicación no necesariamente reduce el permiso OAuth. No prometer “solo adjuntos” sin revisar permisos reales. [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes). |
| Graph ofrece sincronización incremental de mensajes por carpeta. | Útil para no reimportar todo, pero obtener adjuntos necesita permisos adecuados, no solo metadatos básicos. Elegir conociendo el proveedor real. [Microsoft Graph delta](https://learn.microsoft.com/en-us/graph/api/message-delta?view=graph-rest-1.0). |

Si se incorpora un LLM, tratar texto del CV como datos no confiables: no ejecutar instrucciones del documento, no habilitar herramientas al extractor, validar salida estructurada y mantener revisión humana. No enviar CV a proveedores sin aprobación del tratamiento y revisar retención y uso de datos de cada servicio elegido.

## Privacidad y conservación

La Ley argentina 25.326 contempla calidad/finalidad de datos, información a sus titulares, seguridad y derechos de acceso/rectificación/supresión. La base jurídica, las excepciones al consentimiento y las reglas del empleador requieren validación contextual; **recibir un CV no se toma como autorización ilimitada para conservarlo o enviarlo a cualquier proveedor**. [Texto oficial](https://www.argentina.gob.ar/normativa/nacional/ley-25326-64790/texto).

Antes del piloto: definir finalidad, responsables, acceso administrativo limitado, plazo/revisión de conservación y canal de actualización/retiro. No fijar arbitrariamente una retención permanente. Minimizar campos y no extraer datos sensibles innecesarios aunque aparezcan en el original. Diseñar eliminación de original, derivados y copias según obligaciones y política; la auditoría no justifica conservar todo el CV para siempre.

## Validación prevista y decisiones pendientes

Pruebas futuras: acceso indebido a CV rechazado; archivo malicioso o formato no permitido bloqueado; URL privada no accesible sin autorización; duplicado revisable sin fusión automática; OCR ilegible marcado pendiente; faltante no tratado como incumplimiento; ranking reproducible por versión y revisión humana; borrado/retención coherentes; reimportación de correo sin duplicados.

No se ejecutaron pruebas ni se procesaron CV reales. Vitest ya existe en el proyecto; las integraciones requieren entornos aislados y datos sintéticos o una muestra explícitamente autorizada. Antes de elegir OCR, medir exactitud por campo, tiempo de revisión y costo por documento, no solo porcentaje global de texto reconocido.

Decisiones para A0: volumen y formatos, primer servicio/necesidad, criterios pertinentes, responsables de revisión, finalidad/retención y permisos. Para A3/A4: presupuesto, proveedor, buzón y alcance autorizado. Estas preguntas se resolverán después de encuadrar la prioridad de compensatorias; no bloquean la documentación actual.

**Siguiente paso:** mantener este plan como backlog de producto, sin abrir una implementación paralela que retrase compensatorias. Fuentes públicas consultadas el 2026-10-26; proveedores y precios no contratados ni seleccionados.
