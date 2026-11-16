import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { listCompensatoryStaff } from "@/lib/compensatory-bank.functions";
import { listCompensatoryPeriods } from "@/lib/compensatory-period.functions";
import {
  compensatoryMonthNames,
  exportMonths,
  loadCompensatoryExport,
} from "@/lib/compensatory-export";

export function CompensatoryExportPanel({
  serviceDay,
  onBusyChange,
}: {
  serviceDay: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const currentYear = Number(serviceDay.slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const [mode, setMode] = useState<"to-date" | "selected">("to-date");
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);

  async function download() {
    if (pending.current) return;
    setError("");
    setNotice("");
    let months: number[];
    try {
      months = exportMonths(year, mode, selected, serviceDay);
    } catch (cause) {
      setError((cause as Error).message);
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      const report = await loadCompensatoryExport(year, months, {
        listStaff: listCompensatoryStaff,
        listPeriods: listCompensatoryPeriods,
      });
      const { createCompensatoryWorkbook } = await import("@/lib/compensatory-export-xlsx");
      const buffer = await createCompensatoryWorkbook(report);
      if (!mounted.current) return;
      const url = URL.createObjectURL(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `compensatorios-netos-${year}${months.length ? `-meses-${months.map((month) => String(month).padStart(2, "0")).join("-")}` : "-anual"}.xlsx`;
      document.body.appendChild(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setNotice(
        `Archivo preparado: ${report.rows.length} agentes.${report.warnings.length ? " Hay consumos sin liquidar; revisa las notas al final de la planilla." : ""}`,
      );
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudo generar el archivo. Inténtalo nuevamente.",
        );
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div className="space-y-4 text-sm" aria-busy={busy}>
      <p>Todos los agentes · horas netas por período y total de los meses incluidos.</p>
      <div className="grid gap-1">
        <label className="font-medium" htmlFor="compensatory-export-year">
          Año
        </label>
        <select
          id="compensatory-export-year"
          className="min-h-11 rounded-md border bg-background px-3 font-normal"
          value={year}
          disabled={busy}
          onChange={(event) => {
            setYear(Number(event.target.value));
            setError("");
            setNotice("");
          }}
        >
          {Array.from({ length: currentYear - 2024 + 1 }, (_, index) => 2024 + index).map(
            (value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ),
          )}
        </select>
      </div>
      {year < 2026 ? (
        <p>2024 y 2025 se exportan como saldo neto anual, sin inventar un detalle mensual.</p>
      ) : (
        <>
          <fieldset disabled={busy} className="space-y-1">
            <legend className="mb-1 font-medium">Período a exportar</legend>
            <label className="flex min-h-11 cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="compensatory-export-mode"
                checked={mode === "to-date"}
                onChange={() => setMode("to-date")}
              />
              Extracto anual hasta el momento
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="compensatory-export-mode"
                checked={mode === "selected"}
                onChange={() => setMode("selected")}
              />
              Seleccionar meses
            </label>
          </fieldset>
          {mode === "selected" && (
            <fieldset disabled={busy} className="grid grid-cols-2 gap-x-3 sm:grid-cols-3">
              <legend className="mb-1 font-medium">Meses</legend>
              {compensatoryMonthNames.map((name, index) => (
                <label key={name} className="flex min-h-11 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.includes(index + 1)}
                    onChange={(event) =>
                      setSelected((previous) =>
                        event.target.checked
                          ? [...previous, index + 1]
                          : previous.filter((month) => month !== index + 1),
                      )
                    }
                  />
                  {name}
                </label>
              ))}
            </fieldset>
          )}
        </>
      )}
      <p className="text-muted-foreground">
        Los meses sin liquidación quedan vacíos, no en cero. El total suma los períodos con datos y
        no representa el saldo acumulado del banco. Las notas del archivo indican consumos sin
        liquidar.
      </p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <Button
        type="button"
        className="min-h-11 w-full"
        disabled={busy}
        onClick={() => void download()}
      >
        {busy ? "Preparando archivo…" : "Descargar Excel (.xlsx)"}
      </Button>
    </div>
  );
}
