import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDatabase } from "../db/index.server";
import { accountAccess, accountRoleGrant, session as sessionTable } from "../db/schema";
import {
  effectiveRoles,
  requireActiveSession,
  type AccessSession,
  type AccountRole,
} from "./access";
import { getAuth, isAccountActive } from "./auth.server";
import { readSessionSnapshot } from "./auth-session.server";
import { createSessionLoadError, reportAuthFailure } from "./auth-diagnostics.server";

const signInSchema = z
  .object({ email: z.string().trim().email().max(255), password: z.string().min(1).max(1024) })
  .strict();

export function publicSession(value: {
  user: { id: string; name: string; email: string };
  session: { expiresAt: Date | string };
}) {
  return {
    user: { id: value.user.id, name: value.user.name, email: value.user.email },
    expiresAt: new Date(value.session.expiresAt).toISOString(),
  };
}

export const signIn = createServerFn({ method: "POST" })
  .validator((data: unknown) => signInSchema.parse(data))
  .handler(async ({ data }) => {
    const auth = getAuth();
    try {
      const result = await auth.api.signInEmail({ body: data });
      if (!result?.user?.id || !(await isAccountActive(result.user.id))) {
        if (result?.user?.id)
          await getDatabase().delete(sessionTable).where(eq(sessionTable.userId, result.user.id));
        throw new Error("signin-rejected");
      }
      const persisted = await getDatabase()
        .select({ expiresAt: sessionTable.expiresAt })
        .from(sessionTable)
        .where(eq(sessionTable.userId, result.user.id))
        .orderBy(desc(sessionTable.createdAt))
        .limit(1);
      if (!persisted[0]) throw new Error("signin-rejected");
      return {
        ok: true as const,
        session: publicSession({ user: result.user, session: persisted[0] }),
      };
    } catch {
      throw new Error("Correo o contraseña incorrectos, o cuenta inactiva");
    }
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const { getRequest } = await import("@tanstack/react-start/server");
  await getAuth().api.signOut({ headers: getRequest().headers });
  return { ok: true as const };
});

export const currentAccessSession = createServerOnlyFn(async (): Promise<AccessSession | null> => {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const current = await getAuth().api.getSession({ headers: getRequest().headers });
    if (!current?.user?.id || !current.session?.expiresAt) return null;
    return await loadAccessSession(current.user.id, new Date(current.session.expiresAt));
  } catch (error) {
    reportAuthFailure(error, "access-session-read");
    throw createSessionLoadError();
  }
});

async function loadAccountAccess(userId: string) {
  const db = getDatabase();
  const rows = await db
    .select({ isActive: accountAccess.isActive, role: accountRoleGrant.role })
    .from(accountAccess)
    .leftJoin(accountRoleGrant, eq(accountRoleGrant.userId, accountAccess.userId))
    .where(eq(accountAccess.userId, userId));
  if (!rows.length) return null;
  const grants = rows.flatMap((row) => (row.role ? [row.role as AccountRole] : []));
  return {
    isActive: rows[0]!.isActive,
    roles: effectiveRoles(grants),
  };
}

async function loadAccessSession(userId: string, expiresAt: Date): Promise<AccessSession | null> {
  const access = await loadAccountAccess(userId);
  return access ? { userId, expiresAt, ...access } : null;
}

export const readSession = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequest } = await import("@tanstack/react-start/server");
  const headers = getRequest().headers;
  return readSessionSnapshot(() => getAuth().api.getSession({ headers }), loadAccountAccess);
});
