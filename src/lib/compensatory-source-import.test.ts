import { describe, expect, it } from "vitest";
import {
  filterCompensatoryImport,
  parseCompensatoryImportJson,
} from "./compensatory-source-import";
import { parseCompensatoryJson } from "./compensatory-source-review";

function fixture(dates: string[]) {
  return JSON.stringify({
    schemaVersion: 1,
    exportedAt: "2026-11-01T12:00:00Z",
    source: { kind: "google-forms", formId: "synthetic-form" },
    responseCount: dates.length,
    responses: dates.map((date, index) => ({
      responseId: `request-${index}`,
      submittedAt: "2026-10-01T12:00:00Z",
      answers: Object.entries({
        requesterName: `Synthetic Person ${index}`,
        requesterMobile: "Móvil 1",
        compensatoryDate: date,
        hours: "2",
      }).map(([field, value]) => ({ field, value })),
    })),
  });
}

describe("parseCompensatoryImportJson", () => {
  const now = new Date("2026-11-09T15:00:00Z");

  it("restores past requests when the future-only filter is disabled, without reloading", () => {
    const text = fixture(["08/11/2026", "09/11/2026", "10/11/2026"]);
    const source = parseCompensatoryJson(text);
    const original = structuredClone(source);

    expect(filterCompensatoryImport(source, now, true).requests).toEqual(source.requests.slice(1));
    const unfiltered = filterCompensatoryImport(source, now, false);
    expect(unfiltered).toEqual(source);
    expect(filterCompensatoryImport(source, now, true).requests).toEqual(source.requests.slice(1));
    expect(source).toEqual(original);
  });

  it("keeps invalid dates blocked and parser warnings intact with the filter disabled", () => {
    const source = parseCompensatoryJson(fixture(["2020-01-01", "31/02/2026"]));
    const result = filterCompensatoryImport(source, now, false);
    expect(result.requests).toHaveLength(2);
    expect(result.requests[0]).toEqual(source.requests[0]);
    expect(result.requests[1]).toMatchObject({ canLink: false, requestedDate: "31/02/2026" });
    expect(result.warnings.some((warning) => warning.includes("omitidas"))).toBe(false);
    expect(filterCompensatoryImport(parseCompensatoryJson("invalid"), now, false)).toEqual(
      parseCompensatoryJson("invalid"),
    );
  });

  it.each([
    ["2026-11-08", "2026-11-09", "2026-11-10"],
    ["08/11/2026", "09/11/2026", "10/11/2026"],
  ])("omits past requested dates but keeps today and future dates: %s", (...dates) => {
    const text = fixture(dates);
    const original = parseCompensatoryJson(text);
    const result = parseCompensatoryImportJson(text, now);

    expect(result.requests).toEqual(original.requests.slice(1));
    expect(result.warnings).toContain(
      "Solicitudes omitidas por fecha solicitada anterior a hoy (2026-11-09, Buenos Aires): 1.",
    );
    expect(parseCompensatoryJson(text)).toEqual(original);
    expect(result.formId).toBe(original.formId);
    expect(result.exportedAt).toBe(original.exportedAt);
  });

  it("uses Buenos Aires midnight rather than UTC or the submission date", () => {
    const text = fixture(["2026-11-08", "2026-11-09"]);
    expect(
      parseCompensatoryImportJson(text, new Date("2026-11-09T02:59:59Z")).requests,
    ).toHaveLength(2);
    expect(
      parseCompensatoryImportJson(text, new Date("2026-11-09T03:00:00Z")).requests.map(
        (request) => request.requestedDate,
      ),
    ).toEqual(["2026-11-09"]);
  });

  it("reports an all-expired file even when no cards remain", () => {
    const result = parseCompensatoryImportJson(fixture(["2025-12-31", "01/01/2026"]), now);
    expect(result.requests).toEqual([]);
    expect(result.warnings).toContain(
      "Solicitudes omitidas por fecha solicitada anterior a hoy (2026-11-09, Buenos Aires): 2.",
    );
  });

  it.each(["", "31/02/2026", "2026-02-30", "not a date"])(
    "keeps an unrecognized date visible for review, but never importable: %s",
    (date) => {
      const result = parseCompensatoryImportJson(fixture([date]), now);
      expect(result.requests).toHaveLength(1);
      expect(result.requests[0]).toMatchObject({ requestedDate: date, canLink: false });
      expect(result.requests[0]?.issues).toContain(
        "No se pudo validar la fecha solicitada; revisa el dato original antes de importar.",
      );
    },
  );

  it("preserves parser errors, duplicate safeguards and rows with other issues", () => {
    expect(parseCompensatoryImportJson("invalid", now)).toEqual(parseCompensatoryJson("invalid"));
    const envelope = JSON.parse(fixture(["2026-11-10", "2026-11-11"]));
    envelope.responses[1].responseId = envelope.responses[0].responseId;
    const duplicate = JSON.stringify(envelope);
    expect(parseCompensatoryImportJson(duplicate, now)).toEqual(parseCompensatoryJson(duplicate));

    envelope.responses.pop();
    envelope.responseCount = 1;
    envelope.responses[0].answers = envelope.responses[0].answers.filter(
      (answer: { field: string }) => answer.field !== "hours",
    );
    const incomplete = JSON.stringify(envelope);
    expect(parseCompensatoryImportJson(incomplete, now)).toEqual(parseCompensatoryJson(incomplete));
  });
});
