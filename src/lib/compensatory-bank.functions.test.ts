import { describe, expect, it } from "vitest";
import { compensatoryBankSchemas } from "./compensatory-bank.functions";

const uuid = "e548bb25-3ed4-4db7-8541-c18d721acd0c";

describe("compensatory bank server-function validation", () => {
  it("rejects unknown keys and requires a reason and expected profile version", () => {
    expect(
      compensatoryBankSchemas.history.safeParse({ staffId: uuid, actorUserId: "spoofed" }).success,
    ).toBe(false);
    expect(
      compensatoryBankSchemas.update.safeParse({
        staffId: uuid,
        name: "Ana",
        isActive: true,
        monthlyLimitMinutes: 1440,
        expectedVersion: 1,
        reason: " ",
        clientOperationId: uuid,
      }).success,
    ).toBe(false);
  });

  it("accepts opening zero but rejects zero credits or debits and malformed dates", () => {
    const common = {
      staffId: uuid,
      minutes: 0,
      reason: "Saldo inicial",
      effectiveDate: "2026-10-27",
      clientOperationId: uuid,
    };
    expect(compensatoryBankSchemas.movement.safeParse({ ...common, kind: "opening" }).success).toBe(
      true,
    );
    expect(compensatoryBankSchemas.movement.safeParse({ ...common, kind: "credit" }).success).toBe(
      false,
    );
    expect(compensatoryBankSchemas.movement.safeParse({ ...common, kind: "debit" }).success).toBe(
      false,
    );
    expect(
      compensatoryBankSchemas.movement.safeParse({
        ...common,
        kind: "opening",
        effectiveDate: "27/10/2026",
      }).success,
    ).toBe(false);
  });

  it("allows omitted or blank optional email and rejects invalid address syntax", () => {
    const base = { dni: "12345678", name: "Ana", clientOperationId: uuid };
    expect(compensatoryBankSchemas.create.safeParse(base).success).toBe(true);
    expect(compensatoryBankSchemas.create.safeParse({ ...base, email: "  " }).success).toBe(true);
    expect(compensatoryBankSchemas.create.safeParse({ ...base, email: "invalid" }).success).toBe(
      false,
    );
  });
});
