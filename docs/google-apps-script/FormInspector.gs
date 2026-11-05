/**
 * Read-only Google Forms schema inspector for SeLIAR.
 *
 * Configure the missing form IDs in FORM_SOURCES, run inspectAllForms(), and
 * copy the JSON snapshot from the Apps Script execution log. If the snapshot
 * is too large for the log, run saveAllFormsSnapshot() instead.
 *
 * This file deliberately has no doGet/doPost endpoint and never submits or
 * edits a form. The existing Code.gs remains responsible for guard-control
 * submissions.
 */

const FORM_SOURCES = [
  {
    key: "controlGuardia",
    label: "Control de guardia",
    formId: "1z2b95E3YAOJHsscoR0Kk7yfV4adJsm02zKPmGKrfVfw",
  },
  {
    key: "cambioGuardia",
    label: "Cambio de guardia",
    formId: "11qqqTr5KLNAJdBqqkXNbp4EkZ8-oZRL1q_oo9J2AjBw",
  },
  {
    key: "compensatorio",
    label: "Compensatorio",
    formId: "1612Y6uGxxpqR6rhetzjboXjlna3he6hFwV9VYr_QA-g",
  },
  {
    key: "lao",
    label: "Solicitud de LAO",
    formId: "1Pf19ZzgsJhtNomUGcO-nc748-OmM3AwcZbD-J_b-zxc",
  },
];

// Optional. Leave empty to create the snapshot in the Drive root.
const SNAPSHOT_FOLDER_ID = "";

function inspectAllForms() {
  const snapshot = {
    generatedAt: new Date().toISOString(),
    forms: FORM_SOURCES.map(inspectFormSource),
  };

  Logger.log(JSON.stringify(snapshot, null, 2));
  return snapshot;
}

function saveAllFormsSnapshot() {
  const snapshot = inspectAllForms();
  const timestamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyyMMdd-HHmmss",
  );
  const fileName = `SELIAR-forms-snapshot-${timestamp}.json`;
  const contents = JSON.stringify(snapshot, null, 2);
  const file = SNAPSHOT_FOLDER_ID
    ? DriveApp.getFolderById(SNAPSHOT_FOLDER_ID).createFile(fileName, contents, MimeType.PLAIN_TEXT)
    : DriveApp.createFile(fileName, contents, MimeType.PLAIN_TEXT);

  const result = {
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    fileName,
    formCount: snapshot.forms.length,
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function inspectFormSource(source) {
  if (!source.formId) {
    return {
      key: source.key,
      label: source.label,
      status: "not_configured",
      message: "Add the Google Form ID to FORM_SOURCES before inspecting this form.",
    };
  }

  try {
    const form = FormApp.openById(source.formId);
    const items = form.getItems();

    return {
      key: source.key,
      label: source.label,
      status: "ok",
      formId: form.getId(),
      title: form.getTitle(),
      description: safeRead(() => form.getDescription()),
      confirmationMessage: safeRead(() => form.getConfirmationMessage()),
      publishedUrl: safeRead(() => form.getPublishedUrl()),
      itemCount: items.length,
      items: items.map(inspectItem),
    };
  } catch (error) {
    return {
      key: source.key,
      label: source.label,
      formId: source.formId,
      status: "error",
      message: errorMessage(error),
    };
  }
}

function inspectItem(item) {
  const type = enumName(item.getType());
  const typedItem = castItem(item, type);

  return Object.assign(
    {
      id: item.getId(),
      index: item.getIndex(),
      type,
      title: item.getTitle(),
      helpText: item.getHelpText(),
      required: readRequired(typedItem),
    },
    readTypeSpecificData(typedItem, type),
  );
}

function readTypeSpecificData(item, type) {
  if (!item) return {};

  switch (type) {
    case "CHECKBOX":
    case "LIST":
    case "MULTIPLE_CHOICE":
      return {
        choices: item.getChoices().map((choice) => choice.getValue()),
      };
    case "GRID":
    case "CHECKBOX_GRID":
      return {
        rows: item.getRows(),
        columns: item.getColumns(),
      };
    case "SCALE":
      return {
        lowerBound: item.getLowerBound(),
        upperBound: item.getUpperBound(),
        lowerBoundLabel: item.getLowerBoundLabel(),
        upperBoundLabel: item.getUpperBoundLabel(),
      };
    case "DATE":
    case "DATETIME":
      return {
        includesYear: safeRead(() => item.getIncludesYear()),
        includesMonth: safeRead(() => item.getIncludesMonth()),
        includesDay: safeRead(() => item.getIncludesDay()),
      };
    default:
      return {};
  }
}

function castItem(item, type) {
  try {
    switch (type) {
      case "CHECKBOX":
        return item.asCheckboxItem();
      case "CHECKBOX_GRID":
        return item.asCheckboxGridItem();
      case "DATE":
        return item.asDateItem();
      case "DATETIME":
        return item.asDateTimeItem();
      case "DURATION":
        return item.asDurationItem();
      case "FILE_UPLOAD":
        return item.asFileUploadItem();
      case "GRID":
        return item.asGridItem();
      case "LIST":
        return item.asListItem();
      case "MULTIPLE_CHOICE":
        return item.asMultipleChoiceItem();
      case "PARAGRAPH_TEXT":
        return item.asParagraphTextItem();
      case "RATING":
        return item.asRatingItem();
      case "SCALE":
        return item.asScaleItem();
      case "TEXT":
        return item.asTextItem();
      case "TIME":
        return item.asTimeItem();
      default:
        return null;
    }
  } catch (error) {
    return null;
  }
}

function readRequired(item) {
  if (!item || typeof item.isRequired !== "function") return null;
  return safeRead(() => item.isRequired());
}

function enumName(value) {
  if (value && typeof value.name === "function") return value.name();
  return String(value);
}

function safeRead(reader) {
  try {
    return reader();
  } catch (error) {
    return null;
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
