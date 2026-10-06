import { describe, expect, it } from "vitest";
import { accountMutationSchema, resetSchema } from "./accounts.functions";

describe("account mutation input", () => {
  it("requires optimistic versions and rejects unknown privilege fields", () => {
    expect(
      accountMutationSchema.safeParse({ userId: "target", expectedVersion: 2, roles: ["efa"] })
        .success,
    ).toBe(true);
    expect(
      accountMutationSchema.safeParse({ userId: "target", roles: ["admin"], password: "x" })
        .success,
    ).toBe(false);
  });

  it("requires a replacement password within the supported reset policy", () => {
    expect(
      resetSchema.safeParse({
        userId: "target",
        expectedVersion: 2,
        password: "Replacement-Password-2026",
      }).success,
    ).toBe(true);
    expect(
      resetSchema.safeParse({ userId: "target", expectedVersion: 2, password: "short" }).success,
    ).toBe(false);
  });
});
