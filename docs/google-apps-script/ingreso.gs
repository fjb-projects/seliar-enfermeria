const SECRET_PROPERTY_KEY = "INGRESO_SECRET";
const FORM_ID_PROPERTY_KEY = "INGRESO_FORM_ID";

const MOBILE_CHOICES = [
  "Móvil 1",
  "Móvil 2",
  "Móvil 3",
  "Móvil 4",
  "Móvil 5",
  "Móvil 6",
  "Móvil 7",
  "Móvil 9",
  "Móvil 11",
  "Móvil 12",
  "Móvil 15",
  "Móvil 26",
  "Móvil Flotante",
  "Otro Movil no Nomenclado",
];

const ITEM_TITLES = {
  fullName: "Nombre y apellido",
  email: "Correo electrónico",
  mobile: "Móvil",
  latitude: "Latitud",
  longitude: "Longitud",
  accuracyMeters: "Precisión estimada (m)",
  capturedAt: "Fecha y hora de captura de ubicación",
  capturedAtArgentina: "Fecha y hora de captura (Argentina)",
  mapsUrl: "Ubicación en Google Maps",
};

function doGet() {
  return jsonResponse({ ok: true, service: "ingreso" });
}

function doPost(event) {
  try {
    const payload = JSON.parse((event && event.postData && event.postData.contents) || "{}");
    const secret = PropertiesService.getScriptProperties().getProperty(SECRET_PROPERTY_KEY);
    if (!secret || payload.secret !== secret) {
      return jsonResponse({ ok: false, error: "Unauthorized" });
    }

    const request = validateRequest(payload.request);
    const formId = PropertiesService.getScriptProperties().getProperty(FORM_ID_PROPERTY_KEY);
    if (!formId) throw new Error("Missing INGRESO_FORM_ID script property. Run setupIngresoForm() first.");

    const form = FormApp.openById(formId);
    const fields = resolveFormItems(form);
    const response = form.createResponse();
    response.withItemResponse(fields.fullName.createResponse(request.fullName));
    response.withItemResponse(fields.email.createResponse(request.email));
    response.withItemResponse(fields.mobile.createResponse(request.mobile));
    response.withItemResponse(fields.latitude.createResponse(String(request.latitude)));
    response.withItemResponse(fields.longitude.createResponse(String(request.longitude)));
    response.withItemResponse(fields.accuracyMeters.createResponse(String(request.accuracyMeters)));
    response.withItemResponse(fields.capturedAt.createResponse(request.capturedAt));
    response.withItemResponse(fields.capturedAtArgentina.createResponse(request.capturedAtArgentina));
    response.withItemResponse(fields.mapsUrl.createResponse(request.mapsUrl));

    const submitted = response.submit();
    let emailSent = false;
    let emailError = "";
    if (request.emailRequested) {
      try {
        MailApp.sendEmail(
          request.email,
          "Confirmación de ingreso — Enfermería SeLIAR",
          buildEmailBody(request, submitted.getId()),
          { name: "Enfermería SeLIAR" },
        );
        emailSent = true;
      } catch (error) {
        emailError = error instanceof Error ? error.message : "Unable to send the confirmation email.";
        console.error(`Check-in saved, but email delivery failed: ${emailError}`);
      }
    }

    return jsonResponse({
      ok: true,
      responseId: submitted.getId(),
      emailRequested: request.emailRequested,
      emailSent,
      emailError,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to save the check-in.",
    });
  }
}

/** Run once from the editor to create the dedicated Form and save its ID in Script Properties. */
function setupIngresoForm() {
  const properties = PropertiesService.getScriptProperties();
  if (properties.getProperty(FORM_ID_PROPERTY_KEY)) {
    throw new Error("INGRESO_FORM_ID is already configured. Remove it deliberately before creating another Form.");
  }

  const form = FormApp.create("Registro de ingreso — Enfermería SeLIAR");
  form.setDescription("Marcaje de ingreso con una captura puntual de ubicación. La ubicación no verifica identidad ni implica seguimiento continuo.");
  form.setCollectEmail(false);
  form.addTextItem().setTitle(ITEM_TITLES.fullName).setRequired(true);
  form.addTextItem().setTitle(ITEM_TITLES.email).setRequired(true);
  form.addListItem().setTitle(ITEM_TITLES.mobile).setChoiceValues(MOBILE_CHOICES).setRequired(true);
  form.addTextItem().setTitle(ITEM_TITLES.latitude).setRequired(true);
  form.addTextItem().setTitle(ITEM_TITLES.longitude).setRequired(true);
  form.addTextItem().setTitle(ITEM_TITLES.accuracyMeters).setRequired(true);
  form.addTextItem().setTitle(ITEM_TITLES.capturedAt).setRequired(true);
  form.addTextItem().setTitle(ITEM_TITLES.capturedAtArgentina).setRequired(false);
  form.addTextItem().setTitle(ITEM_TITLES.mapsUrl).setRequired(false);
  properties.setProperty(FORM_ID_PROPERTY_KEY, form.getId());

  console.log(`Ingreso Form created. Review it at: ${form.getEditUrl()}`);
  Logger.log(`Ingreso Form created. Review it at: ${form.getEditUrl()}`);
}

