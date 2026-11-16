const FORM_ID = "1612Y6uGxxpqR6rhetzjboXjlna3he6hFwV9VYr_QA-g";
const SECRET_PROPERTY_KEY = "COMPENSATORIO_SECRET";
const EMAIL_ITEM_TITLE = "Correo electrónico";

const ITEM_IDS = {
  requesterEmail: 1851963092,
  requesterName: 77797409,
  requesterMobile: 1572866606,
  compensatoryDate: 556605314,
  hours: 718502073,
};

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

function doGet() {
  return jsonResponse({ ok: true, service: "compensatorio" });
}

function doPost(event) {
  try {
    const payload = JSON.parse((event && event.postData && event.postData.contents) || "{}");
    const secret = PropertiesService.getScriptProperties().getProperty(SECRET_PROPERTY_KEY);

    if (!secret || payload.secret !== secret) {
      return jsonResponse({ ok: false, error: "Unauthorized" });
    }

    const request = validateRequest(payload.request);
    const form = FormApp.openById(FORM_ID);
    if (form.collectsEmail()) {
      throw new Error(
        "Automatic Google Forms email collection must be disabled for this programmatic bridge. Rerun setupCompensatorioEmailField() and redeploy the script.",
      );
    }
    const emailItem = findEmailItem(form);
    const response = form.createResponse();

    addTextItem(response, emailItem, request.requesterEmail);
    addText(response, itemById(form, ITEM_IDS.requesterName), request.requesterName);
    response.withItemResponse(
      itemById(form, ITEM_IDS.requesterMobile).asListItem().createResponse(request.requesterMobile),
    );
    response.withItemResponse(
      itemById(form, ITEM_IDS.compensatoryDate)
        .asDateItem()
        .createResponse(dateFromIso(request.compensatoryDate)),
    );
    addText(response, itemById(form, ITEM_IDS.hours), request.hours);

    const submitted = response.submit();
    let emailSent = false;
    let emailError = "";

    if (request.emailRequested) {
      try {
        sendConfirmationEmail(request, submitted.getId());
        emailSent = true;
      } catch (sendEmailError) {
        emailError =
          sendEmailError instanceof Error
            ? sendEmailError.message
            : "Unable to send the confirmation email.";
        console.error(`Compensatory request saved, but email delivery failed: ${emailError}`);
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
      error: error instanceof Error ? error.message : "Unable to save the compensatory request.",
    });
  }
}

/**
 * Run after adding or repairing the explicit email field in the Form.
 *
 * The bridge submits FormResponse objects programmatically. Google Forms cannot
 * populate respondent-email metadata for those responses, so automatic email
 * collection must stay disabled. The explicit required text item is the safe
 * source for the validated MailApp destination.
 */
function setupCompensatorioEmailField() {
  const form = FormApp.openById(FORM_ID);
  form.setCollectEmail(false);

  let emailItem = findEmailItemOrNull(form);
  if (!emailItem) {
    emailItem = form.addTextItem().setTitle(EMAIL_ITEM_TITLE);
  }
  emailItem.setRequired(true);

  const itemId = emailItem.getId();
  console.log(`Compensatorio email item ready. Actual item ID: ${itemId}`);
  Logger.log(`Compensatorio email item ready. Actual item ID: ${itemId}`);
  return itemId;
}

function validateRequest(request) {
  if (!request || typeof request !== "object") throw new Error("Missing request.");
  if (typeof request.emailRequested !== "boolean") {
    throw new Error("Invalid email preference.");
  }

  const requesterName = String(request.requesterName || "").trim();
  if (!requesterName) throw new Error("Missing requesterName.");

  const requesterEmail = validateRequesterEmail(request.requesterEmail);
  const requesterMobile = String(request.requesterMobile || "").trim();
  if (MOBILE_CHOICES.indexOf(requesterMobile) === -1) {
    throw new Error("Invalid requester mobile.");
  }

  const compensatoryDate = String(request.compensatoryDate || "");
  dateFromIso(compensatoryDate);
  const hours = validateHours(request.hours);

  return {
    emailRequested: request.emailRequested,
    requesterName,
    requesterEmail,
    requesterMobile,
    compensatoryDate,
    hours,
  };
}

function validateRequesterEmail(value) {
  const email = String(value || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Invalid requester email.");
  }
  return email;
}

function validateHours(value) {
  const hours = String(value || "").trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(hours)) throw new Error("Invalid hours.");
  const numericHours = Number(hours.replace(",", "."));
  if (!isFinite(numericHours) || numericHours <= 0) {
    throw new Error("Hours must be positive.");
  }
  return hours;
}

function sendConfirmationEmail(request, responseId) {
  MailApp.sendEmail(
    request.requesterEmail,
    "Copia de la solicitud de compensatorio SeLIAR",
    buildConfirmationEmailBody(request, responseId),
    { name: "Enfermeria SeLIAR SFE" },
  );
}

function buildConfirmationEmailBody(request, responseId) {
  return [
    "SOLICITUD DE COMPENSATORIO — Enfermeria SeLIAR SFE",
    "",
    `ID de respuesta: ${emailValue(responseId)}`,
    "",
    "DATOS DE LA SOLICITUD",
    `Nombre y apellido: ${emailValue(request.requesterName)}`,
    `Correo electrónico: ${emailValue(request.requesterEmail)}`,
    `Móvil: ${emailValue(request.requesterMobile)}`,
    `Fecha del compensatorio: ${emailValue(request.compensatoryDate)}`,
    `Cantidad de horas: ${emailValue(request.hours)}`,
    "",
    "Este correo es una copia de la solicitud guardada en el formulario de Compensatorio.",
  ].join("\n");
}

