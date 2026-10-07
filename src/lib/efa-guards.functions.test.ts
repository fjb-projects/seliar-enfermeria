import { describe, expect, it } from "vitest";
import {
  guardIdSchema,
  guardStartSchema,
  guardBasesSchema,
  guardEndSchema,
  getEfaGuardRouteAccess,
  requireGuardReadAccess,
} from "./efa-guards.functions";

describe("EFA guard function inputs", () => {
  it("keeps the route read-only for active accounts without EFA and avoids base-catalog access", () => {
    expect(getEfaGuardRouteAccess([])).toEqual({ canWrite: false, isAdmin: false });
    expect(getEfaGuardRouteAccess(["efa"])).toEqual({ canWrite: true, isAdmin: false });
    expect(getEfaGuardRouteAccess(["admin"])).toEqual({ canWrite: true, isAdmin: true });
  });

  it("allows own-history read access for an active account without EFA, but not an inactive account", () => {
    const session = {
      userId: "revoked-user",
      expiresAt: new Date(Date.now() + 60_000),
      isActive: true,
      roles: [],
    } as const;
    expect(requireGuardReadAccess(session)).toBe(session);
    expect(() => requireGuardReadAccess({ ...session, isActive: false })).toThrow(/desactivada/i);
    expect(() => requireGuardReadAccess({ ...session, expiresAt: new Date(0) })).toThrow(/expiró/i);
  });

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
