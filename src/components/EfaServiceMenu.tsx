import { useState } from "react";
import { History, MoreHorizontal, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type ServiceMenuAction = {
  label: string;
  ariaLabel?: string;
  disabled: boolean;
  onSelect: () => void;
};

export type EfaServiceMenuProps = {
  /** Already formatted for display. */
  capturedAt: string;
  updatedAt: string;
  version: number;
  history: Omit<ServiceMenuAction, "label" | "ariaLabel">;
  /** Cancel or reactivate, only when the user can manage the service. */
  cancellation?: ServiceMenuAction & { destructive: boolean };
  edit?: Omit<ServiceMenuAction, "label" | "ariaLabel">;
};

/** Record details and the secondary actions of a service, out of the main work container. */
export function EfaServiceMenuContent({
  capturedAt,
  updatedAt,
  version,
  history,
  cancellation,
  edit,
  onDone,
}: EfaServiceMenuProps & { onDone?: () => void }) {
  const run = (action: () => void) => () => {
    action();
    onDone?.();
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-[#c4c8f0]">
        Capturado {capturedAt} · actualizado {updatedAt} · versión {version}
      </p>
      <div className="flex flex-col gap-1">
        <Button
          variant="ghost"
          className="min-h-11 justify-start px-3"
          disabled={history.disabled}
          onClick={run(history.onSelect)}
        >
          <History aria-hidden="true" className="size-4" />
          Ver historial
        </Button>
        {cancellation && (
          <Button
            variant="ghost"
            className={`min-h-11 justify-start px-3 ${cancellation.destructive ? "text-destructive" : ""}`}
            disabled={cancellation.disabled}
            {...(cancellation.ariaLabel ? { "aria-label": cancellation.ariaLabel } : {})}
            onClick={run(cancellation.onSelect)}
          >
            {cancellation.label}
          </Button>
        )}
        {edit && (
          <Button
            variant="ghost"
            className="min-h-11 justify-start px-3"
            disabled={edit.disabled}
            onClick={run(edit.onSelect)}
          >
            <Pencil aria-hidden="true" className="size-4" />
            Editar
          </Button>
        )}
      </div>
    </div>
  );
}

export function EfaServiceMenu(props: EfaServiceMenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 min-w-11 shrink-0 px-2"
          aria-label="Más acciones y detalles del servicio"
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(20rem,calc(100vw-2rem))] border-white/20 bg-[rgb(12_15_40/.96)] p-3 text-[#f2f3ff]"
      >
        <EfaServiceMenuContent {...props} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
