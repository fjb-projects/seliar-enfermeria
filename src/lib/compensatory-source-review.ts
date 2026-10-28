export const directoryKeys = [
  "registrationNumber",
  "employmentStatus",
  "jobRole",
  "region",
  "contactPhone",
  "workplace",
  "operationalStatus",
  "operationalRole",
] as const;

export type DirectoryData = Record<(typeof directoryKeys)[number], string | null>;

export type RosterSourceRow = DirectoryData & {
  sourceRow: number;
  dni: string | null;
  name: string;
  canLink: boolean;
  issues: string[];
};

export type ReviewRequest = {
  responseId: string;
  submittedAt: string;
  name: string;
  email: string | null;
  mobile: string;
  requestedDate: string;
  requestedHours: string;
  canLink: boolean;
  issues: string[];
};

export type RequestLinkSuggestion = {
  responseId: string;
  candidateSourceRows: number[];
  matchKind: "ordered_name" | "reordered_name" | "none";
};

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 5000;
const INVALID_FILE = "El archivo no se pudo leer de forma segura.";
const REQUIRED_ANSWER_FIELDS = [
  "requesterName",
  "requesterMobile",
  "compensatoryDate",
  "hours",
] as const;
const KNOWN_ANSWER_FIELDS = new Set([...REQUIRED_ANSWER_FIELDS, "requesterEmail"]);

type CsvResult = { records: string[][]; error: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function withinFileLimit(text: unknown): text is string {
  return typeof text === "string" && new TextEncoder().encode(text).byteLength <= MAX_FILE_BYTES;
}

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function parseCsv(text: string): CsvResult {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let quoted = false;
  let afterQuote = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (afterQuote) {
      if (character === ",") {
        record.push(cell);
        cell = "";
        afterQuote = false;
      } else if (character === "\n" || character === "\r") {
        record.push(cell);
        records.push(record);
        record = [];
        cell = "";
        afterQuote = false;
        if (character === "\r" && text[index + 1] === "\n") index += 1;
      } else {
        return { records: [], error: INVALID_FILE };
      }
      continue;
    }

    if (character === '"') {
      if (cell.length !== 0) return { records: [], error: INVALID_FILE };
      quoted = true;
    } else if (character === ",") {
      record.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      record.push(cell);
      records.push(record);
      record = [];
      cell = "";
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      cell += character;
    }
  }

  if (quoted) return { records: [], error: INVALID_FILE };
  if (record.length > 0 || cell.length > 0 || afterQuote) {
    record.push(cell);
    records.push(record);
  }
  return { records, error: null };
}

function emptyDirectoryData(): DirectoryData {
  return {
    registrationNumber: null,
    employmentStatus: null,
    jobRole: null,
    region: null,
    contactPhone: null,
    workplace: null,
    operationalStatus: null,
    operationalRole: null,
  };
}

