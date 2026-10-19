import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { EfaActionConfirmation } from "@/components/EfaActionConfirmation";
import { endEfaGuard, listEfaGuards } from "@/lib/efa-guards.functions";
import { formatTimeMinutes } from "@/lib/efa-labels";
import {
  quickGuardEndDescription,
  quickGuardEndLabel,
  quickGuardEndTargetKey,
  runQuickGuardEnd,
  shouldShowQuickGuardEnd,
  type QuickGuardEndGuard,
  type QuickGuardEndOpenGuard,
  type QuickGuardEndResult,
} from "@/lib/efa-quick-guard-end";

/** Toasts from the navigation shell go to their own Toaster so page Toasters do not duplicate them. */
export const SHELL_TOASTER_ID = "seliar-shell";

export type QuickGuardEndController = {
  /** True when the shell should show the open-guard strip on the current route. */
  visible: boolean;
  openGuard: QuickGuardEndOpenGuard | null;
  pending: boolean;
  confirmTarget: string | null;
  currentTarget: string | null;
  requestEnd: () => void;
  cancel: () => void;
  confirm: () => void;
  /** Ends the open guard. Resolves to null when there is no user or an end is already running. */
  end: (options?: { notify?: boolean }) => Promise<QuickGuardEndResult | null>;
};

export function useQuickGuardEnd({
  userId,
  openGuard,
  pathname,
}: {
  userId: string | null;
  openGuard: QuickGuardEndOpenGuard | null;
  pathname: string;
}): QuickGuardEndController {
  const queryClient = useQueryClient();
  const router = useRouter();
  const listGuards = useServerFn(listEfaGuards);
  const endGuard = useServerFn(endEfaGuard);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const currentTarget = quickGuardEndTargetKey(userId, openGuard);

  const end = useCallback(
    async ({ notify = true }: { notify?: boolean } = {}) => {
      if (!userId || pendingRef.current) return null;
      pendingRef.current = true;
      setPending(true);
      try {
        const result = await runQuickGuardEnd({
          userId,
          listGuards: async () => (await listGuards()) as QuickGuardEndGuard[],
          endGuard: (input) => endGuard({ data: input }),
        });
        await queryClient.invalidateQueries({ queryKey: ["efa-panel-summary"] });
        if (notify) {
          void router.invalidate();
          if (result.status === "ended")
            toast.success("La guardia terminó manualmente.", { toasterId: SHELL_TOASTER_ID });
          else if (result.status === "no-open-guard")
            toast("No tenés una guardia abierta.", { toasterId: SHELL_TOASTER_ID });
          else toast.error(result.error.message, { toasterId: SHELL_TOASTER_ID });
        }
        return result;
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    },
    [endGuard, listGuards, queryClient, router, userId],
  );

  const requestEnd = useCallback(() => {
    if (!pendingRef.current) setConfirmTarget(currentTarget);
  }, [currentTarget]);
  const cancel = useCallback(() => setConfirmTarget(null), []);
  const confirm = useCallback(() => {
    setConfirmTarget(null);
    void end();
  }, [end]);

  const visible = shouldShowQuickGuardEnd({ openGuard, pathname });
  return useMemo(
    () => ({
      visible,
      openGuard,
      pending,
      confirmTarget,
      currentTarget,
      requestEnd,
      cancel,
      confirm,
      end,
    }),
    [cancel, confirm, confirmTarget, currentTarget, end, openGuard, pending, requestEnd, visible],
  );
}

function OpenGuardDot() {
  return (
    <span
      aria-hidden="true"
      className="size-2 shrink-0 rounded-full bg-emerald-600 motion-safe:animate-pulse"
    />
  );
}

function EndButton({
  controller,
  className,
}: {
  controller: QuickGuardEndController;
  className: string;
}) {
  const startedAt = controller.openGuard?.startedAt;
  return (
    <button
      type="button"
      aria-label={`Terminar la guardia iniciada a las ${formatTimeMinutes(startedAt)}`}
      disabled={controller.pending}
      onClick={controller.requestEnd}
      className={`rounded-md border border-destructive/40 px-1 text-xs font-bold text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${className}`}
    >
      {controller.pending ? "Terminando…" : "Terminar"}
    </button>
  );
}

/** Thin row rendered inside the mobile bottom nav, above its buttons. */
export function EfaQuickGuardEndStrip({ controller }: { controller: QuickGuardEndController }) {
  if (!controller.visible || !controller.openGuard) return null;
  return (
    <div
      data-testid="quick-guard-end-strip"
      className="mx-auto flex max-w-lg items-center justify-between gap-2 border-b border-border/70 px-3 py-1"
    >
      <p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-foreground">
        <OpenGuardDot />
        <span className="truncate">{quickGuardEndLabel(controller.openGuard.startedAt)}</span>
      </p>
      <EndButton controller={controller} className="min-h-10 shrink-0" />
    </div>
  );
}

/** Compact element rendered in the desktop top nav, next to the account menu. */
export function EfaQuickGuardEndDesktop({ controller }: { controller: QuickGuardEndController }) {
  if (!controller.visible || !controller.openGuard) return null;
  return (
    <div
      data-testid="quick-guard-end-desktop"
      className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg border border-border bg-muted/60 py-1 pl-3 pr-1 text-xs font-semibold text-foreground"
    >
      <OpenGuardDot />
      <span className="truncate">{quickGuardEndLabel(controller.openGuard.startedAt)}</span>
      <EndButton controller={controller} className="min-h-9 shrink-0" />
    </div>
  );
}

/** Reserves page space for the strip so the taller mobile nav never covers the page end. */
export function EfaQuickGuardEndSpacer({ controller }: { controller: QuickGuardEndController }) {
  if (!controller.visible) return null;
  return <div aria-hidden="true" className="h-12 md:hidden" />;
}

export function EfaQuickGuardEndConfirmation({
  controller,
}: {
  controller: QuickGuardEndController;
}) {
  const { cancel } = controller;
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) cancel();
    },
    [cancel],
  );
  return (
    <EfaActionConfirmation
      open={controller.confirmTarget !== null}
      onOpenChange={onOpenChange}
      capturedTargetKey={controller.confirmTarget}
      currentTargetKey={controller.currentTarget}
      title="Terminar guardia"
      description={
        controller.openGuard ? quickGuardEndDescription(controller.openGuard.startedAt) : ""
      }
      confirmLabel="Terminar guardia"
      onConfirm={controller.confirm}
    />
  );
}
