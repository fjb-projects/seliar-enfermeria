import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "docs/google-apps-script/compensatorio.gs"),
  "utf8",
);
const itemIds = {
  requesterEmail: 1851963092,
  requesterName: 77797409,
  requesterMobile: 1572866606,
  compensatoryDate: 556605314,
  hours: 718502073,
};

function answer(id: number, value: unknown, title = "Question", type = "TEXT") {
  return {
    getItem: () => ({ getId: () => id, getTitle: () => title, getType: () => type }),
    getResponse: () => value,
  };
}

function response(
  id: string,
  answers = [
    answer(itemIds.requesterName, "Test nurse"),
    answer(itemIds.requesterEmail, "nurse@example.test", "Correo electrónico"),
    answer(itemIds.requesterMobile, "Móvil 1", "Mobile", "LIST"),
    answer(itemIds.compensatoryDate, "10/11/2026", "Requested date", "DATE"),
    answer(itemIds.hours, "12,5"),
  ],
) {
  return {
    getId: () => id,
    getTimestamp: () => new Date("2026-10-27T13:00:00Z"),
    getItemResponses: () => answers,
  };
}

function harness(responses = [response("response-1")]) {
  const file = {
    setSharing: vi.fn(),
    getSharingAccess: vi.fn(() => "PRIVATE"),
    setContent: vi.fn<(content: string) => void>(),
    setTrashed: vi.fn(),
    getId: vi.fn(() => "private-export-id"),
    getUrl: vi.fn(() => "https://drive.google.com/file/d/private-export-id/view"),
  };
  const submitted = { getId: () => "new-response" };
  const draft = { withItemResponse: vi.fn(), submit: vi.fn(() => submitted) };
  const formItem = (id: number) => ({
    getId: () => id,
    getTitle: () => (id === itemIds.requesterEmail ? "Correo electrónico" : "Question"),
    getType: () => "TEXT",
    asTextItem: () => ({ createResponse: (value: unknown) => ({ id, value }) }),
    asListItem: () => ({ createResponse: (value: unknown) => ({ id, value }) }),
    asDateItem: () => ({ createResponse: (value: unknown) => ({ id, value }) }),
  });
  const form = {
    getResponses: vi.fn(() => responses),
    collectsEmail: vi.fn(() => false),
    getItems: vi.fn(() => [formItem(itemIds.requesterEmail)]),
    getItemById: vi.fn(formItem),
    createResponse: vi.fn(() => draft),
  };
  const mocks = {
    Date,
    FormApp: { openById: vi.fn(() => form), ItemType: { TEXT: "TEXT" } },
    DriveApp: {
      createFile: vi.fn<(name: string, content: string, mimeType: string) => typeof file>(
        () => file,
      ),
      Access: { PRIVATE: "PRIVATE" },
      Permission: { NONE: "NONE" },
    },
    Session: { getScriptTimeZone: vi.fn(() => "America/Argentina/Buenos_Aires") },
    Utilities: {
      newBlob: vi.fn((content: string) => ({
        getBytes: () => ({ length: Buffer.byteLength(content, "utf8") }),
      })),
    },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: () => "test-secret" }),
    },
    MailApp: { sendEmail: vi.fn() },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (content: string) => ({
        content,
        setMimeType() {
          return this;
        },
      }),
    },
    console: { log: vi.fn(), error: vi.fn() },
  };
  const context = createContext(mocks);
  runInContext(source, context);
  const runtime = context as unknown as {
    exportCompensatorioResponsesToJson(): {
      responseCount: number;
      fileId: string;
      fileUrl: string;
    };
    doGet(): { content: string };
    doPost(event: { postData: { contents: string } }): { content: string };
  };
  return { runtime, mocks, form, file, draft };
}

function exportedPayload(file: ReturnType<typeof harness>["file"]) {
  const content = file.setContent.mock.calls[0]?.[0];
  if (content === undefined) throw new Error("Expected export content to be written");
  return JSON.parse(content);
}