function nullableCell(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function approvedHeaderPositions(header: string[]) {
  const positions = new Map<string, number[]>();
  const add = (key: string, index: number) => {
    positions.set(key, [...(positions.get(key) ?? []), index]);
  };

  header.forEach((value, index) => {
    const normalized = normalizeHeader(value.replace(/^\uFEFF/, ""));
    if (
      normalized === "dni" ||
      normalized === "matricula" ||
      normalized === "apellidoynombre" ||
      normalized === "sitderevista" ||
      normalized === "funcion" ||
      normalized === "region" ||
      normalized === "contacto" ||
      normalized === "lugardedesempeno" ||
      normalized === "operativo"
    ) {
      add(normalized, index);
    }
  });
  return positions;
}

function csvColumnMap(header: string[]) {
  const columns = approvedHeaderPositions(header);
  const single = (key: string) => {
    const indices = columns.get(key);
    return indices?.length === 1 ? indices[0] : undefined;
  };
  const dni = single("dni");
  const registrationNumber = single("matricula");
  const name = single("apellidoynombre");
  const employmentStatus = single("sitderevista");
  const region = single("region");
  const contactPhone = single("contacto");
  const workplace = single("lugardedesempeno");
  const operationalStatus = single("operativo");
  const functions = columns.get("funcion");
  if (
    dni === undefined ||
    registrationNumber === undefined ||
    name === undefined ||
    employmentStatus === undefined ||
    region === undefined ||
    contactPhone === undefined ||
    workplace === undefined ||
    operationalStatus === undefined ||
    functions?.length !== 2 ||
    functions[0] === undefined ||
    functions[1] === undefined
  ) {
    return null;
  }

  return {
    dni,
    registrationNumber,
    name,
    employmentStatus,
    jobRole: functions[0],
    region,
    contactPhone,
    workplace,
    operationalStatus,
    operationalRole: functions[1],
  };
}

function canonicalDni(value: string) {
  const digits = value.replace(/[.\s]/gu, "");
  return /^\d{7,8}$/u.test(digits) ? digits : null;
}

export function parseRosterCsv(text: string): {
  rows: RosterSourceRow[];
  warnings: string[];
} {
  if (!withinFileLimit(text)) {
    return { rows: [], warnings: [INVALID_FILE] };
  }

  const parsed = parseCsv(text.replace(/^\uFEFF/, ""));
  if (parsed.error || parsed.records.length === 0) {
    return { rows: [], warnings: [parsed.error ?? INVALID_FILE] };
  }
  if (parsed.records.length - 1 > MAX_ROWS) {
    return { rows: [], warnings: ["El archivo supera el límite de 5000 filas."] };
  }

  const header = parsed.records[0];
  const map = header ? csvColumnMap(header) : null;
  if (!header || !map) {
    return {
      rows: [],
      warnings: ["Faltan encabezados requeridos o hay encabezados duplicados."],
    };
  }

  const rows = parsed.records.slice(1).map((cells, index) => {
    const issues: string[] = [];
    const rawDni = cells[map.dni] ?? "";
    const dni = rawDni.trim().length === 0 ? null : canonicalDni(rawDni);
    const name = (cells[map.name] ?? "").trim();
    if (!dni) issues.push("DNI faltante o inválido.");
    if (!name) issues.push("Nombre faltante.");

    const data = emptyDirectoryData();
    const directoryColumns: Record<keyof DirectoryData, number> = {
      registrationNumber: map.registrationNumber,
      employmentStatus: map.employmentStatus,
      jobRole: map.jobRole,
      region: map.region,
      contactPhone: map.contactPhone,
      workplace: map.workplace,
      operationalStatus: map.operationalStatus,
      operationalRole: map.operationalRole,
    };
    for (const key of directoryKeys) {
      data[key] = nullableCell(cells[directoryColumns[key]]);
    }

    if (cells.length !== header.length) {
      issues.push("La fila tiene una cantidad de columnas distinta al encabezado.");
    }
    return {
      ...data,
      sourceRow: index + 2,
      dni,
      name,
      canLink: Boolean(dni && name && cells.length === header.length),
      issues,
    };
  });

  const dniRows = new Map<string, RosterSourceRow[]>();
  for (const row of rows) {
    if (!row.dni) continue;
    dniRows.set(row.dni, [...(dniRows.get(row.dni) ?? []), row]);
  }
  for (const duplicates of dniRows.values()) {
    if (duplicates.length < 2) continue;
    for (const row of duplicates) {
      row.canLink = false;
      row.issues.push("DNI duplicado en el archivo fuente.");
    }
  }

  return {
    rows,
    warnings: rows.some((row) => row.issues.length > 0)
      ? ["Hay filas que requieren revisión antes de vincular."]
      : [],
  };
}

function invalidJsonResult(warning = INVALID_FILE) {
  return { formId: "", exportedAt: "", requests: [] as ReviewRequest[], warnings: [warning] };
}

export function parseCompensatoryJson(text: string): {
  formId: string;
  exportedAt: string;
  requests: ReviewRequest[];
  warnings: string[];
} {
  if (!withinFileLimit(text)) return invalidJsonResult();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return invalidJsonResult();
  }
  if (!isRecord(parsed)) return invalidJsonResult();

  const source = parsed["source"];
  const responses = parsed["responses"];
  if (
    parsed["schemaVersion"] !== 1 ||
    typeof parsed["exportedAt"] !== "string" ||
    !isRecord(source) ||
    source["kind"] !== "google-forms" ||
    typeof source["formId"] !== "string" ||
    source["formId"].trim().length === 0 ||
    !Number.isInteger(parsed["responseCount"]) ||
    !Array.isArray(responses) ||
    parsed["responseCount"] !== responses.length
  ) {
    return invalidJsonResult("La estructura o el recuento del archivo no son válidos.");
  }
  if (responses.length > MAX_ROWS) {
    return invalidJsonResult("El archivo supera el límite de 5000 solicitudes.");
  }

  const responseIds = new Set<string>();
  const responseData: Array<{
    response: Record<string, unknown>;
    responseId: string;
    submittedAt: string;
  }> = [];
  for (const item of responses) {
    if (
      !isRecord(item) ||
      typeof item["responseId"] !== "string" ||
      item["responseId"].trim().length === 0 ||
      typeof item["submittedAt"] !== "string" ||
      item["submittedAt"].trim().length === 0
    ) {
      return invalidJsonResult("Falta la identidad de una respuesta fuente.");
    }
    if (responseIds.has(item["responseId"])) {
      return invalidJsonResult("Hay identificadores de respuesta duplicados.");
    }
    responseIds.add(item["responseId"]);
    responseData.push({
      response: item,
      responseId: item["responseId"],
      submittedAt: item["submittedAt"],
    });
  }

  let hasRowIssues = false;
  const requests = responseData.map(({ response, responseId, submittedAt }) => {
    const issues: string[] = [];
    const fields = new Map<string, unknown[]>();
    if (!Array.isArray(response["answers"])) {
      issues.push("Faltan las respuestas del formulario.");
    } else {
      for (const answer of response["answers"]) {
        if (!isRecord(answer) || typeof answer["field"] !== "string") continue;
        if (!KNOWN_ANSWER_FIELDS.has(answer["field"])) continue;
        fields.set(answer["field"], [...(fields.get(answer["field"]) ?? []), answer["value"]]);
      }
    }

    const values = new Map<string, string>();
    for (const field of REQUIRED_ANSWER_FIELDS) {
      const matches = fields.get(field) ?? [];
      if (matches.length !== 1) {
        issues.push(
          matches.length === 0
            ? `Falta la respuesta ${field}.`
            : `La respuesta ${field} aparece más de una vez.`,
        );
        continue;
      }
      const value = matches[0];
      if (typeof value !== "string") {
        issues.push(`La respuesta ${field} no es texto.`);
        continue;
      }
      values.set(field, value);
      if (!value.trim()) issues.push(`La respuesta ${field} está vacía.`);
    }

    let email: string | null = null;
    const emailValues = fields.get("requesterEmail") ?? [];
    if (emailValues.length > 1) {
      issues.push("La respuesta requesterEmail aparece más de una vez.");
    } else if (emailValues.length === 1) {
      if (typeof emailValues[0] !== "string") {
        issues.push("La respuesta requesterEmail no es texto.");
      } else {
        email = emailValues[0] || null;
      }
    }

    const name = values.get("requesterName") ?? "";
    if (!name.trim() && !issues.some((issue) => issue.includes("requesterName"))) {
      issues.push("Falta la identidad del solicitante.");
    }
    if (issues.length > 0) hasRowIssues = true;
    return {
      responseId,
      submittedAt,
      name,
      email,
      mobile: values.get("requesterMobile") ?? "",
      requestedDate: values.get("compensatoryDate") ?? "",
      requestedHours: values.get("hours") ?? "",
      canLink: issues.length === 0,
      issues,
    };
  });

  return {
    formId: source["formId"],
    exportedAt: parsed["exportedAt"],
    requests,
    warnings: hasRowIssues ? ["Hay solicitudes que requieren revisión antes de vincular."] : [],
  };
}

