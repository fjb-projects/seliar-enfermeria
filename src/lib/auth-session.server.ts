import { createSessionLoadError, reportAuthFailure } from "./auth-diagnostics.server";

type AuthSessionSnapshot = {
  user: { id: string; name: string; email: string };
  session: { expiresAt: Date | string };
};

type AccountAccessSnapshot = { isActive: boolean; roles: readonly string[] } | null;

export async function readSessionSnapshot(
  getSession: () => Promise<AuthSessionSnapshot | null | undefined>,
  loadAccess: (userId: string) => Promise<AccountAccessSnapshot>,
) {
  try {
    const current = await getSession();
    if (!current?.user?.id || !current.session?.expiresAt) return null;
    const expiresAt = new Date(current.session.expiresAt);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) return null;
    const access = await loadAccess(current.user.id);
    if (!access?.isActive) return null;
    return {
      user: { id: current.user.id, name: current.user.name, email: current.user.email },
      expiresAt: expiresAt.toISOString(),
      roles: [...access.roles],
    };
  } catch (error) {
    reportAuthFailure(error, "session-read");
    throw createSessionLoadError();
  }
}