describe("manual compensatory response export", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T14:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("exports response identity and raw selected answers without changing the Form or sending mail", () => {
    const { runtime, mocks, form, file, draft } = harness();
    const result = runtime.exportCompensatorioResponsesToJson();
    const payload = exportedPayload(file);
    expect(payload).toMatchObject({
      schemaVersion: 1,
      exportedAt: "2026-10-27T14:00:00.000Z",
      source: { kind: "google-forms", scriptTimeZone: "America/Argentina/Buenos_Aires" },
      responseCount: 1,
      responses: [{ responseId: "response-1", submittedAt: "2026-10-27T13:00:00.000Z" }],
    });
    expect(payload.responses[0].answers).toEqual(
      expect.arrayContaining([
        { field: "hours", itemId: String(itemIds.hours), itemType: "TEXT", value: "12,5" },
        {
          field: "compensatoryDate",
          itemId: String(itemIds.compensatoryDate),
          itemType: "DATE",
          value: "10/11/2026",
        },
      ]),
    );
    expect(result.responseCount).toBe(1);
    expect(result.fileId).toBe("private-export-id");
    expect(mocks.DriveApp.createFile).toHaveBeenCalledWith(
      "compensatorio-responses-2026-10-27T14-00-00-000Z.json",
      "",
      "application/json",
    );
    expect(file.setSharing).toHaveBeenCalledWith("PRIVATE", "NONE");
    expect(file.getSharingAccess.mock.invocationCallOrder[0]).toBeLessThan(
      file.setContent.mock.invocationCallOrder[0] ?? 0,
    );
    expect(form.createResponse).not.toHaveBeenCalled();
    expect(draft.submit).not.toHaveBeenCalled();
    expect(mocks.MailApp.sendEmail).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.console.log.mock.calls)).not.toMatch(
      /Test nurse|nurse@example|12,5|test-secret/,
    );
    expect(payload).not.toHaveProperty("secret");
  });

  it("keeps empty and legacy answers and resolves a repaired email item by its title", () => {
    const rows = [
      response("legacy", [
        answer(itemIds.requesterName, ""),
        answer(987654, "legacy@example.test", " Correo electrónico "),
        answer(111, "Unrelated private answer", "Unrelated question"),
      ]),
    ];
    const { runtime, file } = harness(rows);
    runtime.exportCompensatorioResponsesToJson();
    const payload = exportedPayload(file);
    expect(payload.responses[0].answers).toEqual([
      {
        field: "requesterName",
        itemId: String(itemIds.requesterName),
        itemType: "TEXT",
        value: "",
      },
      { field: "requesterEmail", itemId: "987654", itemType: "TEXT", value: "legacy@example.test" },
    ]);
    expect(payload.responses[0].missingFields).toEqual([
      "requesterMobile",
      "compensatoryDate",
      "hours",
    ]);
    expect(payload.responses[0].unmappedItemIds).toEqual(["111"]);
    expect(JSON.stringify(payload)).not.toContain("Unrelated private answer");
  });

  it("preserves duplicate field answers rather than choosing one and exports an empty Form", () => {
    const { runtime, file } = harness([
      response("duplicate", [
        answer(itemIds.requesterEmail, "first@example.test"),
        answer(987654, "second@example.test", "Correo electrónico"),
      ]),
    ]);
    runtime.exportCompensatorioResponsesToJson();
    expect(exportedPayload(file).responses[0].duplicateFields).toEqual(["requesterEmail"]);
    const empty = harness([]);
    expect(empty.runtime.exportCompensatorioResponsesToJson().responseCount).toBe(0);
    expect(exportedPayload(empty.file).responses).toEqual([]);
  });

  it("does not put personal data into a file until private sharing is verified", () => {
    const { runtime, file, mocks } = harness();
    file.getSharingAccess.mockReturnValue("ANYONE");
    expect(() => runtime.exportCompensatorioResponsesToJson()).toThrow(/export failed/i);
    expect(mocks.DriveApp.createFile.mock.calls[0]?.[1]).toBe("");
    expect(file.setContent).not.toHaveBeenCalled();
    expect(file.setTrashed).toHaveBeenCalledWith(true);
    expect(mocks.console.log).not.toHaveBeenCalled();
  });

  it("cleans up only the newly created file when writing fails and reports cleanup failure", () => {
    const h = harness();
    h.file.setContent.mockImplementation(() => {
      throw new Error("simulated write failure");
    });
    expect(() => h.runtime.exportCompensatorioResponsesToJson()).toThrow(/export failed/i);
    expect(h.file.setTrashed).toHaveBeenCalledOnce();
    h.file.setTrashed.mockImplementation(() => {
      throw new Error("simulated cleanup failure");
    });
    expect(() => h.runtime.exportCompensatorioResponsesToJson()).toThrow(/discard.*manually/i);
  });

  it("fails before creating a file for oversized data or a response without identity", () => {
    const oversized = harness();
    oversized.mocks.Utilities.newBlob.mockReturnValue({ getBytes: () => ({ length: 10_000_001 }) });
    expect(() => oversized.runtime.exportCompensatorioResponsesToJson()).toThrow(/10 MB/i);
    expect(oversized.mocks.DriveApp.createFile).not.toHaveBeenCalled();
    const unidentified = harness([response("")]);
    expect(() => unidentified.runtime.exportCompensatorioResponsesToJson()).toThrow(
      /response.*ID/i,
    );
    expect(unidentified.mocks.DriveApp.createFile).not.toHaveBeenCalled();
  });

  it("preserves typed Date and array values and refuses unsupported values or invalid timestamps", () => {
    const typed = harness([
      response("typed", [
        answer(itemIds.compensatoryDate, new Date("2026-11-10T03:00:00Z"), "Date", "DATE"),
        answer(itemIds.hours, ["12", "24"]),
      ]),
    ]);
    typed.runtime.exportCompensatorioResponsesToJson();
    expect(exportedPayload(typed.file).responses[0].answers).toEqual([
      {
        field: "compensatoryDate",
        itemId: String(itemIds.compensatoryDate),
        itemType: "DATE",
        value: { kind: "date", iso: "2026-11-10T03:00:00.000Z" },
      },
      { field: "hours", itemId: String(itemIds.hours), itemType: "TEXT", value: ["12", "24"] },
    ]);
    const unsupported = harness([
      response("unsupported", [answer(itemIds.hours, { invalid: true })]),
    ]);
    expect(() => unsupported.runtime.exportCompensatorioResponsesToJson()).toThrow(
      /unsupported value/i,
    );
    expect(unsupported.mocks.DriveApp.createFile).not.toHaveBeenCalled();
    const row = response("bad-timestamp");
    row.getTimestamp = () => new Date(Number.NaN);
    const invalid = harness([row]);
    expect(() => invalid.runtime.exportCompensatorioResponsesToJson()).toThrow(
      /invalid submission timestamp/i,
    );
    expect(invalid.mocks.DriveApp.createFile).not.toHaveBeenCalled();
  });

  it("keeps the public GET as a health response and unauthorized POSTs unable to export", () => {
    const { runtime, mocks } = harness();
    expect(JSON.parse(runtime.doGet().content)).toEqual({ ok: true, service: "compensatorio" });
    expect(
      JSON.parse(
        runtime.doPost({
          postData: { contents: JSON.stringify({ action: "export", secret: "wrong" }) },
        }).content,
      ),
    ).toEqual({ ok: false, error: "Unauthorized" });
    expect(mocks.FormApp.openById).not.toHaveBeenCalled();
    expect(mocks.DriveApp.createFile).not.toHaveBeenCalled();
  });

  it("preserves the existing authorized POST response and optional confirmation copy", () => {
    const { runtime, mocks, draft } = harness();
    const result = JSON.parse(
      runtime.doPost({
        postData: {
          contents: JSON.stringify({
            secret: "test-secret",
            request: {
              emailRequested: true,
              requesterName: "Test nurse",
              requesterEmail: "nurse@example.test",
              requesterMobile: "Móvil 1",
              compensatoryDate: "2026-11-10",
              hours: "12,5",
            },
          }),
        },
      }).content,
    );
    expect(result).toEqual({
      ok: true,
      responseId: "new-response",
      emailRequested: true,
      emailSent: true,
      emailError: "",
    });
    expect(draft.submit).toHaveBeenCalledOnce();
    expect(mocks.MailApp.sendEmail).toHaveBeenCalledOnce();
    expect(mocks.DriveApp.createFile).not.toHaveBeenCalled();
  });
});
