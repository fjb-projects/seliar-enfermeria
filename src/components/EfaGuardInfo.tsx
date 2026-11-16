import { Info } from "lucide-react";
import { formatEpisodeDate } from "@/components/EfaEpisodePanel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Guard scope and persistence notes. Kept out of the page flow: read on demand from the title row. */
export function EfaGuardInfoContent({ startedAt }: { startedAt: Date | string }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="font-medium">
        Guardia propia abierta desde <span className="t-clock">{formatEpisodeDate(startedAt)}</span>
        .
      </p>
      <p className="text-[#c4c8f0]">
        Solo se muestran servicios de la guardia abierta; no es el historial completo.
      </p>
      <p>
        Los servicios activos aparecen primero. Solo se conservan las operaciones enviadas. El texto
        que todavía no enviaste puede perderse.
      </p>
      <div className="space-y-1 border-t border-white/15 pt-3 text-[#c4c8f0]">
        <p className="font-medium text-[#f2f3ff]">Guardado y privacidad</p>
        <p>
          Al enviar una operación, primero se conserva en este dispositivo y después se intenta
          guardar en el servidor. El texto que todavía no enviaste puede perderse.
        </p>
        <p>
          Estos datos privados, incluida la dirección, se almacenan en IndexedDB y pueden ser leídos
          por este sitio en este dispositivo.
        </p>
      </div>
    </div>
  );
}

export function EfaGuardInfo({ startedAt }: { startedAt: Date | string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Información de la guardia y del guardado"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-primary-foreground hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a9b2ff] md:text-[#f2f3ff]"
        >
          <Info aria-hidden="true" className="size-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(26rem,calc(100vw-2rem))] border-white/20 bg-[rgb(12_15_40/.96)] text-[#f2f3ff]"
      >
        <EfaGuardInfoContent startedAt={startedAt} />
      </PopoverContent>
    </Popover>
  );
}
