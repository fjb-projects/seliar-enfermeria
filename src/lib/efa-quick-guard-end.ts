import type { EfaPanelSummary } from "@/components/EfaPanelHome";
import { formatTimeMinutes } from "@/lib/efa-labels";

export type QuickGuardEndOpenGuard = NonNullable<EfaPanelSummary["openGuard"]>;

/**
 * The guard page has its own "Terminar guardia" button gated by pending arrivals and
 * membership sync (`canClose`). The shell control is hidden there so it never bypasses it.
 */
export const QUICK_GUARD_END_HIDDEN_PATHS: readonly string[] = ["/guardia-efa"];

export function shouldShowQuickGuardEnd({
  openGuard,
  pathname,
}: {
  openGuard: QuickGuardEndOpenGuard | null | undefined;
  pathname: string;
}): boolean {
  return Boolean(openGuard) && !QUICK_GUARD_END_HIDDEN_PATHS.includes(pathname);
}

export function quickGuardEndLabel(startedAt: string): string {
  return `Guardia en curso · ${formatTimeMinutes(startedAt)}`;
}

export function quickGuardEndDescription(startedAt: string): string {
  return `Guardia iniciada a las ${formatTimeMinutes(startedAt)}. Se termina con la hora actual y no admite nuevos registros.`;
}

export function quickGuardEndTargetKey(
  userId: string | null | undefined,
  openGuard: QuickGuardEndOpenGuard | null | undefined,
): string | null {
  return userId && openGuard ? `${userId}:${openGuard.startedAt}` : null;
}

export type QuickGuardEndGuard = {
  id: string;
  ownerUserId: string;
  endedAt: Date | string | null;
  version: number;
};

export function findOwnOpenGuard<T extends QuickGuardEndGuard>(
  guards: readonly T[],
  userId: string,
): T | null {
  return guards.find((guard) => guard.ownerUserId === userId && !guard.endedAt) ?? null;
}

export type QuickGuardEndError = {
  kind: "stale" | "already-ended" | "generic";
  message: string;
};

export function mapQuickGuardEndError(error: unknown): QuickGuardEndError {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("La guardia cambió"))
    return { kind: "stale", message: "La guardia cambió, intentá de nuevo." };
  if (message.includes("ya está terminada"))
    return { kind: "already-ended", message: "La guardia ya estaba terminada." };
  return { kind: "generic", message: "No se pudo terminar la guardia. Inténtalo nuevamente." };
}

export type QuickGuardEndResult =
  | { status: "ended" }
  | { status: "no-open-guard" }
  | { status: "error"; error: QuickGuardEndError };

/**
 * Ends the user's own open guard using a freshly read id and version, so a stale
 * navigation summary never decides which guard or version is ended.
 */
export async function runQuickGuardEnd({
  userId,
  listGuards,
  endGuard,
}: {
  userId: string;
  listGuards: () => Promise<readonly QuickGuardEndGuard[]>;
  endGuard: (input: { guardId: string; expectedVersion: number }) => Promise<unknown>;
}): Promise<QuickGuardEndResult> {
  try {
    const guard = findOwnOpenGuard(await listGuards(), userId);
    if (!guard) return { status: "no-open-guard" };
    await endGuard({ guardId: guard.id, expectedVersion: guard.version });
    return { status: "ended" };
  } catch (error) {
    return { status: "error", error: mapQuickGuardEndError(error) };
  }
}
