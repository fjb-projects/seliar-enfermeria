import { useId, useState } from "react";
import { ClipboardPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EfaObservationPanel } from "@/components/EfaObservationPanel";
import { useIsMobile } from "@/hooks/use-mobile";

export const GUARD_CONDUCT_TITLE = "Registrar conducta";
export const GUARD_CONDUCT_DESCRIPTION =
  "Sin servicio asociado: problemas u oportunidades de mejora que observes en la guardia.";

export function EfaGuardConductSheetHeader() {
  return (
    <SheetHeader className="pr-8 text-left">
      <SheetTitle>{GUARD_CONDUCT_TITLE}</SheetTitle>
      <SheetDescription>{GUARD_CONDUCT_DESCRIPTION}</SheetDescription>
    </SheetHeader>
  );
}

type GuardConductTarget = {
  /** The current user's open guard; records need an open guard owned by the user. */
  guardId: string;
  currentUserId: string;
  isAdmin: boolean;
  /** Called after the server confirms a record, so callers can refresh cached lists. */
  onSaved?: () => void;
};

/** Observation form locked to the guard context, in a bottom sheet on phones and a side sheet from md. */
export function EfaGuardConductSheet({
  open,
  onOpenChange,
  guardId,
  currentUserId,
  isAdmin,
  onSaved,
}: GuardConductTarget & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const isMobile = useIsMobile();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className="flex max-h-[90dvh] w-full flex-col gap-4 overflow-y-auto p-4 sm:p-6 md:max-h-none md:w-full md:max-w-lg"
      >
        <EfaGuardConductSheetHeader />
        {open && (
          <EfaObservationPanel
            root={{ guardId, ownerUserId: currentUserId, guardEndedAt: null }}
            title="Conductas de la guardia"
            currentUserId={currentUserId}
            canWrite
            isAdmin={isAdmin}
            compact
            lockGuardContext
            prefillObservedAtNow
            {...(onSaved ? { onSaved } : {})}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Trigger plus its sheet; callers render it only for writers with an open own guard. */
export function EfaGuardConductAction({
  appearance,
  label = GUARD_CONDUCT_TITLE,
  ...target
}: GuardConductTarget & { appearance: "button" | "link"; label?: string }) {
  const [open, setOpen] = useState(false);
  const helperId = useId();
  return (
    <>
      {appearance === "button" ? (
        <div className="min-w-0 space-y-1">
          {/* Ghost base with a border: the repo's outline variant carries its own fill. */}
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 w-full border border-input sm:w-auto"
            aria-haspopup="dialog"
            aria-describedby={helperId}
            onClick={() => setOpen(true)}
          >
            <ClipboardPen aria-hidden="true" className="size-4" />
            {label}
          </Button>
          <p id={helperId} className="text-xs text-muted-foreground">
            {GUARD_CONDUCT_DESCRIPTION}
          </p>
        </div>
      ) : (
        <Button
          type="button"
          variant="link"
          className="min-h-11 h-auto px-0 whitespace-normal text-left"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          {label}
        </Button>
      )}
      <EfaGuardConductSheet open={open} onOpenChange={setOpen} {...target} />
    </>
  );
}