function normalizedName(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
}

export function suggestRequestLinks(
  rows: RosterSourceRow[],
  requests: ReviewRequest[],
): RequestLinkSuggestion[] {
  return requests.map((request) => {
    if (!request.canLink) {
      return {
        responseId: request.responseId,
        candidateSourceRows: [],
        matchKind: "none",
      };
    }

    const requestTokens = normalizedName(request.name);
    const orderedName = requestTokens.join(" ");
    if (!orderedName) {
      return {
        responseId: request.responseId,
        candidateSourceRows: [],
        matchKind: "none",
      };
    }
    const sortedName = [...requestTokens].sort().join(" ");
    const candidates: Array<{ sourceRow: number; ordered: boolean }> = [];
    for (const row of rows) {
      if (!row.canLink || !row.dni) continue;
      const rowTokens = normalizedName(row.name);
      if (rowTokens.length === 0) continue;
      const rowOrdered = rowTokens.join(" ");
      const rowSorted = [...rowTokens].sort().join(" ");
      if (rowSorted === sortedName) {
        candidates.push({ sourceRow: row.sourceRow, ordered: rowOrdered === orderedName });
      }
    }

    const ordered = candidates.some((candidate) => candidate.ordered);
    return {
      responseId: request.responseId,
      candidateSourceRows: candidates.map((candidate) => candidate.sourceRow),
      matchKind: candidates.length === 0 ? "none" : ordered ? "ordered_name" : "reordered_name",
    };
  });
}
