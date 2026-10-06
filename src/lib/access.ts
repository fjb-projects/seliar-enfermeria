export type AccountRole = "efa" | "admin";
export type AccessSession = {
  userId: string;
  expiresAt: Date;
  isActive: boolean;
  roles: readonly AccountRole[];
};

export function effectiveRoles(grants: readonly AccountRole[]): AccountRole[] {
  const roles = new Set(grants);
  if (roles.has("admin")) roles.add("efa");
  return (["efa", "admin"] as AccountRole[]).filter((role) => roles.has(role));
}

export function requireActiveSession(
  session: AccessSession | null,
  now = new Date(),
): AccessSession {
  if (!session) throw new Error("No hay una sesión activa");
  if (session.expiresAt.getTime() <= now.getTime()) throw new Error("La sesión expiró");
  if (!session.isActive) throw new Error("La cuenta está desactivada");
  return session;
}

export function requireEfa(session: AccessSession | null, now = new Date()): AccessSession {
  const active = requireActiveSession(session, now);
  if (!effectiveRoles(active.roles).includes("efa")) throw new Error("Se requiere acceso EFA");
  return active;
}

export function requireAdministrator(
  session: AccessSession | null,
  now = new Date(),
): AccessSession {
  const active = requireActiveSession(session, now);
  if (!active.roles.includes("admin")) throw new Error("Se requiere administración");
  return active;
}
