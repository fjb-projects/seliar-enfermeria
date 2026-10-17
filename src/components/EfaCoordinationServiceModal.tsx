import { useState, type ComponentProps } from "react";
import { EfaEpisodeSummary } from "@/components/EfaEpisodeSummary";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { EfaOversightEpisodeView } from "@/lib/efa-guard-oversight.functions";
import { formatDateTimeMinutes } from "@/lib/efa-labels";

type SummaryEpisode = ComponentProps<typeof EfaEpisodeSummary>["episode"];
type ServiceIdentity = Pick<EfaOversightEpisodeView, "eventAt" | "motive" | "interventionNumber">;

/** Record dates are `Date` on the server and ISO strings once a server function serialized them. */
const toIso = (value: Date | string) => new Date(value).toISOString();
const toIsoOrNull = (value: Date | string | null) => (value === null ? null : toIso(value));

/** Maps an oversight record to what the shared summary expects (ISO strings). */
// eslint-disable-next-line react-refresh/only-export-components -- Pure helper tested beside its UI.
export function toSummaryEpisode(
  episode: Omit<EfaOversightEpisodeView, "dispatches">,
): SummaryEpisode {
  return {
    id: episode.id,
    eventAt: toIso(episode.eventAt),
    motive: episode.motive,
    address: episode.address,
    interventionNumber: episode.interventionNumber,
    state: episode.state,
    closedAt: toIsoOrNull(episode.closedAt),
    cancelledAt: toIsoOrNull(episode.cancelledAt),
    cancelledFromState: episode.cancelledFromState,
    updatedAt: toIso(episode.updatedAt),
  };
}

/** How the service is named in the CTA and the dialog title: moment plus motive or intervention. */
// eslint-disable-next-line react-refresh/only-export-components -- Pure helper tested beside its UI.
export function serviceTitle(episode: ServiceIdentity) {
  const what =
    episode.motive?.trim() ||
    (episode.interventionNumber ? `Intervención ${episode.interventionNumber}` : "") ||
    "Sin motivo registrado";
  return `${formatDateTimeMinutes(episode.eventAt)} · ${what}`;
}

/**
 * Read-only dialog with the complete service history. The summary is a child of the dialog
 * content, so it mounts (and fetches) only while the dialog is open.
 */
export function EfaCoordinationServiceDialog({
  episode,
  ownerName,
  open,
  onOpenChange,
}: {
  episode: Omit<EfaOversightEpisodeView, "dispatches">;
  ownerName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="break-words leading-snug">{serviceTitle(episode)}</DialogTitle>
          <DialogDescription>
            {ownerName ? `Servicio de ${ownerName}. ` : ""}Solo lectura.
          </DialogDescription>
        </DialogHeader>
        <EfaEpisodeSummary episode={toSummaryEpisode(episode)} />
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" className="min-h-11 md:min-h-9">
              Cerrar
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** CTA inside a compact service that opens its full, read-only summary over the current view. */
export function EfaCoordinationServiceModal({
  episode,
  ownerName,
}: {
  episode: Omit<EfaOversightEpisodeView, "dispatches">;
  ownerName?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="-ml-3 min-h-11 px-3 text-sm md:min-h-9"
        aria-label={`Ver servicio completo: ${serviceTitle(episode)}`}
        onClick={() => setOpen(true)}
      >
        Ver servicio completo
      </Button>
      <EfaCoordinationServiceDialog
        episode={episode}
        {...(ownerName ? { ownerName } : {})}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