/** Add only the new location fields to the existing Form; safe to run more than once. */
function migrateIngresoFormLocationFields() {
  const formId = PropertiesService.getScriptProperties().getProperty(FORM_ID_PROPERTY_KEY);
  if (!formId) {
    throw new Error("Missing INGRESO_FORM_ID script property. No Form was changed.");
  }

  const form = FormApp.openById(formId);
  const additions = [ITEM_TITLES.capturedAtArgentina, ITEM_TITLES.mapsUrl];
  const missing = [];
  const existing = [];
  additions.forEach((title) => {
    const matches = form.getItems().filter((item) => item.getTitle() === title);
    if (matches.length > 1) {
      throw new Error(`Multiple Form items use the exact title '${title}'. Resolve duplicates manually.`);
    }
    if (matches.length === 1) {
      if (matches[0].getType() !== FormApp.ItemType.TEXT) {
        throw new Error(`Form item '${title}' exists but is not short text. No item was changed.`);
      }
      existing.push(matches[0].asTextItem());
      return;
    }
    missing.push(title);
  });

  existing.forEach((item) => item.setRequired(false));
  missing.forEach((title) => {
    form.addTextItem().setTitle(title).setRequired(false);
    console.log(`Added optional short-text Form item: ${title}`);
  });
  console.log("Ingreso Form location-field migration complete.");
  Logger.log("Ingreso Form location-field migration complete.");
}

function validateRequest(request) {
  if (!request || typeof request !== "object") throw new Error("Missing request.");
  if (typeof request.emailRequested !== "boolean") throw new Error("Invalid email preference.");

  const fullName = String(request.fullName || "").trim();
  if (!fullName || fullName.length > 120) throw new Error("Invalid full name.");
  const email = String(request.email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    throw new Error("Invalid email address.");
  }

  const mobile = String(request.mobile || "").trim();
  if (MOBILE_CHOICES.indexOf(mobile) === -1) throw new Error("Invalid mobile.");

  const latitude = Number(request.latitude);
  const longitude = Number(request.longitude);
  const accuracyMeters = Number(request.accuracyMeters);
  if (!isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error("Invalid latitude.");
  if (!isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error("Invalid longitude.");
  if (!isFinite(accuracyMeters) || accuracyMeters <= 0 || accuracyMeters > 100000) {
    throw new Error("Invalid location accuracy.");
  }

  const capturedAt = String(request.capturedAt || "");
  const capturedAtDate = new Date(capturedAt);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(capturedAt) || isNaN(capturedAtDate.getTime())) {
    throw new Error("Invalid location capture timestamp.");
  }

  const capturedAtArgentina = Utilities.formatDate(
    capturedAtDate,
    "America/Argentina/Buenos_Aires",
    "dd/MM/yyyy HH:mm:ss",
  );
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude}%2C${longitude}`;

  return {
    emailRequested: request.emailRequested,
    fullName,
    email,
    mobile,
    latitude,
    longitude,
    accuracyMeters,
    capturedAt,
    capturedAtArgentina,
    mapsUrl,
  };
}

function resolveFormItems(form) {
  const items = form.getItems();
  const find = (title, type) => {
    const item = items.find((candidate) => candidate.getTitle().trim() === title);
    if (!item || item.getType() !== type) {
      throw new Error(`Missing or invalid Form item '${title}'. Run setupIngresoForm() or repair the Form.`);
    }
    return item;
  };

  const fields = {
    fullName: find(ITEM_TITLES.fullName, FormApp.ItemType.TEXT).asTextItem(),
    email: find(ITEM_TITLES.email, FormApp.ItemType.TEXT).asTextItem(),
    mobile: find(ITEM_TITLES.mobile, FormApp.ItemType.LIST).asListItem(),
    latitude: find(ITEM_TITLES.latitude, FormApp.ItemType.TEXT).asTextItem(),
    longitude: find(ITEM_TITLES.longitude, FormApp.ItemType.TEXT).asTextItem(),
    accuracyMeters: find(ITEM_TITLES.accuracyMeters, FormApp.ItemType.TEXT).asTextItem(),
    capturedAt: find(ITEM_TITLES.capturedAt, FormApp.ItemType.TEXT).asTextItem(),
    capturedAtArgentina: find(ITEM_TITLES.capturedAtArgentina, FormApp.ItemType.TEXT).asTextItem(),
    mapsUrl: find(ITEM_TITLES.mapsUrl, FormApp.ItemType.TEXT).asTextItem(),
  };
  const configuredChoices = fields.mobile.getChoices().map((choice) => choice.getValue());
  if (
    configuredChoices.length !== MOBILE_CHOICES.length ||
    configuredChoices.some((choice, index) => choice !== MOBILE_CHOICES[index])
  ) {
    throw new Error("The Form mobile choices do not match the SeLIAR mobile list.");
  }
  return fields;
}

function buildEmailBody(request, responseId) {
  return [
    "REGISTRO DE INGRESO — Enfermería SeLIAR",
    "",
    `ID de respuesta: ${responseId}`,
    `Nombre y apellido: ${request.fullName}`,
    `Correo electrónico: ${request.email}`,
    `Móvil: ${request.mobile}`,
    `Latitud: ${request.latitude}`,
    `Longitud: ${request.longitude}`,
    `Precisión estimada: ${request.accuracyMeters} m`,
    `Captura de ubicación: ${request.capturedAt}`,
    "",
    "La ubicación es una captura puntual proporcionada por el dispositivo; no verifica identidad.",
    "La fecha y hora del registro son las asignadas por Google Forms al guardar la respuesta.",
  ].join("\n");
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
