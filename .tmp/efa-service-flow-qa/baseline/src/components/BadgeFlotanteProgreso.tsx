import { CheckCircle2 } from "lucide-react";

interface BadgeFlotanteProgresoProps {
  completas: number;
  total: number;
  porcentaje: number;
}

export function BadgeFlotanteProgreso({
  completas,
  total,
  porcentaje,
}: BadgeFlotanteProgresoProps) {
  const completo = completas === total;

  return (
    <aside
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl border border-white/10 bg-primary px-4 py-3 text-primary-foreground shadow-[0_8px_30px_oklch(0.2_0.04_200/0.28)] sm:inset-x-4"
      aria-label={`Progreso: ${completas} de ${total} secciones completas`}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs">
            <span className="font-bold uppercase tracking-[0.12em]">
              {completo ? "Registro listo" : "Progreso de guardia"}
            </span>
            <span className="font-semibold text-primary-foreground/75">
              {completas} de {total}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden bg-white/15" aria-hidden>
            <div
              className="h-full bg-[var(--brand-orange)] transition-[width] duration-500"
              style={{ width: `${porcentaje}%` }}
            />
          </div>
        </div>
        {completo && <CheckCircle2 className="size-6 shrink-0 text-[var(--brand-orange)]" />}
      </div>
    </aside>
  );
}
