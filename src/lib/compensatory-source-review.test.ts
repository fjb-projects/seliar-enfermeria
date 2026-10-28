import { describe, expect, it } from "vitest";
import {
  directoryKeys,
  parseCompensatoryJson,
  parseRosterCsv,
  suggestRequestLinks,
} from "./compensatory-source-review";

const headers = [
  "D.N.I.",
  "MATRICULA",
  "APELLIDO Y NOMBRE",
  "SIT DE REVISTA",
  "FUNCION",
  "REGION",
  "contacto",
  "LUGAR DE DESEMPEÑO",
  "OBS.",
  "OPERATIVO",
  "FUNCION",
];

function csvRow(values: string[]) {
  return values.map((value) => `"${value.replaceAll('"', '""')}"`).join(",");
}

function rosterCsv(rows: string[][], header = headers) {
  return [csvRow(header), ...rows.map(csvRow)].join("\r\n");
}

function response(responseId: unknown, answers: Array<{ field: string; value: unknown }>) {
  return {
    responseId,
    submittedAt: "2026-10-01T12:00:00.000Z",
    answers: answers.map(({ field, value }) => ({
      field,
      itemId: `item-${field}`,
      itemType: "TEXT",
      value,
    })),
  };
}

function jsonExport(responses: unknown[], responseCount = responses.length) {
  return JSON.stringify({
    schemaVersion: 1,
    exportedAt: "2026-10-28T10:00:00.000Z",
    source: { kind: "google-forms", formId: "synthetic-form" },
    responseCount,
    responses,
  });
}

const validAnswers = [
  { field: "requesterName", value: "Ana Pérez" },
  { field: "requesterMobile", value: "Ambulance 4" },
  { field: "compensatoryDate", value: "31/02/2026" },
  { field: "hours", value: "2 a 4" },
];

describe("parseRosterCsv", () => {
  it("maps the approved directory keys and keeps the two FUNCION columns distinct", () => {
    const result = parseRosterCsv(
      rosterCsv([
        [
          "12.345.678",
          "MP-4",
          "Ana Pérez",
          "Planta",
          "Enfermería",
          "Sur",
          "123",
          "Base",
          "private",
          "Activo",
          "Guardia",
        ],
      ]),
    );

    expect(directoryKeys).toEqual([
      "registrationNumber",
      "employmentStatus",
      "jobRole",
      "region",
      "contactPhone",
      "workplace",
      "operationalStatus",
      "operationalRole",
    ]);
    expect(result.rows).toEqual([
      {
        sourceRow: 2,
        dni: "12345678",
        name: "Ana Pérez",
        canLink: true,
        issues: [],
        registrationNumber: "MP-4",
        employmentStatus: "Planta",
        jobRole: "Enfermería",
        region: "Sur",
        contactPhone: "123",
        workplace: "Base",
        operationalStatus: "Activo",
        operationalRole: "Guardia",
      },
    ]);
    expect(JSON.stringify(result.rows)).not.toContain("private");
  });

  it("supports BOM, quoted commas, escaped quotes, LF, and quoted newlines", () => {
    const result = parseRosterCsv(
      `\uFEFF${csvRow(headers)}\n${csvRow([
        "1234567",
        "MP, 4",
        'Ana "A" Pérez\nsegunda línea',
        "Planta",
        "Enfermería",
        "Sur",
        "",
        "Base",
        "ignored",
        "Activo",
        "Guardia",
      ])}`,
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      sourceRow: 2,
      dni: "1234567",
      name: 'Ana "A" Pérez\nsegunda línea',
      registrationNumber: "MP, 4",
      contactPhone: null,
    });
  });

  it("retains named rows without a DNI and marks them ineligible", () => {
    const result = parseRosterCsv(
      rosterCsv([["", "", "Missing Identity", "", "", "", "", "", "", "", ""]]),
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      sourceRow: 2,
      dni: null,
      name: "Missing Identity",
      canLink: false,
    });
    expect(result.rows[0]?.issues).not.toHaveLength(0);
  });

  it("disables every source row implicated in a canonical duplicate DNI", () => {
    const result = parseRosterCsv(
      rosterCsv([
        ["12.345.678", "", "First Person", "", "", "", "", "", "", "", ""],
        ["12345678", "", "Second Person", "", "", "", "", "", "", "", ""],
      ]),
    );

    expect(result.rows.map((row) => row.canLink)).toEqual([false, false]);
    expect(result.rows.every((row) => row.issues.length > 0)).toBe(true);
  });

  it("rejects missing or duplicate approved headers instead of choosing a winner", () => {
    const missing = parseRosterCsv(
      rosterCsv(
        [],
        headers.filter((_, index) => index !== 0),
      ),
    );
    const duplicate = parseRosterCsv(rosterCsv([], [...headers, "REGION"]));

    expect(missing.rows).toEqual([]);
    expect(missing.warnings.length).toBeGreaterThan(0);
    expect(duplicate.rows).toEqual([]);
    expect(duplicate.warnings.length).toBeGreaterThan(0);
  });

  it("rejects malformed quoting and oversize or over-limit inputs without truncation", () => {
    expect(parseRosterCsv(`${csvRow(headers)}\r\n"broken`).rows).toEqual([]);
    expect(parseRosterCsv("x".repeat(2 * 1024 * 1024 + 1)).warnings.length).toBeGreaterThan(0);
    const manyRows = rosterCsv(
      Array.from({ length: 5001 }, (_, index) => [
        String(1000000 + index),
        "",
        `Person ${index}`,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]),
    );
    expect(parseRosterCsv(manyRows).rows).toEqual([]);
  });
});

