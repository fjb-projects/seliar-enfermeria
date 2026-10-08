import { describe, expect, it } from "vitest";
import {
  mobileArrivalCreateSchema,
  mobileArrivalDeleteSchema,
  mobileArrivalUpdateSchema,
} from "./efa-mobile-arrivals.functions";

const id = "11111111-1111-4111-8111-111111111111";

describe("EFA mobile arrival server inputs", () => {
  it("accepts the nurse, driver, and doctor roles with stable create identities", () => {
    for (const role of ["nurse", "driver", "doctor"]) {
      expect(
        mobileArrivalCreateSchema.safeParse({
          guardId: id,
          baseId: id,
          role,
          clientCreationKey: id,
          operationId: id,
        }).success,
      ).toBe(true);
    }
    expect(
      mobileArrivalCreateSchema.safeParse({
        guardId: id,
        baseId: id,
        role: "paramedic",
        clientCreationKey: id,
        operationId: id,
      }).success,
    ).toBe(false);
  });

  it("validates correction timestamps and optimistic mutation versions", () => {
    expect(
      mobileArrivalCreateSchema.safeParse({
        guardId: id,
        baseId: id,
        role: "doctor",
        clientCreationKey: id,
        operationId: id,
        arrivedAt: "2026-10-07T09:00:00-03:00",
      }).success,
    ).toBe(true);
    const update = { arrivalId: id, expectedVersion: 1, operationId: id };
    expect(
      mobileArrivalUpdateSchema.safeParse({ ...update, arrivedAt: "2026-10-07 09:00" }).success,
    ).toBe(false);
    expect(
      mobileArrivalUpdateSchema.safeParse({ ...update, arrivedAt: "2026-10-07T12:00:00Z" }).success,
    ).toBe(true);
    expect(mobileArrivalDeleteSchema.safeParse({ ...update, expectedVersion: 0 }).success).toBe(
      false,
    );
  });
});
