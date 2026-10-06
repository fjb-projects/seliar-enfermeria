import { describe, expect, it } from "vitest";
import {
  guardIdSchema,
  guardStartSchema,
  guardBasesSchema,
  guardEndSchema,
} from "./efa-guards.functions";

describe("EFA guard function inputs", () => {
  it("requires a declared Central presence without accepting location coordinates", () => {
    expect(guardStartSchema.safeParse({ declaredAtCentral: true }).success).toBe(true);
    expect(guardStartSchema.safeParse({ declaredAtCentral: false }).success).toBe(false);
    expect(guardStartSchema.safeParse({ declaredAtCentral: true, latitude: 1 }).success).toBe(
      false,
    );
  });

  it("requires a UUID and optimistic version for ending and temporal base changes", () => {
    const guardId = "6bbf07e3-40c2-41ea-b6d4-b315f7822e9a";
    expect(guardIdSchema.safeParse(guardId).success).toBe(true);
    expect(guardEndSchema.safeParse({ guardId, expectedVersion: 1 }).success).toBe(true);
    expect(
      guardBasesSchema.safeParse({ guardId, expectedVersion: 1, baseIds: [guardId] }).success,
    ).toBe(true);
    expect(guardBasesSchema.safeParse({ guardId, expectedVersion: 1, baseIds: [] }).success).toBe(
      false,
    );
    expect(guardEndSchema.safeParse({ guardId, expectedVersion: 0 }).success).toBe(false);
  });
});