describe("parseCompensatoryJson", () => {
  it("preserves raw answer strings and treats mobile as opaque source data", () => {
    const result = parseCompensatoryJson(jsonExport([response("r1", validAnswers)]));

    expect(result.formId).toBe("synthetic-form");
    expect(result.exportedAt).toBe("2026-10-28T10:00:00.000Z");
    expect(result.requests).toEqual([
      {
        responseId: "r1",
        submittedAt: "2026-10-01T12:00:00.000Z",
        name: "Ana Pérez",
        email: null,
        mobile: "Ambulance 4",
        requestedDate: "31/02/2026",
        requestedHours: "2 a 4",
        canLink: true,
        issues: [],
      },
    ]);
  });

  it("rejects invalid envelopes, versions, counts, IDs, and duplicate IDs as a whole file", () => {
    const valid = JSON.parse(jsonExport([response("r1", validAnswers)]));
    const invalids = [
      "not json",
      JSON.stringify({ ...valid, schemaVersion: 2 }),
      JSON.stringify({ ...valid, responseCount: 2 }),
      jsonExport([response("r1", validAnswers), response("r1", validAnswers)]),
      jsonExport([response("", validAnswers)]),
    ];

    for (const text of invalids) {
      const result = parseCompensatoryJson(text);
      expect(result.requests).toEqual([]);
      expect(result.warnings.length).toBeGreaterThan(0);
    }
  });

  it("keeps requests but disables links for missing identity and missing or duplicate answers", () => {
    const noName = response(
      "r1",
      validAnswers.filter(({ field }) => field !== "requesterName"),
    );
    const duplicateName = response("r2", [
      ...validAnswers,
      { field: "requesterName", value: "Other Name" },
    ]);
    const missingDate = response(
      "r3",
      validAnswers.filter(({ field }) => field !== "compensatoryDate"),
    );

    const result = parseCompensatoryJson(jsonExport([noName, duplicateName, missingDate]));

    expect(result.requests).toHaveLength(3);
    expect(result.requests.map((request) => request.canLink)).toEqual([false, false, false]);
    expect(result.requests.every((request) => request.issues.length > 0)).toBe(true);
  });

  it("allows an absent optional email but rejects non-string known answer values", () => {
    const withInvalidDate = response("r1", [
      ...validAnswers.filter(({ field }) => field !== "compensatoryDate"),
      { field: "compensatoryDate", value: { text: "unknown" } },
    ]);
    const result = parseCompensatoryJson(
      jsonExport([response("r0", validAnswers), withInvalidDate]),
    );

    expect(result.requests[0]?.canLink).toBe(true);
    expect(result.requests[0]?.email).toBeNull();
    expect(result.requests[1]?.requestedDate).toBe("");
    expect(result.requests[1]?.canLink).toBe(false);
    expect(result.requests[1]?.issues.length).toBeGreaterThan(0);
  });

  it("rejects input over the byte and row limits", () => {
    expect(parseCompensatoryJson(" ".repeat(2 * 1024 * 1024 + 1)).requests).toEqual([]);
    const many = Array.from({ length: 5001 }, (_, index) => response(`r${index}`, validAnswers));
    expect(parseCompensatoryJson(jsonExport(many)).requests).toEqual([]);
  });
});

