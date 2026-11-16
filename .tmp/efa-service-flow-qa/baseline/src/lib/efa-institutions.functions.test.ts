import { describe, expect, it } from "vitest";
import {
  institutionActiveSchema,
  institutionIdSchema,
  institutionMutationSchema,
  institutionNameSchema,
} from "./efa-institutions.functions";

describe("institution server-function validation", () => {
  it("accepts bounded names and UUID identifiers while rejecting extra fields", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(institutionNameSchema.parse(" Hospital Central ")).toBe("Hospital Central");
    expect(institutionIdSchema.parse(id)).toBe(id);
    expect(
      institutionMutationSchema.parse({
        institutionId: id,
        expectedVersion: 2,
        name: "Hospital Sur",
      }),
    ).toEqual({ institutionId: id, expectedVersion: 2, name: "Hospital Sur" });
    expect(
      institutionMutationSchema.safeParse({
        institutionId: id,
        expectedVersion: 2,
        name: "Hospital Sur",
        isActive: true,
      }).success,
    ).toBe(false);
    expect(
      institutionActiveSchema.safeParse({ institutionId: id, expectedVersion: 2, isActive: false })
        .success,
    ).toBe(true);
    expect(institutionNameSchema.safeParse("  ").success).toBe(false);
    expect(institutionNameSchema.safeParse("x".repeat(121)).success).toBe(false);
  });
});
