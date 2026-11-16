import type { ReactNode } from "react";
import { ArrowRight, Check, ChevronDown, CircleDashed, TriangleAlert } from "lucide-react";

export type EstadoSeccion = "completa" | "incompleta" | "vacia";

interface Props {
  id: string;
  numero: number;
  titulo: string;
  estado: EstadoSeccion;
  resumen?: string;
  faltantes: string[];
  abierta: boolean;
  onAlternar: () => void;
  onCerrar: () => void;
  children: ReactNode;
}

const estilos: Record<
  EstadoSeccion,
  { borde: string; fondo: string; estado: string; etiqueta: string }
> = {
  completa: {
    borde: "border-l-[var(--success)]",
    fondo: "bg-[color-mix(in_oklch,var(--success)_8%,var(--card))]",
    estado: "bg-[color-mix(in_oklch,var(--success)_12%,transparent)] text-[var(--success)]",
    etiqueta: "Completa",
  },
  incompleta: {
    borde: "border-l-warning",
    fondo: "bg-[color-mix(in_oklch,var(--warning)_10%,var(--card))]",
    estado: "bg-warning-soft text-warning-foreground",
    etiqueta: "Pendiente",
  },
  vacia: {
    borde: "border-l-border",
    fondo: "bg-muted/50",
    estado: "bg-muted text-muted-foreground",
    etiqueta: "Sin iniciar",
  },
};

export function SeccionDesplegable({
  id,
  numero,
  titulo,
  estado,
  resumen,
  faltantes,
  abierta,
  onAlternar,
  onCerrar,
  children,
}: Props) {
  return (
    <section
      className={`overflow-hidden rounded-[6px] border border-l-4 shadow-[0_2px_10px_oklch(0.27_0.035_202/0.06)] transition-colors ${estilos[estado].borde} ${estilos[estado].fondo}`}
    >
      <h2>
        <button
          type="button"
          id={`${id}-boton`}
          onClick={onAlternar}
          aria-expanded={abierta}
          aria-controls={`${id}-panel`}
          className={`grid w-full grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-left transition-colors sm:px-4 ${abierta ? "bg-primary text-primary-foreground" : "hover:bg-muted/60"}`}
        >
          <span
            className={`flex h-11 items-center justify-center rounded-[3px] border font-display text-lg font-bold ${abierta ? "border-white/20 bg-white/10 text-white" : "border-border bg-muted text-primary"}`}
          >
            {String(numero).padStart(2, "0")}
          </span>
          <span className="min-w-0">
            <span
              className={`block font-display text-[15px] font-semibold leading-snug ${abierta ? "text-primary-foreground" : "text-foreground"}`}
            >
              {titulo}
            </span>
            {resumen && (
              <span
                className={`mt-0.5 block text-xs ${abierta ? "text-primary-foreground/70" : "text-muted-foreground"}`}
              >
                {resumen}
              </span>
            )}
          </span>
          <span className="flex items-center gap-2">
            {!abierta && (
              <span
                className={`hidden rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide sm:inline ${estilos[estado].estado}`}
              >
                {estilos[estado].etiqueta}
              </span>
            )}
            {estado === "completa" && !abierta ? (
              <Check className="size-5 text-[var(--success)]" aria-hidden />
            ) : estado === "incompleta" && !abierta ? (
              <TriangleAlert className="size-5 text-warning" aria-hidden />
            ) : estado === "vacia" && !abierta ? (
              <CircleDashed className="size-5 text-muted-foreground" aria-hidden />
            ) : null}
            <ChevronDown
              className={`size-5 shrink-0 transition-transform ${abierta ? "rotate-180 text-primary-foreground/70" : "text-muted-foreground"}`}
              aria-hidden
            />
          </span>
        </button>
      </h2>

      {abierta && (
        <div
          id={`${id}-panel`}
          role="region"
          aria-labelledby={`${id}-boton`}
          className="border-t border-border px-4 py-5 sm:px-5"
        >
          {children}

          {faltantes.length > 0 && (
            <div className="mt-5 border-l-4 border-warning bg-warning-soft px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
                Todavía falta completar
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {faltantes.join(" · ")}
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={onCerrar}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Guardar y continuar
            <ArrowRight className="size-4" aria-hidden />
          </button>
        </div>
      )}

      {!abierta && faltantes.length > 0 && estado === "incompleta" && (
        <p className="border-t border-warning/40 bg-warning-soft px-4 py-2.5 text-xs leading-relaxed text-warning-foreground">
          Falta: {faltantes.join(" · ")}
        </p>
      )}
    </section>
  );
}
