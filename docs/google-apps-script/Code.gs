const FORM_ID = "1z2b95E3YAOJHsscoR0Kk7yfV4adJsm02zKPmGKrfVfw";
const UPLOADS_FOLDER_ID =
  "1dgzkrvyd6z37E70wufV6x656I8z5FqQJcWZHpLErHbMqEZIbAB-Pwlh-2peC4c95iFWaGxAs";

const ITEM_IDS = {
  fecha: 984580970,
  turno: 1954364840,
  movilNumero: 1981905547,
  patenteMovil: 1531623962,
  enfermeroEntrante: 154284008,
  choferGuardia: 1316175143,
  medicoGuardia: 803526780,
  farmacologicos: 1697862237,
  descartables: 1609189396,
  viaAerea: 1470921868,
  equipamientosVarios: 1819537253,
  intervencionesCantidad: 1437617412,
  observaciones: 2141211120,
  enfermeroRecibe: 1779868149,
  confirmaciones: 610071628,
};

function respuestaJson(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function doGet() {
  return respuestaJson({ ok: true, servicio: "SELIAR" });
}

function verificarDestino() {
  const form = FormApp.openById(FORM_ID);
  const carpeta = DriveApp.getFolderById(UPLOADS_FOLDER_ID);
  Logger.log(
    JSON.stringify({
      formulario: form.getTitle(),
      carpeta: carpeta.getName(),
      carpetaId: carpeta.getId(),
    }),
  );
}

function doPost(evento) {
  try {
    const payload = JSON.parse(evento && evento.postData ? evento.postData.contents : "{}");
    const secreto = PropertiesService.getScriptProperties().getProperty("API_SECRET");

    if (!secreto || payload.secret !== secreto) {
      return respuestaJson({ ok: false, error: "No autorizado" });
    }
    if (typeof payload.emailRequested !== "boolean") {
      return respuestaJson({ ok: false, error: "Preferencia de correo inválida" });
    }

    const registro = payload.registro;
    if (!registro || !registro.guardia) {
      return respuestaJson({ ok: false, error: "Registro inválido" });
    }

    const form = FormApp.openById(FORM_ID);
    const respuesta = form.createResponse();
    const guardia = registro.guardia;

    const correo = buscarItemPorTitulo(form, "Correo electrónico");
    respuesta.withItemResponse(correo.asTextItem().createResponse(guardia.email));
    respuesta.withItemResponse(
      itemPorId(form, ITEM_IDS.fecha).asDateItem().createResponse(fechaDesdeIso(guardia.fecha)),
    );
    respuesta.withItemResponse(
      itemPorId(form, ITEM_IDS.turno).asMultipleChoiceItem().createResponse(guardia.turno),
    );
    agregarTexto(respuesta, form, ITEM_IDS.movilNumero, guardia.movilNumero);
    agregarTexto(respuesta, form, ITEM_IDS.patenteMovil, guardia.patenteMovil);
    agregarTexto(respuesta, form, ITEM_IDS.enfermeroEntrante, guardia.enfermeroEntrante);
    agregarTexto(respuesta, form, ITEM_IDS.choferGuardia, guardia.choferGuardia);
    agregarTexto(respuesta, form, ITEM_IDS.medicoGuardia, guardia.medicoGuardia);

    agregarCuadricula(respuesta, form, ITEM_IDS.farmacologicos, registro.farmacologicos, false);
    agregarCuadricula(respuesta, form, ITEM_IDS.descartables, registro.descartables, false);
    agregarCuadricula(respuesta, form, ITEM_IDS.viaAerea, registro.viaAerea, true);
    agregarCuadricula(
      respuesta,
      form,
      ITEM_IDS.equipamientosVarios,
      registro.equipamientosVarios,
      true,
    );

    agregarTexto(respuesta, form, ITEM_IDS.intervencionesCantidad, registro.intervencionesCantidad);
    agregarTexto(respuesta, form, ITEM_IDS.enfermeroRecibe, registro.enfermeroRecibe);

    if (Array.isArray(registro.confirmaciones) && registro.confirmaciones.length > 0) {
      respuesta.withItemResponse(
        itemPorId(form, ITEM_IDS.confirmaciones)
          .asCheckboxItem()
          .createResponse(registro.confirmaciones),
      );
    }

    const enlaces = subirArchivos(payload.archivos || [], guardia);
    const detalleAdjuntos = enlaces.length ? `Adjuntos de Drive:\n${enlaces.join("\n")}` : "";
    const observaciones = [
      registro.observacionesFarmacologicos
        ? `Farmacológicos: ${registro.observacionesFarmacologicos}`
        : "",
      registro.observacionesDescartables
        ? `Descartables: ${registro.observacionesDescartables}`
        : "",
      registro.observacionesEquipamiento
        ? `Equipamiento: ${registro.observacionesEquipamiento}`
        : "",
      registro.observacionesGenerales || "",
      detalleAdjuntos,
    ]
      .filter(Boolean)
      .join("\n\n");

    agregarTexto(respuesta, form, ITEM_IDS.observaciones, observaciones);
    const enviada = respuesta.submit();
    let emailEnviado = false;
    let errorEmail = "";

    if (payload.emailRequested) {
      try {
        enviarCopiaPorCorreo(registro, enviada.getId());
        emailEnviado = true;
      } catch (errorEmailEnvio) {
        errorEmail = errorEmailEnvio instanceof Error
          ? errorEmailEnvio.message
          : "No se pudo enviar la copia por correo";
        console.error(`Registro guardado, pero falló el email: ${errorEmail}`);
      }
    }

    return respuestaJson({
      ok: true,
      adjuntos: enlaces,
      respuestaId: enviada.getId(),
      emailRequested: payload.emailRequested,
      emailEnviado,
      errorEmail,
    });
  } catch (error) {
    console.error(error);
    return respuestaJson({
      ok: false,
      error: error instanceof Error ? error.message : "Error al guardar el registro",
    });
  }
}

function enviarCopiaPorCorreo(registro, respuestaId) {
  const correo = String(registro && registro.guardia && registro.guardia.email || "").trim();
  if (!correo) throw new Error("El registro no contiene un correo electrónico");

  MailApp.sendEmail(
    correo,
    "Copia del registro de guardia SeLIAR",
    construirCuerpoCorreo(registro, respuestaId),
    { name: "Enfermeria SeLIAR SFE" },
  );
}

function construirCuerpoCorreo(registro, respuestaId) {
  const guardia = registro.guardia || {};
  const lineas = [
    "REGISTRO DE GUARDIA — Enfermeria SeLIAR SFE",
    "",
    `ID de respuesta: ${respuestaId || "—"}`,
    "",
    "DATOS DE LA GUARDIA",
    `Correo electrónico: ${valorCorreo(guardia.email)}`,
    `Fecha: ${valorCorreo(guardia.fecha)}`,
    `Turno: ${valorCorreo(guardia.turno)}`,
    `Móvil número: ${valorCorreo(guardia.movilNumero)}`,
    `Patente móvil: ${valorCorreo(guardia.patenteMovil)}`,
    `Enfermero/a entrante: ${valorCorreo(guardia.enfermeroEntrante)}`,
    `Chofer de guardia: ${valorCorreo(guardia.choferGuardia)}`,
    `Médico de guardia: ${valorCorreo(guardia.medicoGuardia)}`,
    "",
    "FARMACOLÓGICOS",
    ...lineasInventario(registro.farmacologicos),
    "",
    "DESCARTABLES — CURACIONES",
    ...lineasInventario(registro.descartables),
    "",
    "VÍA AÉREA",
    ...lineasInventario(registro.viaAerea),
    "",
    "EQUIPAMIENTOS VARIOS",
    ...lineasInventario(registro.equipamientosVarios),
    "",
    "INTERVENCIONES Y NOVEDADES",
    `Cantidad de intervenciones: ${valorCorreo(registro.intervencionesCantidad)}`,
    `Observaciones de farmacológicos: ${valorCorreo(registro.observacionesFarmacologicos)}`,
    `Observaciones de descartables: ${valorCorreo(registro.observacionesDescartables)}`,
    `Observaciones de equipamiento: ${valorCorreo(registro.observacionesEquipamiento)}`,
    `Observaciones generales: ${valorCorreo(registro.observacionesGenerales)}`,
    "",
    "CONFIRMACIÓN DEL PASE DE GUARDIA",
    `Enfermero/a que recibe: ${valorCorreo(registro.enfermeroRecibe)}`,
    "Confirmaciones:",
    ...lineasConfirmaciones(registro.confirmaciones),
    "",
    "Este correo es una copia del registro guardado en el formulario de guardia.",
  ];

  return lineas.join("\n");
}

function lineasInventario(inventario) {
  if (!inventario || typeof inventario !== "object") return ["Sin datos"];
  return Object.keys(inventario).map((nombre) => {
    const valores = Array.isArray(inventario[nombre]) ? inventario[nombre] : [];
    const estados = valores.map(nombreEstadoInventario).join(", ");
    return `- ${nombre}: ${estados || "Sin marcar"}`;
  });
}

function lineasConfirmaciones(confirmaciones) {
  if (!Array.isArray(confirmaciones) || confirmaciones.length === 0) return ["- Ninguna"];
  return confirmaciones.map((confirmacion) => `- ${confirmacion}`);
}

function nombreEstadoInventario(id) {
  const nombres = {
    faltante_1: "Faltante 1",
    faltante_2: "Faltan 2",
    faltante_3: "Faltan 3",
    faltante_4: "Faltan 4",
    roto: "Falta / roto / inexistente",
    revisar: "Revisar",
    completo: "Completo",
    faltante_parcial: "Faltante parcial",
    faltante: "Faltante",
    deteriorado: "Deteriorado / requiere mantenimiento",
  };
  return nombres[id] || id;
}

function valorCorreo(valor) {
  const texto = String(valor == null ? "" : valor).trim();
  return texto || "—";
}

function itemPorId(form, id) {
  const item = form.getItemById(id);
  if (!item) throw new Error(`No se encontró la pregunta ${id}`);
  return item;
}

function buscarItemPorTitulo(form, titulo) {
  const buscado = titulo.trim().toLowerCase();
  const item = form.getItems().find((actual) => actual.getTitle().trim().toLowerCase() === buscado);
  if (!item) throw new Error(`No se encontró la pregunta “${titulo}”`);
  return item;
}

function agregarTexto(respuesta, form, id, valor) {
  const item = itemPorId(form, id);
  const texto = String(valor || "");
  if (item.getType() === FormApp.ItemType.PARAGRAPH_TEXT) {
    respuesta.withItemResponse(item.asParagraphTextItem().createResponse(texto));
    return;
  }
  respuesta.withItemResponse(item.asTextItem().createResponse(texto));
}

function normalizarNombreFila(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function valoresDeFila(valores, fila) {
  if (!valores || typeof valores !== "object") return undefined;
  if (Array.isArray(valores[fila])) return valores[fila];

  const filaNormalizada = normalizarNombreFila(fila);
  const clave = Object.keys(valores).find(
    (nombre) => normalizarNombreFila(nombre) === filaNormalizada,
  );
  return clave ? valores[clave] : undefined;
}

function agregarCuadricula(respuesta, form, id, valores, esEquipamiento) {
  const cuadricula = itemPorId(form, id).asCheckboxGridItem();
  const columnas = cuadricula.getColumns();
  const mapa = esEquipamiento
    ? {
        completo: columnas[0],
        faltante_parcial: columnas[1],
        faltante: columnas[2],
        deteriorado: columnas[3],
      }
    : {
        faltante_1: columnas[0],
        faltante_2: columnas[1],
        faltante_3: columnas[2],
        faltante_4: columnas[3],
        roto: columnas[4],
        completo: columnas[5],
      };

  const respuestasFilas = cuadricula.getRows().map((fila) => {
    const seleccionadas = valoresDeFila(valores, fila);
    if (!Array.isArray(seleccionadas) || seleccionadas.length === 0) {
      throw new Error(`Falta completar “${fila}”`);
    }
    return seleccionadas.map((idSeleccionado) => {
      const columna = mapa[idSeleccionado];
      if (!columna) throw new Error(`Opción inválida en “${fila}”`);
      return columna;
    });
  });

  respuesta.withItemResponse(cuadricula.createResponse(respuestasFilas));
}

function fechaDesdeIso(valor) {
  const partes = String(valor).split("-").map(Number);
  if (partes.length !== 3 || partes.some((parte) => !Number.isFinite(parte))) {
    throw new Error("Fecha inválida");
  }
  return new Date(partes[0], partes[1] - 1, partes[2]);
}

function subirArchivos(archivos, guardia) {
  if (!Array.isArray(archivos) || archivos.length === 0) return [];
  if (archivos.length > 3) throw new Error("Se permiten hasta 3 imágenes");

  const carpeta = DriveApp.getFolderById(UPLOADS_FOLDER_ID);
  const fechaSubida = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const responsable = limpiarNombre(guardia.enfermeroEntrante || "sin-nombre");
  const prefijo = `${fechaSubida}_${responsable}`;

  return archivos.map((archivo) => {
    if (!archivo || !archivo.base64 || !archivo.tipo) throw new Error("Adjunto inválido");
    if (["image/jpeg", "image/png", "image/webp"].indexOf(archivo.tipo) === -1) {
      throw new Error("Solo se permiten imágenes JPG, PNG o WebP");
    }
    const extensiones = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };
    const extension = extensiones[archivo.tipo];
    const nombre = `${prefijo}.${extension}`;
    const blob = Utilities.newBlob(Utilities.base64Decode(archivo.base64), archivo.tipo, nombre);
    return carpeta.createFile(blob).getUrl();
  });
}

function limpiarNombre(valor) {
  return String(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/-+/g, "-")
    .slice(0, 100);
}
