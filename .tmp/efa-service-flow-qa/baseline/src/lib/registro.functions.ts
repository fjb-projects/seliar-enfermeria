import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const casillasSchema = z.array(z.string().trim().min(1).max(80)).max(6);
const inventarioSchema = z.record(z.string().trim().min(1).max(255), casillasSchema);

const payloadSchema = z.object({
  guardia: z.object({
    email: z.string().trim().email("Correo electrónico inválido").max(255),
    fecha: z.string().trim().nonempty("La fecha es obligatoria"),
    turno: z.string().trim().nonempty("El turno es obligatorio"),
    movilNumero: z.string().trim().nonempty().max(20),
    patenteMovil: z.string().trim().nonempty().max(20),
    enfermeroEntrante: z.string().trim().nonempty().max(120),
    choferGuardia: z.string().trim().nonempty().max(120),
    medicoGuardia: z.string().trim().nonempty().max(120),
  }),
  farmacologicos: inventarioSchema,
  descartables: inventarioSchema,
  viaAerea: inventarioSchema,
  equipamientosVarios: inventarioSchema,
  intervencionesCantidad: z.string().trim().nonempty().max(40),
  observacionesFarmacologicos: z.string().trim().max(2000),
  observacionesDescartables: z.string().trim().max(2000),
  observacionesEquipamiento: z.string().trim().max(2000),
  observacionesGenerales: z.string().trim().nonempty().max(4000),
  enfermeroRecibe: z.string().trim().nonempty().max(120),
  confirmaciones: z.array(z.string().trim().min(1).max(200)).max(4),
});

export type ResultadoEnvio =
  | { estado: "enviado"; emailSolicitado: boolean; emailEnviado: boolean; errorEmail?: string }
  | { estado: "no_configurado" }
  | { estado: "error"; detalle: string };

const MAX_ADJUNTOS = 3;
const MAX_TAMANIO_ADJUNTO = 3 * 1024 * 1024;
const TIPOS_IMAGEN = new Set(["image/jpeg", "image/png", "image/webp"]);

interface AdjuntoParaDrive {
  nombre: string;
  tipo: string;
  base64: string;
}

function esArchivo(valor: FormDataEntryValue): valor is File {
  return typeof valor !== "string" && typeof valor.arrayBuffer === "function";
}

function convertirBase64(bytes: Uint8Array): string {
  let binario = "";
  const tamanoBloque = 0x8000;
  for (let inicio = 0; inicio < bytes.length; inicio += tamanoBloque) {
    binario += String.fromCharCode(...bytes.subarray(inicio, inicio + tamanoBloque));
  }
  return btoa(binario);
}

function resumirErrorExterno(contenido: string): string {
  return contenido
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

async function leerEntrada(formData: FormData) {
  const registroCrudo = formData.get("registro");
  if (typeof registroCrudo !== "string") throw new Error("Registro ausente");
  const emailSolicitadoCrudo = formData.get("emailRequested");
  if (emailSolicitadoCrudo !== "true" && emailSolicitadoCrudo !== "false") {
    throw new Error("Preferencia de correo inválida");
  }
  const emailSolicitado = emailSolicitadoCrudo === "true";

  const registro = payloadSchema.parse(JSON.parse(registroCrudo));
  const adjuntos = formData.getAll("adjuntos").filter(esArchivo);

  if (adjuntos.length > MAX_ADJUNTOS) throw new Error("Se permiten hasta 3 imágenes");

  const archivos = await Promise.all(
    adjuntos.map(async (adjunto): Promise<AdjuntoParaDrive> => {
      if (!TIPOS_IMAGEN.has(adjunto.type) || adjunto.size > MAX_TAMANIO_ADJUNTO) {
        throw new Error("Cada imagen debe ser JPG, PNG o WebP y pesar hasta 3 MB");
      }
      return {
        nombre: adjunto.name || "imagen",
        tipo: adjunto.type,
        base64: convertirBase64(new Uint8Array(await adjunto.arrayBuffer())),
      };
    }),
  );

  return { registro, archivos, emailSolicitado };
}

export const enviarRegistro = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Formato de envío inválido");
    return data;
  })
  .handler(async ({ data }): Promise<ResultadoEnvio> => {
    const url = process.env["GOOGLE_APPS_SCRIPT_URL"];
    const secreto = process.env["GOOGLE_APPS_SCRIPT_SECRET"];

    if (!url || !secreto) return { estado: "no_configurado" };

    try {
      const { registro, archivos, emailSolicitado } = await leerEntrada(data);
      const respuesta = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: secreto,
          registro,
          archivos,
          emailRequested: emailSolicitado,
        }),
        redirect: "follow",
      });

      const textoRespuesta = await respuesta.text();
      if (!respuesta.ok) {
        const detalleExterno = resumirErrorExterno(textoRespuesta);
        return {
          estado: "error",
          detalle: `Apps Script respondió ${respuesta.status}${detalleExterno ? `: ${detalleExterno}` : ""}`,
        };
      }

      let contenido: {
        ok?: unknown;
        error?: unknown;
        emailRequested?: unknown;
        emailEnviado?: unknown;
      };
      try {
        contenido = JSON.parse(textoRespuesta) as {
          ok?: unknown;
          error?: unknown;
          emailRequested?: unknown;
          emailEnviado?: unknown;
        };
      } catch {
        const detalleExterno = resumirErrorExterno(textoRespuesta);
        return {
          estado: "error",
          detalle: detalleExterno
            ? `Apps Script devolvió una respuesta no válida: ${detalleExterno}`
            : "Apps Script devolvió una respuesta vacía",
        };
      }
      if (contenido.ok !== true) {
        return {
          estado: "error",
          detalle:
            typeof contenido.error === "string"
              ? contenido.error
              : "Apps Script rechazó el registro",
        };
      }

      return {
        estado: "enviado",
        emailSolicitado,
        emailEnviado: emailSolicitado && contenido.emailEnviado === true,
      };
    } catch (error) {
      return {
        estado: "error",
        detalle: error instanceof Error ? error.message : "Error de red",
      };
    }
  });
