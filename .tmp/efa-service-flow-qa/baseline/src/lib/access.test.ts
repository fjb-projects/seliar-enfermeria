import { describe, expect, it } from "vitest";
import { effectiveRoles, requireActiveSession, requireAdministrator, requireEfa } from "./access";

describe("server access policy", () => {
  it("preserves explicit EFA when administration is removed and makes admins EFA", () => {
    expect(effectiveRoles(["admin"])).toEqual(["efa", "admin"]);
    expect(effectiveRoles(["efa"])).toEqual(["efa"]);
    expect(effectiveRoles([])).toEqual([]);
  });

  it.each<[import("./access").AccessSession | null, string]>([
    [null, "No hay una sesión activa"],
    [
      { userId: "u1", expiresAt: new Date("2020-01-01"), isActive: true, roles: ["admin"] },
      "La sesión expiró",
    ],
    [
      { userId: "u1", expiresAt: new Date("2030-01-01"), isActive: false, roles: ["admin"] },
      "La cuenta está desactivada",
    ],
  ])("rejects inactive, expired, or absent sessions", (session, message) => {
    expect(() => requireActiveSession(session, new Date("2026-01-01"))).toThrow(message);
  });

  it("requires current EFA/admin grants rather than a client role snapshot", () => {
    const session = {
      userId: "u1",
      expiresAt: new Date("2030-01-01"),
      isActive: true,
      roles: ["efa"] as const,
    };
    expect(() => requireEfa(session, new Date("2026-01-01"))).not.toThrow();
    expect(() => requireAdministrator(session, new Date("2026-01-01"))).toThrow(
      "Se requiere administración",
    );
  });
});
