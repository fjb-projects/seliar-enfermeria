export const TURNOS = ["24hs", "12hs", "8hs (mañana)", "8hs (tarde)", "8hs (noche)"] as const;

export interface InventarioItem {
  nombre: string;
  etiqueta?: string;
  cantidadEsperada?: number;
}

const ETIQUETAS_INVENTARIO: Record<string, string> = {
  "Tubo de O2 4151 Portátil (2)": "Tubo de O₂ portátil (2)",
  "Tubo de O2 3m. (2)": "Tubo de O₂ pesado (2)",
  "Manómetro 3m. (1)": "Manómetro tubo pesado (1)",
  "Manómetro oxin porta 1,5lt (1)": "Manómetro de oxígeno portátil (1)",
};

const items = (nombres: string[]): InventarioItem[] =>
  nombres.map((nombre) => {
    const cantidad = nombre.match(/\((\d+)/)?.[1];
    const etiqueta = ETIQUETAS_INVENTARIO[nombre];
    return cantidad
      ? { nombre, ...(etiqueta ? { etiqueta } : {}), cantidadEsperada: Number(cantidad) }
      : { nombre, ...(etiqueta ? { etiqueta } : {}) };
  });

export function etiquetaInventario(item: InventarioItem): string {
  return item.etiqueta ?? item.nombre;
}

// Los textos coinciden con las filas del Google Form. No cambiar sin actualizar el Form.
export const FARMACOLOGICOS = items([
  "Adrenalina (20)",
  "Agua destilada 5ml (5)",
  "Amiodarona (6)",
  "Atropina (5)",
  "Dexametasona (7)",
  "Diazepam (5)",
  "Diclofenac (7)",
  "Difenhidramina (5)",
  "Digoxina (3)",
  "Dipirona (5)",
  "Furosemida (5)",
  "Gluc. hipertónico al 50% (6)",
  "Hidrocortisona FA (4)",
  "Metroclopramida (7)",
  "Succinicolina 1% (3)",
  "Midazolam (4)",
  "Tramadol (4)",
  "noradrenalina 4mg (5)",
  "Sol. Dextrosa (5)",
  "Sol. Fisiologica (10)",
  "Labetalol (3)",
  "Sulfato de Magnesio 25 (3)",
  "Ac. acetil salicílico/100 mg (10)",
  "Isosorbida 5mg (15)",
  "Clopidrogel 75mg (8)",
  "Budesonide puff (1)",
  "Salbutamol Gotas/puff (1 c/u)",
  "Kit de Parto (2)",
  "Kit de Quemados (2)",
  "Kit de Bioseguridad N2 (3)",
]);

export const DESCARTABLES = items([
  "Catéter endovenoso nro. 14 (5)",
  "Catéter endovenoso nro. 16 (5)",
  "Catéter endovenoso nro. 18 (5)",
  "Catéter endovenoso nro. 20 (5)",
  "Catéter endovenoso nro. 22 (5)",
  "Catéter endovenoso nro. 24 (5)",
  "Aguja 40/12 (5)",
  "Aguja 40/8 IM (10)",
  "Aguja 25/8 EV (10)",
  "Aguja 16/5 SC (10)",
  "Jeringa 1 cc (5)",
  "Jeringa 5 cc (10)",
  "Jeringa 10 cc (10)",
  "Sist. de Goteo Macro  (10)",
  "Regulador de Flujo (2)",
  "Llave de 3 vías (2) ",
  "Agua Oxigenada 500ml (1)",
  "Alcohol 250ml (1)",
  "Yodo Povidona 250ml (1)",
  "Algodon con alcohol (1)",
  "Apósitos (20)",
  "Gasas(30)",
  "Guantes CH (100)",
  "Guantes M (100)",
  "Guantes L (100)",
  "Venda 5 cm (5)",
  "Venda 10 cm (5)",
  "Venda 20 cm (3)",
  "Barbijo tricapa (50)",
  "Barbijo N95 (3)",
  "Bolsa Roja 45 x 60 (1)",
  "Bisturi (5)",
  "Gafas (3)",
  "Bajalenguas (10)",
  "Cinta Papel/Tela/hipoalargenica (1c/u)",
  "Descartador Bolso/ Movil (1c/u)",
  "Tiras reactivas (10)",
  "Electrodos (10)",
]);

export const VIA_AEREA = items([
  "Ambu adulto/pediátrico c/ val. peep 1(c/u)",
  "Aerocámara (1) ",
  "Cánula de Aspiración Rígida (2)",
  "Cánula de Mayo 40mm (2)",
  "Cánula de Mayo 60mm (2)",
  "Cánula de Mayo 70mm (2)",
  "Cánula de Mayo 80mm (2)",
  "Cánula de Mayo 90mm (3)",
  "Cánula de Mayo 100mm (3)",
  "Cánula de Mayo 110mm (3)",
  "Cánula de Mayo 120mm (3)",
  "Filtro HMEF (3)",
  "Laringoscopio Adulto MAC (1)",
  "Laringoscopio ped. MILLEF (1)",
  "Mascara c/res. Adulto / Ped. (2 c/u)",
  "Mascara Neb. Adulto / Ped. (2c/u)",
  "Pinza de Maguill (1)",
  "Sonda de Aspiración (2)",
  "Sonda K 35/33/31 (1c/u)",
  "Sonda nasogástrica (2)",
  "Tubo de O2 4151 Portátil (2)",
  "Tubo de O2 3m. (2)",
  "Manómetro 3m. (1)",
  "Manómetro oxin porta 1,5lt (1)",
  "LLave boca nro. 28 (1)",
  "Tubos end. Nro. 4 (2)",
  "Tubos end. Nro. 4,5 (2)",
  "Tubos end. Nro. 5 (2)",
  "Tubos end. Nro. 5,5 (2)",
  "Tubos end. Nro. 6 (2)",
  "Tubos end. Nro. 6,5 (2)",
  "Tubos end. Nro. 7 (3)",
  "Tubos end. Nro. 7,5 (3)",
  "Tubos end. Nro. 8 (3)",
  "Tubos end. Nro. 8,5 (3)",
  "Tubo laríngeos AD/PED (2)",
  "Mascara Laríngea Nro. 3 (1)",
  "Mascara Laríngea Nro. 4 (1)",
  "Mascara Laríngea Nro. 5 (1)",
]);

export const EQUIPAMIENTOS_VARIOS = items([
  "Tabla espinal Larga (2)",
  "Tabla espinal Corta (1)",
  "Chaleco de Extricación Adulto/ ped. (1 c/u)",
  "Collar Cervical ch/M/G (3 c/u)",
  "Férulas Rígidas kit (1)",
  "inmovilizador Lateral (2)",
  "Cardiodesfibrilador (1)",
  "Electrocardiógrafo (1)",
  "Aspirador eléctrico (1)",
  "Oxímetro (1)",
  "Hemoglucotest (1)",
  "Tensiómetro adulto/ped. (1 c/u)",
  "Estetoscopio adulto/ped. (1c/u)",
  "Termómetro (1)",
  "Lona de Transporte (1)",
  "Sabana/ frazada  (1 c/u)",
  "Cubre Camilla (5)",
  "Chata (1)",
  "Papagayo (1)",
  "Control de Conversor",
]);

export interface OpcionInventario {
  id: string;
  etiqueta: string;
  corta: string;
}

export const CASILLAS_FARMACOLOGICOS: OpcionInventario[] = [
  { id: "faltante_1", etiqueta: "Faltante 1", corta: "F1" },
  { id: "faltante_2", etiqueta: "Faltan 2", corta: "F2" },
  { id: "faltante_3", etiqueta: "Faltan 3", corta: "F3" },
  { id: "faltante_4", etiqueta: "Faltan 4", corta: "F4" },
  { id: "roto", etiqueta: "Falta / roto / inexistente", corta: "Roto" },
  {
    id: "revisar",
    etiqueta: "Otra incidencia que requiere revisión y una anotación",
    corta: "Revisar",
  },
  { id: "completo", etiqueta: "Completo", corta: "OK" },
];

export const CASILLAS_DESCARTABLES: OpcionInventario[] = [
  { id: "faltante_1", etiqueta: "Faltante 1", corta: "F1" },
  { id: "faltante_2", etiqueta: "Faltante 2", corta: "F2" },
  { id: "faltante_3", etiqueta: "Faltante 3", corta: "F3" },
  { id: "faltante_4", etiqueta: "Faltante 4", corta: "F4" },
  { id: "roto", etiqueta: "Falta / roto / inexistente", corta: "Roto" },
  {
    id: "revisar",
    etiqueta: "Otra incidencia que requiere revisión y una anotación",
    corta: "Revisar",
  },
  { id: "completo", etiqueta: "Completo", corta: "OK" },
];

export const CASILLAS_EQUIPAMIENTO: OpcionInventario[] = [
  { id: "completo", etiqueta: "OK", corta: "OK" },
  { id: "faltante_parcial", etiqueta: "Faltante parcial (aclarar)", corta: "Parcial" },
  { id: "faltante", etiqueta: "Faltante", corta: "Falta" },
  { id: "deteriorado", etiqueta: "Deteriorado / requiere mantenimiento", corta: "Revisar" },
];

export type CasillaId = string;

export interface DatosGuardia {
  email: string;
  fecha: string;
  turno: string;
  movilNumero: string;
  patenteMovil: string;
  enfermeroEntrante: string;
  choferGuardia: string;
  medicoGuardia: string;
}

export interface RegistroPayload {
  guardia: DatosGuardia;
  farmacologicos: Record<string, CasillaId[]>;
  descartables: Record<string, CasillaId[]>;
  viaAerea: Record<string, CasillaId[]>;
  equipamientosVarios: Record<string, CasillaId[]>;
  intervencionesCantidad: string;
  observacionesFarmacologicos: string;
  observacionesDescartables: string;
  observacionesEquipamiento: string;
  observacionesGenerales: string;
  enfermeroRecibe: string;
  confirmaciones: string[];
}

export const INSTRUCCIONES_INVENTARIO = [
  "Marcá el estado de cada ítem. Las opciones se envían con las mismas etiquetas del formulario original.",
  "Aclarar faltantes, roturas o faltantes mayores a 10 unidades en las observaciones de la sección.",
];

export const CONFIRMACIONES_FIN_GUARDIA = [
  "Confirmo la entrega de la guardia en condiciones y la verificación del Inventario",
  "Se me toma la guardia en tiempo y forma",
  "Entrego la guardia en conformidad",
  "Entrego la guardia en disconformidad",
] as const;

export const SECCIONES = [
  { id: 1, titulo: "Datos de la Guardia y del Personal" },
  { id: 2, titulo: "Control de Farmacológicos" },
  { id: 3, titulo: "Control de Descartables — Curaciones" },
  { id: 4, titulo: "Control de Equipamientos" },
  { id: 5, titulo: "Intervenciones y Novedades" },
  { id: 6, titulo: "Confirmación del Pase de Guardia" },
] as const;
