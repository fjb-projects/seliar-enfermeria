# Guardado confiable de borradores EFA

## Objetivo

Hacer visible junto al botón de guardado un error al preparar el borrador, conservar el formulario y mantener diagnósticos útiles sin exponer detalles internos. Asegurar que la creación de una identidad local de operación siga funcionando cuando `crypto.randomUUID` no está disponible.

## Problema y motivo

En `/episodios-efa`, un error de preparación se muestra actualmente en el área global superior, lejos de «Guardar borrador». El usuario reportó ese fallo con una guardia activa. El código también usa `crypto.randomUUID()` como valor predeterminado al crear la operación. La ausencia de esa API es una hipótesis plausible, no una causa confirmada del incidente reportado.

## Alcance y restricciones

- Mostrar el error de guardado inmediatamente debajo de su CTA y mantener intactos otros errores globales.
- Conservar los valores ingresados y no revelar mensajes de excepción, datos del episodio ni detalles de infraestructura en la interfaz.
- Probar el fallback de identidad con un entorno determinístico; la identidad de reintento permanece estable dentro de la operación creada.
- Preservar cambios preexistentes ajenos a esta tarea; no incluirlos en el trabajo.
- No afirmar que se reprodujo la causa del entorno del usuario.

## Ruta y tamaño previsto

Ruta: delegada directa. La preparación para escribir abarca varios archivos no triviales y activa la regla de preparación/delegación; un único trabajador implementa y verifica este work unit.

Pronóstico inicial: menos de 400 líneas de autoría, incluyendo regresiones y esta documentación; es una estimación, no un límite.

## Criterios de aceptación

- El error de preparación aparece justo debajo de «Guardar borrador» y los errores globales de otras acciones siguen visibles donde estaban.
- Un error desconocido conserva un mensaje seguro para la persona usuaria y permite diagnóstico técnico sin mostrar el contenido de la excepción.
- La prueba demuestra la generación de un UUID seguro mediante `crypto.getRandomValues` cuando `randomUUID` no está disponible; si tampoco existe la fuente criptográfica segura, la operación falla explícitamente sin identificador inseguro.
- El formulario no se limpia ni se reemplaza tras el fallo.
- Pruebas EFA dirigidas, typecheck si corresponde, formatter en modo check y `git diff --check` terminan con resultados registrados.

## Tareas

- [x] **EFA-SAVE-1**: agregar regresiones determinísticas para el fallback de identidad y registrar RED antes de implementar.
- [x] **EFA-SAVE-2**: mostrar los errores de preparación junto al CTA, preservar los errores globales y añadir diagnóstico seguro para errores inesperados.
- [x] **EFA-SAVE-3**: generar identidad criptográficamente aleatoria cuando falte `crypto.randomUUID` y verificar estabilidad/uniqueness en pruebas.
- [x] **EFA-SAVE-4**: ejecutar comprobaciones requeridas, registrar resultados y revisar el diff limitado a las superficies autorizadas.
- [x] **EFA-SAVE-5**: construir y clonar la entrada de cola antes de marcar la operación pendiente; limpiar el aviso local al seleccionar otra operación o cambiar de propietario.
- [x] **EFA-SAVE-6**: limpiar el aviso al restaurar una operación de cola y descartar errores tardíos si cambió el propietario activo.

## Evidencia y estado

- Exploración: el `catch` de `save` asigna un error global que se renderiza en el panel por encima del formulario; el CTA está más abajo. La creación usa `crypto.randomUUID` sin fallback. Esto confirma la ruta de error y un riesgo de compatibilidad, pero no demuestra la causa exacta del reporte del usuario.
- Prueba RED observada antes del cambio: `npm.cmd run test -- src/lib/efa-episodes.client.test.ts` terminó con 1 fallo y 10 aprobadas; sin `crypto.randomUUID`, `createPendingCreate` lanzó `TypeError: crypto.randomUUID is not a function`.
- Prueba de ubicación contextual del aviso: pendiente de lectura estructural; la suite del panel usa renderizado estático y no simula interacción DOM.
- GREEN final: `npm.cmd run test -- src/components/EfaEpisodePanel.test.tsx src/lib/efa-episodes.client.test.ts`, exit 0 (2 archivos, 18 pruebas).
- Typecheck final: `npm.cmd run typecheck`, exit 0. La primera ejecución detectó dos accesos indexados posiblemente indefinidos; se corrigieron antes de la ejecución final.
- Formato: `npx.cmd prettier --check src/components/EfaEpisodePanel.tsx src/components/EfaEpisodePanel.test.tsx src/lib/efa-episodes.client.ts src/lib/efa-episodes.client.test.ts odd/tasks/efa-draft-save-feedback.md`, exit 0. Prettier normalizó los dos archivos del panel antes de las comprobaciones finales.
- Whitespace: `git diff --check` sobre los cuatro archivos fuente/prueba, exit 0.
- Lectura estructural confirma que el `role="alert"` local se ubica inmediatamente después del botón; el test del panel no ejecuta eventos DOM, por eso esa ubicación no se presenta como una regresión interactiva comprobada.
- Causa del incidente del usuario: no reproducida ni atribuida. La incompatibilidad de `randomUUID` sí quedó reproducida determinísticamente en la prueba RED.
- Corrección de revisión: la construcción/clonado de la entrada ahora termina antes de asignar `pending` y `pendingRef`; ante un error de preparación, la CTA queda habilitada para reintentar. La asignación sigue antes de `runQueueEntry`, y un error incierto de cola conserva la misma operación pendiente.
- El aviso local se limpia al iniciar una creación nueva, seleccionar otra edición y al reiniciar el estado por cambio de propietario.
- Revisión independiente adicional: `restoreQueueEntry` ahora limpia `saveError`; el `catch` de `save` valida que el ticket siga vigente antes de emitir diagnóstico o actualizar el error contextual.
- No se añadió una prueba de interacción del panel: el harness existente solo renderiza estáticamente y no ofrece DOM/eventos; la secuencia de efectos y la posición del error se comprobaron mediante lectura estructural.
- Revalidación de las correcciones: `npm.cmd run test -- src/components/EfaEpisodePanel.test.tsx src/lib/efa-episodes.client.test.ts`, exit 0 (2 archivos, 18 pruebas); `npm.cmd run typecheck`, exit 0; `npx.cmd prettier --check` sobre las cinco superficies autorizadas, exit 0; `git diff --check` sobre fuentes y pruebas, exit 0.
- Commit: no aplica en este encargo; el orquestador inspeccionará el alcance, decidirá la revisión nativa y hará el commit con los archivos autorizados.

## Próximo paso

El orquestador revisa este work unit y realiza el commit conforme a la instrucción delegada.
