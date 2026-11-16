// Mapeo de campos del registro a los IDs "entry.NNNNNN" del Google Form original.
// PENDIENTE: completar con los IDs reales. Se obtienen desde el formulario
// (logueado): menú ⋮ → "Obtener enlace precompletado" → copiar el enlace.
// Cuando estén cargados, el envío llega a la misma planilla de respuestas.

export const FORM_ID = "1FAIpQLSccSyehoVGKbG2ICwLHHpRP_VgiuzZC_VipbwqpDaL9IFkpcg";

export const ENTRY_IDS: Record<string, string> = {
  // Ejemplo de formato una vez obtenidos:
  // email: "entry.111111111",
  // fecha: "entry.222222222",
  // turno: "entry.333333333",
  // movilNumero: "entry.444444444",
  // patenteMovil: "entry.555555555",
  // enfermeroEntrante: "entry.666666666",
  // choferGuardia: "entry.777777777",
  // medicoGuardia: "entry.888888888",
  // farmacologicos: "entry.999999999",
  // descartables: "entry.101010101",
  // observacionesGenerales: "entry.121212121",
};

export const ENVIO_CONFIGURADO = Object.keys(ENTRY_IDS).length > 0;
