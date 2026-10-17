import { describe, expect, it } from "vitest";
import {
  accountRoleView,
  isAdministrator,
  rolesForMutation,
  safePrivateReturnPath,
} from "./private-ui";

describe("private navigation and role presentation", () => {
  it("accepts only known same-origin private destinations", () => {
    expect(safePrivateReturnPath("/admin-usuarios")).toBe("/admin-usuarios");
    expect(safePrivateReturnPath("/panel")).toBe("/panel");
    expect(safePrivateReturnPath("/coordinacion-efa")).toBe("/coordinacion-efa");
    for (const path of [
      "https://evil.test",
      "//evil.test",
      "/admin-usuarios?next=//evil.test",
      "\\evil.test",
      "/missing",
    ]) {
      expect(safePrivateReturnPath(path)).toBe("/panel");
    }
  });

  it("shows effective EFA for admins without inventing an explicit EFA grant", () => {
    expect(accountRoleView(["admin"])).toEqual({
      nurseBaseline: true,
      adminGranted: true,
      efaGranted: false,
      efaEffective: true,
    });
    expect(accountRoleView(["efa"])).toEqual({
      nurseBaseline: true,
      adminGranted: false,
      efaGranted: true,
      efaEffective: true,
    });
    expect(isAdministrator(["efa"])).toBe(false);
    expect(isAdministrator(["admin"])).toBe(true);
    expect(rolesForMutation(false, true)).toEqual(["admin"]);
    expect(rolesForMutation(true, true)).toEqual(["efa", "admin"]);
  });
});
