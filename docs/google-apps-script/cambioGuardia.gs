const FORM_ID = "11qqqTr5KLNAJdBqqkXNbp4EkZ8-oZRL1q_oo9J2AjBw";
const SECRET_PROPERTY_KEY = "CAMBIO_GUARDIA_SECRET";

const ITEM_IDS = {
  requesterEmail: 1891793506,
  coverage: 1124723262,
  requesterName: 685400638,
  requesterMobile: 1528569897,
  guardDate: 1874658295,
  counterpartName: 173561701,
  counterpartMobile: 2045056247,
  returnDate: 596869713,
  partialStart: 1553242674,
  partialEnd: 925189804,
  note: 831934368,
};

const COVERAGE_CHOICES = {
  complete: "Completa (Toda la guardia)",
  partial: "Parcial (Reemplazo por franja horaria / X horas)",
};

function doGet() {
  return jsonResponse({ ok: true, service: "cambio-guardia" });
}

function doPost(event) {
  try {
    const payload = JSON.parse((event && event.postData && event.postData.contents) || "{}");
    const secret = PropertiesService.getScriptProperties().getProperty(SECRET_PROPERTY_KEY);

    if (!secret || payload.secret !== secret) {
      return jsonResponse({ ok: false, error: "Unauthorized" });
    }

    const request = payload.request;
    validateRequest(request);

    const form = FormApp.openById(FORM_ID);
    const response = form.createResponse();

    addText(response, form, ITEM_IDS.requesterEmail, request.requesterEmail);
    response.withItemResponse(
      itemById(form, ITEM_IDS.coverage)
        .asMultipleChoiceItem()
        .createResponse(COVERAGE_CHOICES[request.coverage]),
    );
    addText(response, form, ITEM_IDS.requesterName, request.requesterName);
    addText(response, form, ITEM_IDS.requesterMobile, request.requesterMobile);
    response.withItemResponse(
      itemById(form, ITEM_IDS.guardDate).asDateItem().createResponse(dateFromIso(request.guardDate)),
    );
    addText(response, form, ITEM_IDS.counterpartName, request.counterpartName);
    addText(response, form, ITEM_IDS.counterpartMobile, request.counterpartMobile);
    response.withItemResponse(
      itemById(form, ITEM_IDS.returnDate).asDateItem().createResponse(dateFromIso(request.returnDate)),
    );

    if (request.coverage === "partial" && request.partialStart) {
      addTime(response, form, ITEM_IDS.partialStart, request.partialStart);
    }
    if (request.coverage === "partial" && request.partialEnd) {
      addTime(response, form, ITEM_IDS.partialEnd, request.partialEnd);
    }
    if (request.note) {
      addText(response, form, ITEM_IDS.note, request.note);
    }

    const submitted = response.submit();
    let emailSent = false;
    let emailError = "";

    if (request.emailRequested) {
      try {
        sendConfirmationEmail(request, submitted.getId());
        emailSent = true;
      } catch (sendEmailError) {
        emailError = sendEmailError instanceof Error
          ? sendEmailError.message
          : "Unable to send the confirmation email.";
        console.error(`Change request saved, but email delivery failed: ${emailError}`);
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
      error: error instanceof Error ? error.message : "Unable to save the change request.",
    });
  }
}

function validateRequest(request) {
  if (!request || typeof request !== "object") throw new Error("Missing request.");
  if (typeof request.emailRequested !== "boolean") {
    throw new Error("Invalid email preference.");
  }

  const requiredTextFields = [
    "requesterName",
    "requesterMobile",
    "counterpartName",
    "counterpartMobile",
  ];
  if (["complete", "partial"].indexOf(request.coverage) === -1) {
    throw new Error("Invalid coverage type.");
  }
  requiredTextFields.forEach((field) => {
    if (!String(request[field] || "").trim()) throw new Error(`Missing ${field}.`);
  });
  validateRequesterEmail(request.requesterEmail);
  dateFromIso(request.guardDate);
  dateFromIso(request.returnDate);
  if (request.coverage === "partial") {
    if (request.partialStart) timeParts(request.partialStart);
    if (request.partialEnd) timeParts(request.partialEnd);
  }
}

function validateRequesterEmail(value) {
  const email = String(value || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Invalid requester email.");
  }
  return email;
}

function sendConfirmationEmail(request, responseId) {
  const requesterEmail = validateRequesterEmail(request.requesterEmail);
  MailApp.sendEmail(
    requesterEmail,
    "Copia de la solicitud de cambio de guardia SeLIAR",
    buildConfirmationEmailBody(request, responseId),
    { name: "Enfermeria SeLIAR SFE" },
  );
}

function buildConfirmationEmailBody(request, responseId) {
  const coverage = request.coverage === "complete"
    ? "Completa (toda la guardia)"
    : "Parcial (reemplazo por franja horaria)";
  const partialStart = request.coverage === "partial" ? emailValue(request.partialStart) : "—";
  const partialEnd = request.coverage === "partial" ? emailValue(request.partialEnd) : "—";

  return [
    "SOLICITUD DE CAMBIO DE GUARDIA — Enfermeria SeLIAR SFE",
    "",
    `ID de respuesta: ${emailValue(responseId)}`,
    "",
    "COBERTURA",
    `Tipo: ${coverage}`,
    "",
    "QUIEN SOLICITA",
    `Nombre: ${emailValue(request.requesterName)}`,
    `Móvil: ${emailValue(request.requesterMobile)}`,
    `Correo electrónico: ${emailValue(request.requesterEmail)}`,
    "",
    "CONTRAPARTE",
    `Nombre: ${emailValue(request.counterpartName)}`,
    `Móvil: ${emailValue(request.counterpartMobile)}`,
    "",
    "FECHAS Y HORARIOS",
    `Fecha de guardia: ${emailValue(request.guardDate)}`,
    `Fecha de devolución: ${emailValue(request.returnDate)}`,
    `Hora de inicio parcial: ${partialStart}`,
    `Hora de finalización parcial: ${partialEnd}`,
    "",
    "ACLARACIÓN",
    emailValue(request.note),
    "",
    "Este correo es una copia de la solicitud guardada en el formulario de Cambio de guardia.",
  ].join("\n");
}

function emailValue(value) {
  const text = String(value == null ? "" : value).trim();
  return text || "—";
}

function itemById(form, id) {
  const item = form.getItemById(id);
  if (!item) throw new Error(`Missing form item ${id}.`);
  return item;
}

function addText(response, form, id, value) {
  const item = itemById(form, id);
  const text = String(value || "");
  if (item.getType() === FormApp.ItemType.PARAGRAPH_TEXT) {
    response.withItemResponse(item.asParagraphTextItem().createResponse(text));
    return;
  }
  response.withItemResponse(item.asTextItem().createResponse(text));
}

function addTime(response, form, id, value) {
  const [hour, minute] = timeParts(value);
  response.withItemResponse(itemById(form, id).asTimeItem().createResponse(hour, minute));
}

function dateFromIso(value) {
  const isoDate = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    throw new Error("Invalid date.");
  }

  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error("Invalid date.");
  }

  return date;
}

function timeParts(value) {
  const parts = String(value || "").split(":").map(Number);
  if (
    parts.length !== 2 ||
    parts.some((part) => !Number.isInteger(part)) ||
    parts[0] < 0 ||
    parts[0] > 23 ||
    parts[1] < 0 ||
    parts[1] > 59
  ) {
    throw new Error("Invalid time.");
  }
  return parts;
}

function jsonResponse(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
