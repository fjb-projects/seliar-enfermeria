import { describe, expect, it } from "vitest";
import { compensatoryPeriodSchemas } from "./compensatory-period.functions";

const staffId = "e548bb25-3ed4-4db7-8541-c18d721acd0c";
const operationId = "f0c13c70-c529-4dbc-9b3b-f0d3fc6dbcf4";

describe("compensatory period server-function validation", () => {
  it("accepts annual net-only periods and monthly generated/external breakdowns", () => {
    expect(
      compensatoryPeriodSchemas.record.safeParse({
        operationId,
        staffId,
        year: 2025,
        month: null,
        generatedMinutes: null,
        externalTakenMinutes: null,
        annualNetMinutes: 120,
        reason: "Audited annual net",
      }).success,
    ).toBe(true);
    expect(
      compensatoryPeriodSchemas.record.safeParse({
        operationId,
        staffId,
        year: 2026,
        month: 9,
        generatedMinutes: 300,
        externalTakenMinutes: 60,
        annualNetMinutes: null,
        reason: "September close",
      }).success,
    ).toBe(true);
  });

  it("rejects fabricated annual breakdowns, invalid annual years, and malformed monthly data", () => {
    const annual = {
      operationId,
      staffId,
      year: 2025,
      month: null,
      generatedMinutes: null,
      externalTakenMinutes: null,
      annualNetMinutes: 120,
      reason: "Annual close",
    };
    expect(compensatoryPeriodSchemas.record.safeParse({ ...annual, generatedMinutes: 60 }).success).toBe(false);
    expect(compensatoryPeriodSchemas.record.safeParse({ ...annual, year: 2023 }).success).toBe(false);
    expect(
      compensatoryPeriodSchemas.record.safeParse({
        ...annual,
        year: 2026,
        month: 13,
        generatedMinutes: 12,
        externalTakenMinutes: 0,
        annualNetMinutes: null,
      }).success,
    ).toBe(false);
  });

  it("requires an audited operation identity, target staff, period and reason for reversals", () => {
    expect(
      compensatoryPeriodSchemas.reverse.safeParse({
        operationId,
        staffId,
        periodId: "e86c337c-5fed-4c89-a57f-a299465eae1b",
        reason: "Corrected monthly close",
      }).success,
    ).toBe(true);
    expect(
      compensatoryPeriodSchemas.reverse.safeParse({
        operationId,
        staffId,
        periodId: "e86c337c-5fed-4c89-a57f-a299465eae1b",
        reason: " ",
      }).success,
    ).toBe(false);
  });
});
