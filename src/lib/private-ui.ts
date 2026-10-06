import type { AccountRole } from "./access";

export type PrivateReturnPath = "/panel" | "/admin-usuarios";

const privateDestinations = new Set<PrivateReturnPath>(["/panel", "/admin-usuarios"]);

export function safePrivateReturnPath(value: unknown): PrivateReturnPath {
  if (typeof value !== "string") return "/panel";
  return privateDestinations.has(value as PrivateReturnPath)
    ? (value as PrivateReturnPath)
    : "/panel";
}

export function isAdministrator(roles: readonly string[]): boolean {
  return roles.includes("admin");
}

export function accountRoleView(grants: readonly AccountRole[]) {
  const adminGranted = grants.includes("admin");
  const efaGranted = grants.includes("efa");
  return {
    nurseBaseline: true as const,
    adminGranted,
    efaGranted,
    efaEffective: adminGranted || efaGranted,
  };
}

export function rolesForMutation(efaGranted: boolean, adminGranted: boolean): AccountRole[] {
  return [...(efaGranted ? ["efa" as const] : []), ...(adminGranted ? ["admin" as const] : [])];
}