function findEmailItem(form) {
  const item = findEmailItemOrNull(form);
  if (!item) {
    throw new Error(
      `Missing required email item '${EMAIL_ITEM_TITLE}'. Run setupCompensatorioEmailField() first.`,
    );
  }
  return item;
}

function findEmailItemOrNull(form) {
  const item = form.getItems().find((candidate) => {
    return candidate.getTitle().trim().toLowerCase() === EMAIL_ITEM_TITLE.toLowerCase();
  });
  if (!item) return null;
  if (item.getType() !== FormApp.ItemType.TEXT) {
    throw new Error(`Email item '${EMAIL_ITEM_TITLE}' must be a TEXT item.`);
  }
  return item.asTextItem();
}

function itemById(form, id) {
  const item = form.getItemById(id);
  if (!item) throw new Error(`Missing form item ${id}.`);
  return item;
}

function addText(response, item, value) {
  response.withItemResponse(item.asTextItem().createResponse(String(value || "")));
}

function addTextItem(response, item, value) {
  response.withItemResponse(item.createResponse(String(value || "")));
}

function dateFromIso(value) {
  const isoDate = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new Error("Invalid date.");

  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error("Invalid date.");
  }
  return date;
}

function emailValue(value) {
  const text = String(value == null ? "" : value).trim();
  return text || "—";
}

function jsonResponse(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/**
 * Run manually from the Apps Script editor under the authorized Form owner.
 * This is not a web endpoint. It reads responses and creates one private JSON file;
 * it does not modify the Form, submit responses, send mail, or import anything.
 */
function exportCompensatorioResponsesToJson() {
  const form = FormApp.openById(FORM_ID);
  const responses = form.getResponses().map(compensatorioExportResponse_);
  const exportedAt = new Date().toISOString();
  const payload = {
    schemaVersion: 1,
    exportedAt,
    source: {
      kind: "google-forms",
      formId: FORM_ID,
      scriptTimeZone: Session.getScriptTimeZone(),
    },
    responseCount: responses.length,
    responses,
  };
  const content = JSON.stringify(payload, null, 2);
  if (Utilities.newBlob(content, "application/json").getBytes().length > 10000000) {
    throw new Error(
      "Export exceeds 10 MB. No file was created; a reviewed batch export is required.",
    );
  }

  const fileName = `compensatorio-responses-${exportedAt.replace(/[:.]/g, "-")}.json`;
  // Create an empty file first: no response data is written until sharing is checked.
  const file = DriveApp.createFile(fileName, "", "application/json");
  try {
    file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
    if (file.getSharingAccess() !== DriveApp.Access.PRIVATE) {
      throw new Error("Private sharing could not be verified.");
    }
    file.setContent(content);
    const summary = {
      fileId: file.getId(),
      fileUrl: file.getUrl(),
      responseCount: responses.length,
      recordsWithIssues: responses.filter(
        (response) =>
          response.missingFields.length ||
          response.duplicateFields.length ||
          response.unmappedItemIds.length,
      ).length,
    };
    // Only operator metadata is logged, never names, emails, answers, or secrets.
    console.log(JSON.stringify(summary));
    return summary;
  } catch (error) {
    try {
      file.setTrashed(true);
    } catch (cleanupError) {
      throw new Error(
        "Export failed. Could not discard the new file; inspect and discard it manually in Drive.",
      );
    }
    throw new Error(
      "Export failed. The new file was moved to trash; no Form responses were changed.",
    );
  }
}

function compensatorioExportResponse_(response) {
  const responseId = response.getId();
  if (typeof responseId !== "string" || !responseId.trim()) {
    throw new Error("A response is missing its submitted response ID. No export was created.");
  }
  const timestamp = response.getTimestamp();
  if (
    Object.prototype.toString.call(timestamp) !== "[object Date]" ||
    !isFinite(timestamp.getTime())
  ) {
    throw new Error("A response has an invalid submission timestamp. No export was created.");
  }

  const fields = Object.keys(ITEM_IDS);
  const answers = [];
  const unmappedItemIds = [];
  response.getItemResponses().forEach((itemResponse) => {
    const item = itemResponse.getItem();
    const itemId = String(item.getId());
    const field =
      fields.find((key) => String(ITEM_IDS[key]) === itemId) ||
      (item.getTitle().trim().toLowerCase() === EMAIL_ITEM_TITLE.toLowerCase()
        ? "requesterEmail"
        : null);
    if (!field) {
      // Unknown questions need mapping review; do not export unrelated personal data.
      unmappedItemIds.push(itemId);
      return;
    }
    answers.push({
      field,
      itemId,
      itemType: String(item.getType()),
      value: compensatorioExportValue_(itemResponse.getResponse()),
    });
  });

  return {
    responseId,
    submittedAt: timestamp.toISOString(),
    answers,
    missingFields: fields.filter((field) => !answers.some((answer) => answer.field === field)),
    duplicateFields: fields.filter(
      (field) => answers.filter((answer) => answer.field === field).length > 1,
    ),
    unmappedItemIds,
  };
}

function compensatorioExportValue_(value) {
  if (value == null || typeof value === "string" || typeof value === "boolean")
    return value == null ? null : value;
  if (typeof value === "number" && isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(compensatorioExportValue_);
  if (Object.prototype.toString.call(value) === "[object Date]" && isFinite(value.getTime())) {
    return { kind: "date", iso: value.toISOString() };
  }
  throw new Error("An answer has an unsupported value type. No export was created.");
}
