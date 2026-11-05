import { describe, expect, it } from "vitest";
import { baseIdSchema, baseNameSchema, baseMutationSchema } from "./efa-bases.functions";

describe("EFA base function inputs", () => {
  it("accepts bounded base names and rejects blank or oversized values", () => {
    expect(baseNameSchema.safeParse("Central Norte").success).toBe(true);
    expect(baseNameSchema.safeParse("   ").success).toBe(false);
    expect(baseNameSchema.safeParse("x".repeat(121)).success).toBe(false);
  });

  it("requires UUID identity and an optimistic version for edits", () => {
    const input = {
      baseId: "6bbf07e3-40c2-41ea-b6d4-b315f7822e9a",
      expectedVersion: 1,
      name: "Central",
    };
    expect(baseIdSchema.safeParse(input.baseId).success).toBe(true);
    expect(baseMutationSchema.safeParse(input).success).toBe(true);
    expect(baseMutationSchema.safeParse({ ...input, expectedVersion: 0 }).success).toBe(false);
    expect(baseMutationSchema.safeParse({ ...input, admin: true }).success).toBe(false);
  });
});
