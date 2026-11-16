import { describe, expect, it } from "vitest";
import {
  ensureClientOperationId,
  isPastCompensatoryDate,
  isWholeMinuteHours,
  operationIdAfterIntentChange,
  permanentSubmissionRejectionMessage,
} from "./compensatory-public-client";

describe("public submission operation identity", () => {
  it("retains an operation ID for uncertain retries and creates one only when absent", () => {
    expect(ensureClientOperationId("operation-1", () => "operation-2")).toBe("operation-1");
    expect(ensureClientOperationId(null, () => "operation-2")).toBe("operation-2");
  });

  it("invalidates an operation ID only when the request intent changes", () => {
    expect(operationIdAfterIntentChange("operation-1", "2026-10-30", "2026-10-30")).toBe(
      "operation-1",
    );
    expect(operationIdAfterIntentChange("operation-1", "2026-10-30", "2026-10-31")).toBeNull();
  });

  it("rejects past dates and hour values that do not resolve to whole minutes", () => {
    const today = new Date(2026, 9, 30, 12);
    expect(isPastCompensatoryDate("2026-10-29", today)).toBe(true);
    expect(isPastCompensatoryDate("2026-10-30", today)).toBe(false);
    expect(isWholeMinuteHours("0.01")).toBe(false);
    expect(isWholeMinuteHours("0,5")).toBe(true);
    expect(isWholeMinuteHours("1.25")).toBe(true);
  });

  it("distinguishes known permanent validation rejections from uncertain failures", () => {
    expect(
      permanentSubmissionRejectionMessage(
        new Error("La fecha solicitada no puede ser una fecha pasada."),
      ),
    ).toContain("Elegí hoy o una fecha posterior");
    expect(
      permanentSubmissionRejectionMessage(
        new Error("La cantidad de horas debe equivaler a un número entero de minutos."),
      ),
    ).toContain("número entero de minutos");
    expect(permanentSubmissionRejectionMessage(new Error("Connection reset"))).toBeNull();
  });
});
