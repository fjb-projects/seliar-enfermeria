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

  it("accepts nullable directory fields on create and update while keeping limits", () => {
    const create = {
      dni: "12345678",
      name: "Ana",
      clientOperationId: uuid,
      registrationNumber: "REG-42",
      employmentStatus: null,
      jobRole: " ",
      region: "Norte",
      contactPhone: null,
      workplace: "Sala A",
      operationalStatus: "Activa",
      operationalRole: "Coordinación",
    };
    const created = compensatoryBankSchemas.create.safeParse(create);
    expect(created.success).toBe(true);
    if (created.success) {
      expect(created.data.jobRole).toBeNull();
      expect(created.data.registrationNumber).toBe("REG-42");
    }
    expect(
      compensatoryBankSchemas.update.safeParse({
        staffId: uuid,
        name: "Ana",
        isActive: true,
        monthlyLimitMinutes: 1440,
        expectedVersion: 1,
        reason: "Ficha",
        clientOperationId: uuid,
        region: null,
      }).success,
    ).toBe(true);
    expect(
      compensatoryBankSchemas.create.safeParse({ ...create, region: "x".repeat(301) }).success,
    ).toBe(false);
  });
});
