import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useReducer } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkflowHeader } from "@/components/WorkflowHeader";
import { WorkflowShell } from "@/components/WorkflowShell";
import { useSeliarNavigation } from "@/components/SeliarNavigationProvider";
import { isAdministrator } from "@/lib/private-ui";
import type { PrivateSession } from "@/lib/private-ui";

export type { PrivateSession } from "@/lib/private-ui";

export type AccountHeaderInteraction = {
  expanded: boolean;
  mouseInside: boolean;
  focusInside: boolean;
};

export type AccountHeaderInteractionEvent =
  | { type: "pointer-enter"; pointerType: string; fineHoverCapability?: boolean }
  | { type: "pointer-leave"; pointerType: string }
  | { type: "focus-enter" | "focus-leave" | "toggle" };

export function canExpandAccountHeaderOnPointerHover(
  pointerType: string,
  fineHoverCapability: boolean | undefined,
): boolean {
  return pointerType === "mouse" && fineHoverCapability === true;
}

const initialAccountHeaderInteraction: AccountHeaderInteraction = {
  expanded: false,
  mouseInside: false,
  focusInside: false,
};

export function reduceAccountHeaderInteraction(
  state: AccountHeaderInteraction,
  event: AccountHeaderInteractionEvent,
): AccountHeaderInteraction {
  switch (event.type) {
    case "pointer-enter":
      return canExpandAccountHeaderOnPointerHover(event.pointerType, event.fineHoverCapability)
        ? { ...state, mouseInside: true, expanded: true }
        : state;
    case "pointer-leave": {
      if (event.pointerType !== "mouse") return state;
      const next = { ...state, mouseInside: false };
      if (!next.focusInside) next.expanded = false;
      return next;
    }
    case "focus-enter":
      return { ...state, focusInside: true };
    case "focus-leave": {
      const next = { ...state, focusInside: false };
      if (!next.mouseInside) next.expanded = false;
      return next;
    }
    case "toggle":
      return { ...state, expanded: !state.expanded };
  }
}

export function PrivateAccountShell({
  session,
  children,
}: {
  session: PrivateSession;
  children: ReactNode;
}) {
  const { logout, logoutPending, logoutError } = useSeliarNavigation();
  const [headerInteraction, dispatchHeaderInteraction] = useReducer(
    reduceAccountHeaderInteraction,
    initialAccountHeaderInteraction,
  );
  const headerHandlers = {
    onPointerEnter: (event: React.PointerEvent<HTMLElement>) => {
      const fineHoverCapability =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(hover: hover) and (pointer: fine)").matches;
      dispatchHeaderInteraction({
        type: "pointer-enter",
        pointerType: event.pointerType,
        fineHoverCapability,
      });
    },
    onPointerLeave: (event: React.PointerEvent<HTMLElement>) =>
      dispatchHeaderInteraction({ type: "pointer-leave", pointerType: event.pointerType }),
    onFocusCapture: () => dispatchHeaderInteraction({ type: "focus-enter" }),
    onBlurCapture: (event: React.FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null))
        dispatchHeaderInteraction({ type: "focus-leave" });
    },
  };

  return (
    <WorkflowShell
      header={
        <WorkflowHeader
          eyebrow="SeLIAR · Área privada"
          title="Acceso seguro"
          description="Gestión de cuentas y permisos"
          compactLogo
          accountInteractionHandlers={headerHandlers}
          accountSlot={
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 max-w-[min(42vw,16rem)] gap-1.5 px-2 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:gap-2 sm:px-3"
              aria-label={`Cuenta de ${session.user.name}`}
              aria-expanded={headerInteraction.expanded}
              aria-controls="private-account-details"
              onClick={() => dispatchHeaderInteraction({ type: "toggle" })}
            >
              <span className="truncate">{session.user.name}</span>
              <ChevronDown
                aria-hidden="true"
                className={`size-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${headerInteraction.expanded ? "rotate-180" : ""}`}
              />
            </Button>
          }
          accountDetails={
            <div
              id="private-account-details"
              aria-hidden={!headerInteraction.expanded}
              inert={!headerInteraction.expanded}
              data-expanded={headerInteraction.expanded}
              className={`grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none data-[expanded=true]:grid-rows-[1fr] data-[expanded=true]:opacity-100`}
            >
              <div className="mx-auto w-full max-w-5xl overflow-hidden px-4 sm:px-6">
                <div className="grid gap-2 border-t border-primary-foreground/15 py-3 sm:flex sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-all text-sm text-primary-foreground/80">
                      {session.user.email}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="secondary">Enfermería</Badge>
                      {session.roles.includes("efa") && <Badge>Acceso EFA</Badge>}
                      {isAdministrator(session.roles) && (
                        <Badge variant="outline">Administración</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isAdministrator(session.roles) && (
                      <Button asChild variant="outline" className="min-h-11">
                        <Link to="/admin-usuarios">Administrar cuentas</Link>
                      </Button>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      {logoutError && (
                        <p role="alert" className="max-w-56 text-xs text-destructive">
                          {logoutError}
                        </p>
                      )}
                      <Button
                        onClick={() => void logout()}
                        disabled={logoutPending}
                        variant="secondary"
                        className="min-h-11"
                      >
                        {logoutPending ? "Logging out…" : "Logout"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          }
        />
      }
    >
      <div className="space-y-5">{children}</div>
    </WorkflowShell>
  );
}
