const FORM_ID = "1Pf19ZzgsJhtNomUGcO-nc748-OmM3AwcZbD-J_b-zxc";
const SECRET_PROPERTY_KEY = "LAO_SECRET";
const EMAIL_ITEM_TITLE = "Correo Electrónico";

const ITEM_IDS = {
  requesterEmail: 1849920835,
  requesterName: 1489095025,
  startMonth: 497043890,
  startDate: 1242305715,
  endDate: 864116122,
};

function doGet() {
  return jsonResponse({ ok: true, service: "lao" });
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
        "Automatic Google Forms email collection must be disabled for this programmatic bridge. Rerun setupLaoEmailField() and redeploy the script.",
      );
    }

    const response = form.createResponse();
    addTextItem(response, findEmailItem(form), request.requesterEmail);
    addText(response, itemById(form, ITEM_IDS.requesterName), request.requesterName);
    response.withItemResponse(
      itemById(form, ITEM_IDS.startMonth)
        .asDateItem()
        .createResponse(dateFromMonth(request.startMonth)),
    );
    response.withItemResponse(
      itemById(form, ITEM_IDS.startDate)
        .asDateItem()
        .createResponse(dateFromIso(request.startDate)),
    );
    response.withItemResponse(
      itemById(form, ITEM_IDS.endDate).asDateItem().createResponse(dateFromIso(request.endDate)),
    );

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
        console.error(`LAO request saved, but email delivery failed: ${emailError}`);
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
      error: error instanceof Error ? error.message : "Unable to save the LAO request.",
    });
  }
}

/** Run after adding or repairing the explicit email field in the Form. */
function setupLaoEmailField() {
  const form = FormApp.openById(FORM_ID);
  form.setCollectEmail(false);

  let emailItem = findEmailItemOrNull(form);
  if (!emailItem) {
    emailItem = form.addTextItem().setTitle(EMAIL_ITEM_TITLE);
  }
  emailItem.setRequired(true);

  const itemId = emailItem.getId();
  console.log(`LAO email item ready. Actual item ID: ${itemId}`);
  Logger.log(`LAO email item ready. Actual item ID: ${itemId}`);
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
  const startMonth = String(request.startMonth || "");
  const startDate = String(request.startDate || "");
  const endDate = String(request.endDate || "");

  validateMonth(startMonth);
  dateFromIso(startDate);
  dateFromIso(endDate);
  if (startDate > endDate) throw new Error("Start date cannot be after end date.");

  return { emailRequested: request.emailRequested, requesterName, requesterEmail, startMonth, startDate, endDate };
}

function validateRequesterEmail(value) {
  const email = String(value || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Invalid requester email.");
  }
  return email;
}

function validateMonth(value) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new Error("Invalid start month.");
  }
  return value;
}

function sendConfirmationEmail(request, responseId) {
  MailApp.sendEmail(
    request.requesterEmail,
    "Copia de la solicitud de LAO SeLIAR",
    buildConfirmationEmailBody(request, responseId),
    { name: "Enfermeria SeLIAR SFE" },
  );
}

function buildConfirmationEmailBody(request, responseId) {
  return [
    "SOLICITUD DE LAO — Enfermeria SeLIAR SFE",
    "",
    `ID de respuesta: ${emailValue(responseId)}`,
    "",
    "DATOS DE LA SOLICITUD",
    `Nombre y apellido: ${emailValue(request.requesterName)}`,
    `Correo electrónico: ${emailValue(request.requesterEmail)}`,
    `Mes de inicio de LAO: ${emailValue(request.startMonth)}`,
    `Fecha de inicio LAO: ${emailValue(request.startDate)}`,
    `Fecha fin de LAO: ${emailValue(request.endDate)}`,
    "",
    "Este correo es una copia de la solicitud guardada en el formulario de LAO.",
  ].join("\n");
}

function findEmailItem(form) {
  const item = findEmailItemOrNull(form);
  if (!item) {
    throw new Error(
      `Missing required email item '${EMAIL_ITEM_TITLE}'. Run setupLaoEmailField() first.`,
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

function dateFromMonth(value) {
  validateMonth(value);
  return dateFromIso(`${value}-01`);
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