describe("suggestRequestLinks", () => {
  const roster = parseRosterCsv(
    rosterCsv([
      ["1234567", "", "Ana Maria Pérez", "", "", "", "", "", "", "", ""],
      ["2345678", "", "Ana Pérez Maria", "", "", "", "", "", "", "", ""],
      ["3456789", "", "Repeated Ana Ana", "", "", "", "", "", "", "", ""],
      ["", "", "Ambulance 4", "", "", "", "", "", "", "", ""],
      ["4567890", "", "Ana Maria Pérez", "", "", "", "", "", "", "", ""],
    ]),
  ).rows;

  it("offers every exact ordered-name candidate, never a first winner", () => {
    const requests = parseCompensatoryJson(
      jsonExport([
        response("r1", [
          { field: "requesterName", value: "Ana María Pérez" },
          ...validAnswers.slice(1),
        ]),
      ]),
    ).requests;
    expect(suggestRequestLinks(roster, requests)).toEqual([
      { responseId: "r1", candidateSourceRows: [2, 3, 6], matchKind: "ordered_name" },
    ]);
  });

  it("matches only exact reordered token equality and preserves repeated tokens", () => {
    const requests = parseCompensatoryJson(
      jsonExport([
        response("reordered", [
          { field: "requesterName", value: "PÉREZ, Ana María" },
          ...validAnswers.slice(1),
        ]),
        response("repeated", [
          { field: "requesterName", value: "Ana Repeated Ana" },
          ...validAnswers.slice(1),
        ]),
        response("not-repeated", [
          { field: "requesterName", value: "Ana Repeated" },
          ...validAnswers.slice(1),
        ]),
      ]),
    ).requests;
    const links = suggestRequestLinks(roster, requests);

    expect(links.map((link) => link.matchKind)).toEqual([
      "reordered_name",
      "reordered_name",
      "none",
    ]);
    expect(links[1]?.candidateSourceRows).toEqual([4]);
    expect(links[2]?.candidateSourceRows).toEqual([]);
  });

  it("does not use email, mobile, fuzzy names, or ineligible source rows", () => {
    const requests = parseCompensatoryJson(
      jsonExport([
        response("mobile", [
          { field: "requesterName", value: "Unrelated Person" },
          { field: "requesterMobile", value: "Ambulance 4" },
          ...validAnswers.slice(2),
        ]),
        response("fuzzy", [
          { field: "requesterName", value: "Ana M Perez" },
          ...validAnswers.slice(1),
        ]),
        response("invalid", [
          { field: "requesterName", value: "Ambulance 4" },
          ...validAnswers.slice(1),
        ]),
      ]),
    ).requests;
    const links = suggestRequestLinks(roster, requests);

    expect(links.map((link) => link.matchKind)).toEqual(["none", "none", "none"]);
    expect(links.every((link) => link.candidateSourceRows.length === 0)).toBe(true);
  });
});
