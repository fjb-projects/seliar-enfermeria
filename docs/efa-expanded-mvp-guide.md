# Guía operativa del MVP EFA ampliado

Esta guía resume el recorrido de administración y operación para guardias, planificación, dotación observada y episodios. Requiere una cuenta autenticada con acceso EFA; las tareas administrativas requieren rol de administración. La operación institucional queda pendiente de configurar y verificar la base de datos indicada al final.

## Preparación de administración

1. En **Administración de usuarios** (`/admin-usuarios`), carga las opciones aprobadas en **Catálogo de instituciones y destinos**. Corregir, desactivar o reactivar conserva la historia; no ingreses domicilios particulares.
2. En **Planificación futura de cobertura**, elige una base del catálogo **Compensatorio**, define ciclos por fecha y rol, y agrega excepciones para fechas puntuales. Una excepción reemplaza el ciclo de ese día; sin tramos significa que no hay cobertura planificada.
3. Revisa la vista previa y el historial. La planificación es futura: no representa personal real ni disponibilidad confirmada. No se crea un catálogo separado de móviles, flota o patentes; las opciones existentes de **Compensatorio** son las opciones de base usadas aquí.

## Recorrido EFA

1. En **Guardias EFA** (`/guardia-efa`), inicia la guardia y selecciona una o más bases del catálogo. Registra cambios de base cuando ocurran; presencia en Central es declarada, no geolocalizada.
2. Registra la dotación que observaste por rol (enfermería, conducción y medicina), sin nombres ni cuentas. Agrega relevos, salidas, traslados y regresos cuando se conozcan. La falta de una observación no confirma ausencia. La planificación puede consultarse como referencia, pero no completa estos datos.
3. En **Episodios EFA** (`/episodios-efa`), crea el servicio y agrega llamadas u otras comunicaciones y uno o más despachos según corresponda. La llamada puede finalizar mientras un despacho sigue abierto; cada despacho conserva sus propios tiempos y resultado. El destino institucional de un despacho es opcional y se selecciona del catálogo; un domicilio particular pertenece al episodio, no al catálogo.
4. En la guardia, abre **Ver conductas observadas** para consultar o registrar conductas vinculadas a esa guardia según los permisos disponibles. Son observaciones opcionales: no sustituyen datos del episodio ni constituyen una evaluación de personas.

## Cierre y anulación son acciones distintas

| Registro             | Cierre/finalización                                                                                                                                     | Anulación y reactivación                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Episodio/servicio    | **Cerrar servicio** finaliza el servicio real. No cierra la guardia ni modifica llamadas, despachos u otros registros; no hay reapertura de ese cierre. | **Anular** se reserva para error o duplicado y conserva los datos. Primero deben estar anuladas sus llamadas y despachos activos. **Reactivar** restaura el estado anterior del episodio, sin cambiar sus hijos. |
| Llamada/comunicación | **Finalizar llamada** registra que terminó la comunicación; no finaliza el episodio ni los despachos.                                                   | Anular/reactivar conserva el historial; no cambia el episodio ni despachos relacionados.                                                                                                                         |
| Despacho             | **Finalizar despacho** registra su resultado y cierre; no se deduce por fin de guardia o disponibilidad del móvil.                                      | Anular/reactivar conserva datos y vínculos; no anula ni reactiva otros registros.                                                                                                                                |

No hay anulación en cascada. La anulación del episodio se bloquea si mantiene una llamada o despacho no anulado. Reactiva cada registro de manera explícita cuando corresponda. Revisa el estado confirmado antes de repetir una acción.

## Avisos y almacenamiento local

- Los avisos de corrección informan que administración modificó un registro; pueden marcarse como leídos. El aviso no incluye el contenido privado del episodio.
- La cola local de operaciones usa IndexedDB del mismo origen y dispositivo; el acceso local a esos datos no es exclusivo de la aplicación. No la trates como respaldo ni asumas sincronización entre dispositivos.
- Antes de enviar, la aplicación debe poder conservar la operación localmente. Si el almacenamiento no está disponible, el envío se bloquea. Ante una respuesta incierta, usa el reintento de la misma operación y verifica su estado; no cambies sus datos mientras siga pendiente. El texto todavía no enviado puede perderse.
- No introduzcas datos personales innecesarios. Protege el dispositivo y evita compartir perfiles del navegador; las direcciones privadas son datos del episodio y requieren especial cuidado.

## Verificación antes de la operación institucional

- [ ] En móvil, con una cuenta EFA: iniciar una guardia, seleccionar varias bases, cambiar una base y revisar el historial; registrar y completar un período anónimo con relevo/traslado o regreso.
- [ ] En móvil, consultar una planificación y comprobar que se distingue de la dotación observada; registrar un episodio con llamada y despacho, probar destino institucional opcional y observar avisos y reintento local.
- [ ] En escritorio, con administración: agregar/corregir/desactivar/reactivar una institución y revisar historial; guardar un patrón futuro y una excepción, y consultar la vista previa.
- [ ] Verificar que la anulación no borre hijos y que el episodio activo con llamada o despacho no permita anulación; comprobar reactivación explícita y estados independientes de cierre.
- [ ] Confirmar el resguardo de datos privados en los dispositivos y el acceso mínimo necesario para cada rol.

Esta rama agrega las migraciones **0012 a 0020**; esta sesión no las aplicó. La persona responsable debe comprobar cuáles faltan en el entorno configurado y ejecutar `npm run db:migrate`, revisando el resultado antes del uso institucional. El estado real de la base, el bloqueo concurrente de PostgreSQL/Neon y el flujo de navegador/IndexedDB aún requieren verificación; la batería local y los dobles de prueba no sustituyen esas comprobaciones. Los formularios públicos de Google Forms/Apps Script permanecen sin cambios.
