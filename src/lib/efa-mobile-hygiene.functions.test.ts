import { describe, expect, it } from "vitest";
import {
  mobileHygieneAvailableSchema,
  mobileHygieneDeleteSchema,
  mobileHygieneRequestSchema,
  mobileHygieneUpdateSchema,
} from "./efa-mobile-hygiene.functions";

const id = "11111111-1111-4111-8111-111111111111";

describe("EFA mobile hygiene server inputs", () => {
  it("accepts a request with stable identities and an optional explicit time", () => {
    const request = { guardId: id, baseId: id, clientCreationKey: id, operationId: id };
    expect(mobileHygieneRequestSchema.safeParse(request).success).toBe(true);
    expect(
      mobileHygieneRequestSchema.safeParse({
        ...request,
        requestedAt: "2026-10-07T09:00:00-03:00",
      }).success,
    ).toBe(true);
    expect(
      mobileHygieneRequestSchema.safeParse({ ...request, requestedAt: "2026-10-07 09:00" }).success,
    ).toBe(false);
    expect(mobileHygieneRequestSchema.safeParse({ ...request, role: "nurse" }).success).toBe(false);
  });

  it("validates optimistic versions and explicit availability times", () => {
    const base = { periodId: id, expectedVersion: 1, operationId: id };
    expect(mobileHygieneAvailableSchema.safeParse(base).success).toBe(true);
    expect(
      mobileHygieneAvailableSchema.safeParse({ ...base, availableAt: "2026-10-07T12:00:00Z" })
        .success,
    ).toBe(true);
    expect(
      mobileHygieneAvailableSchema.safeParse({ ...base, availableAt: "2026-10-07 12:00" }).success,
    ).toBe(false);
    expect(mobileHygieneAvailableSchema.safeParse({ ...base, expectedVersion: 0 }).success).toBe(
      false,
    );
    expect(mobileHygieneDeleteSchema.safeParse({ ...base, expectedVersion: 0 }).success).toBe(
      false,
    );
    expect(mobileHygieneDeleteSchema.safeParse(base).success).toBe(true);
  });

  it("requires both times in an edit, allows an open period and bounds the note", () => {
    const edit = {
      periodId: id,
      expectedVersion: 2,
      operationId: id,
      requestedAt: "2026-10-07T09:00:00Z",
      availableAt: "2026-10-07T09:40:00Z",
    };
    expect(mobileHygieneUpdateSchema.safeParse(edit).success).toBe(true);
    expect(mobileHygieneUpdateSchema.safeParse({ ...edit, availableAt: null }).success).toBe(true);
    expect(mobileHygieneUpdateSchema.safeParse({ ...edit, note: "Falta oxígeno" }).success).toBe(
      true,
    );
    expect(mobileHygieneUpdateSchema.safeParse({ ...edit, note: "x".repeat(301) }).success).toBe(
      false,
    );
    const { availableAt: _omitted, ...withoutAvailable } = edit;
    expect(mobileHygieneUpdateSchema.safeParse(withoutAvailable).success).toBe(false);
  });
});
