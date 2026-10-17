import { describe, expect, it } from "vitest";
import { guardServicesSchema } from "./efa-guard-oversight.functions";

describe("EFA guard oversight function inputs", () => {
  it("requires exactly one guard UUID to list a guard's services", () => {
    const guardId = "6bbf07e3-40c2-41ea-b6d4-b315f7822e9a";
    expect(guardServicesSchema.safeParse({ guardId }).success).toBe(true);
    expect(guardServicesSchema.safeParse({ guardId: "guard-1" }).success).toBe(false);
    expect(guardServicesSchema.safeParse({}).success).toBe(false);
    expect(guardServicesSchema.safeParse({ guardId, ownerUserId: "user-a" }).success).toBe(false);
  });
});
