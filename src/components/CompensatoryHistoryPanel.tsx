import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getCompensatoryHistory,
  reverseCompensatoryMovement,
  type LedgerView,
  type StaffAuditView,
  type StaffView,
} from "@/lib/compensatory-bank.functions";
import {
  listCompensatoryPeriods,
  reverseCompensatoryPeriod,
} from "@/lib/compensatory-period.functions";
import {
  canReverseCompensatoryHistoryMovement,
  buildCompensatoryHistoryCsv,
  buildCompensatoryHistoryRows,
  compensatoryRequestActionLabel,
  type CompensatoryHistoryRequest,
} from "@/lib/compensatory-history-view";
import type { CompensatoryPeriod } from "@/lib/compensatory-period.functions";

type HistoryApi = {
  getHistory: typeof getCompensatoryHistory;
  listPeriods: typeof listCompensatoryPeriods;
  reversePeriod: typeof reverseCompensatoryPeriod;
  reverseMovement: typeof reverseCompensatoryMovement;
};

const defaultApi: HistoryApi = {
  getHistory: getCompensatoryHistory,
  listPeriods: listCompensatoryPeriods,
  reversePeriod: reverseCompensatoryPeriod,
  reverseMovement: reverseCompensatoryMovement,
};

export type CompensatoryHistoryPanelRequest = CompensatoryHistoryRequest;

export async function refreshParentAfterConfirmedWrite(onSaved?: () => void | Promise<void>) {
  try {
    await onSaved?.();
    return true;
  } catch {
    return false;
  }
}

function operationId() {
  return globalThis.crypto.randomUUID();
}

function today() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values["year"]}-${values["month"]}-${values["day"]}`;
}

function minutesLabel(minutes: number | null) {
  if (minutes === null) return "Sin efecto contable";
  const sign = minutes < 0 ? "−" : "";
  const absolute = Math.abs(minutes);
  return `${sign}${Math.floor(absolute / 60)} h${absolute % 60 ? ` ${absolute % 60} min` : ""}`;
}

function errorMessage(cause: unknown) {
  return cause instanceof Error && cause.message.trim()
    ? cause.message
    : "No se pudo cargar el historial. Inténtalo nuevamente.";
}

function downloadCsv(csv: string, staffName: string) {
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `historial-horas-${staffName.trim().replace(/[^\p{L}\p{N}-]+/gu, "-")}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function CompensatoryHistoryPanel({
  staff,
  requests = [],
  serviceDay,
  api: overrides,
  onSaved,
  onBusyChange,
  onOpenRequest,
}: {
  staff: StaffView;
  requests?: readonly CompensatoryHistoryPanelRequest[];
  serviceDay?: string | undefined;
  api?: Partial<HistoryApi>;
  onSaved?: () => void | Promise<void>;
  onBusyChange?: (busy: boolean) => void;
  onOpenRequest?: (requestId: string) => void;
}) {
  const api = useMemo(() => ({ ...defaultApi, ...overrides }), [overrides]);
  const [entries, setEntries] = useState<LedgerView[]>([]);
  const [periods, setPeriods] = useState<CompensatoryPeriod[]>([]);
  const [audits, setAudits] = useState<StaffAuditView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [year, setYear] = useState("all");
  const [kind, setKind] = useState("all");
  const [reversingId, setReversingId] = useState("");
  const [reason, setReason] = useState("");
  const [reversingMovementId, setReversingMovementId] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [movementDate, setMovementDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const requestSequence = useRef(0);
  const pendingReversal = useRef<{ fingerprint: string; id: string } | null>(null);
  const pendingMovementReversal = useRef<{ fingerprint: string; id: string } | null>(null);

  useEffect(() => {
    onBusyChange?.(saving || uncertain);
  }, [saving, uncertain, onBusyChange]);

  useEffect(() => {
    const sequence = ++requestSequence.current;
    const currentYear = new Date().getFullYear();
    const years = Array.from(
      { length: Math.max(0, currentYear - 2024 + 1) },
      (_, index) => 2024 + index,
    );
    setLoading(true);
    setLoadError("");
    setNotice("");
    setEntries([]);
    setPeriods([]);
    setAudits([]);
    void Promise.all([
      api.getHistory({ data: { staffId: staff.id } }),
      Promise.all(
        years.map((requestedYear) =>
          api.listPeriods({ data: { staffId: staff.id, year: requestedYear } }),
        ),
      ),
    ])
      .then(([history, periodResults]) => {
        if (requestSequence.current !== sequence) return;
        setEntries(history.entries);
        setAudits(history.changes);
        setPeriods(periodResults.flatMap((result) => result.periods));
      })
      .catch((cause: unknown) => {
        if (requestSequence.current === sequence) setLoadError(errorMessage(cause));
      })
      .finally(() => {
        if (requestSequence.current === sequence) setLoading(false);
      });
    return () => {
      requestSequence.current += 1;
    };
  }, [api, staff.id]);

  const allRows = useMemo(
    () => buildCompensatoryHistoryRows({ periods, entries, requests, serviceDay }),
    [periods, entries, requests, serviceDay],
  );
  const years = useMemo(
    () => [...new Set(allRows.map((row) => row.year))].sort((a, b) => b - a),
    [allRows],
  );
  const rows = allRows.filter(
    (row) => (year === "all" || row.year === Number(year)) && (kind === "all" || row.kind === kind),
  );

  async function refreshHistory() {
    const currentYear = new Date().getFullYear();
    const requestedYears = Array.from(
      { length: Math.max(0, currentYear - 2024 + 1) },
      (_, index) => 2024 + index,
    );
    const [history, periodResults] = await Promise.all([
      api.getHistory({ data: { staffId: staff.id } }),
      Promise.all(
        requestedYears.map((requestedYear) =>
          api.listPeriods({ data: { staffId: staff.id, year: requestedYear } }),
        ),
      ),
    ]);
    setEntries(history.entries);
    setAudits(history.changes);
    setPeriods(periodResults.flatMap((result) => result.periods));
    setLoadError("");
  }

  async function handleReverse(event: FormEvent<HTMLFormElement>, period: CompensatoryPeriod) {
    event.preventDefault();
    const cleanReason = reason.trim();
    if (!cleanReason || saving) return;
    if (!staff.isActive) {
      setLoadError("Reactiva al agente antes de registrar una reversión.");
      return;
    }
    if (period.status !== "active") return;
    const fingerprint = JSON.stringify({
      staffId: staff.id,
      periodId: period.id,
      reason: cleanReason,
    });
    if (pendingReversal.current?.fingerprint !== fingerprint) {
      pendingReversal.current = { fingerprint, id: operationId() };
    }
    setSaving(true);
    setUncertain(true);
    setLoadError("");
    setNotice("");
    try {
      await api.reversePeriod({
        data: {
          operationId: pendingReversal.current.id,
          staffId: staff.id,
          periodId: period.id,
          reason: cleanReason,
        },
      });
    } catch (cause) {
      setLoadError(
        `${errorMessage(cause)} Conservamos la operación para reintentar sin duplicar la reversión.`,
      );
      setUncertain(true);
      setSaving(false);
      return;
    }
    pendingReversal.current = null;
    setUncertain(false);
    setReversingId("");
    setReason("");
    setNotice("Período revertido. Se conservó su registro y la revisión de auditoría.");
    const callbackRefreshed = await refreshParentAfterConfirmedWrite(onSaved);
    try {
      await refreshHistory();
      if (!callbackRefreshed) {
        setNotice(
          "Período revertido y el historial se actualizó; la vista contenedora no pudo refrescarse.",
        );
      }
    } catch (cause) {
      setLoadError(
        `La reversión se confirmó, pero el historial no se pudo actualizar. Vuelve a cargarlo. ${errorMessage(cause)}`,
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleMovementReverse(event: FormEvent<HTMLFormElement>, entry: LedgerView) {
    event.preventDefault();
    const cleanReason = movementReason.trim();
    if (!cleanReason || !movementDate || saving) return;
    if (!staff.isActive) {
      setLoadError("Reactiva al agente antes de registrar una reversión.");
      return;
    }
    if (!canReverseCompensatoryHistoryMovement(entry, entries)) return;
    const fingerprint = JSON.stringify({
      staffId: staff.id,
      entryId: entry.id,
      reason: cleanReason,
      effectiveDate: movementDate,
    });
    if (pendingMovementReversal.current?.fingerprint !== fingerprint) {
      pendingMovementReversal.current = { fingerprint, id: operationId() };
    }
    setSaving(true);
    setUncertain(true);
    setLoadError("");
    setNotice("");
    try {
      await api.reverseMovement({
        data: {
          staffId: staff.id,
          entryId: entry.id,
          reason: cleanReason,
          effectiveDate: movementDate,
          clientOperationId: pendingMovementReversal.current.id,
        },
      });
    } catch (cause) {
      setLoadError(
        `${errorMessage(cause)} Conservamos la operación para reintentar sin duplicar la reversión.`,
      );
      setUncertain(true);
      setSaving(false);
      return;
    }
    pendingMovementReversal.current = null;
    setUncertain(false);
    setReversingMovementId("");
    setMovementReason("");
    setNotice("Movimiento revertido con un nuevo asiento; el original se conserva.");
    const callbackRefreshed = await refreshParentAfterConfirmedWrite(onSaved);
    try {
      await refreshHistory();
      if (!callbackRefreshed) {
        setNotice(
          "Movimiento revertido y el historial se actualizó; la vista contenedora no pudo refrescarse.",
        );
      }
    } catch (cause) {
      setLoadError(
        `La reversión se confirmó, pero el historial no se pudo actualizar. Vuelve a cargarlo. ${errorMessage(cause)}`,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="min-w-0 space-y-4" aria-labelledby="compensatory-history-title">
      <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 id="compensatory-history-title" className="text-lg font-semibold">
            Historial de horas
          </h2>
          <p className="text-sm text-muted-foreground">
            {staff.name} · períodos, movimientos y solicitudes
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={loading || Boolean(loadError) || rows.length === 0}
          onClick={() => downloadCsv(buildCompensatoryHistoryCsv(rows), staff.name)}
        >
          Descargar CSV filtrado
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:max-w-xl">
        <label className="space-y-1 text-sm font-medium">
          <span>Año</span>
          <select
            aria-label="Filtrar historial por año"
            className="min-h-11 w-full rounded-md border bg-background px-3"
            value={year}
            onChange={(event) => setYear(event.currentTarget.value)}
          >
            <option value="all">Todos</option>
            {years.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">
          <span>Tipo</span>
          <select
            aria-label="Filtrar historial por tipo"
            className="min-h-11 w-full rounded-md border bg-background px-3"
            value={kind}
            onChange={(event) => setKind(event.currentTarget.value)}
          >
            <option value="all">Todos</option>
            <option value="period">Períodos</option>
            <option value="movement">Movimientos</option>
            <option value="request">Solicitudes</option>
          </select>
        </label>
      </div>

      {notice && (
        <p role="status" className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          {notice}
        </p>
      )}
      {loadError && (
        <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">
          {loadError}
        </p>
      )}
      {loading ? (
        <p role="status" className="py-6 text-center text-sm text-muted-foreground">
          Cargando historial…
        </p>
      ) : loadError ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No se puede mostrar ni descargar un historial incompleto.
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No hay registros para estos filtros.
        </p>
      ) : (
        <ul className="min-w-0 divide-y rounded-lg border">
          {rows.map((row) => {
            const period =
              row.kind === "period" ? periods.find((item) => item.id === row.sourceId) : undefined;
            const movement =
              row.kind === "movement"
                ? entries.find((item) => item.id === row.sourceId)
                : undefined;
            const request =
              row.kind === "request"
                ? requests.find((item) => item.id === row.sourceId)
                : undefined;
            const canReverseMovement =
              movement && canReverseCompensatoryHistoryMovement(movement, entries);
            return (
              <li key={row.id} className="min-w-0 p-3 sm:p-4">
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border px-2 py-0.5 text-xs font-medium">
                        {row.kind === "period"
                          ? "Período"
                          : row.kind === "movement"
                            ? "Movimiento"
                            : "Solicitud"}
                      </span>
                      <span className="font-medium">{row.label}</span>
                      <time className="text-sm text-muted-foreground" dateTime={row.date}>
                        {row.date}
                      </time>
                    </div>
                    <p className="mt-1 break-words text-sm text-muted-foreground">{row.details}</p>
                    <p className="mt-2 text-sm">
                      {row.snapshotMinutes !== null && (
                        <span className="mr-3">
                          Snapshot neto: <strong>{minutesLabel(row.snapshotMinutes)}</strong>
                        </span>
                      )}
                      <span>
                        Impacto real en saldo:{" "}
                        <strong>{minutesLabel(row.balanceImpactMinutes)}</strong>
                      </span>
                    </p>
                  </div>
                  {period?.status === "active" && (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 shrink-0"
                      disabled={saving || uncertain}
                      onClick={() => {
                        setReversingId(period.id);
                        setReason("");
                      }}
                    >
                      Revertir período
                    </Button>
                  )}
                  {canReverseMovement && (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 shrink-0"
                      disabled={saving || uncertain}
                      onClick={() => {
                        setReversingMovementId(movement.id);
                        setMovementReason("");
                        setMovementDate(today());
                      }}
                    >
                      Revertir movimiento
                    </Button>
                  )}
                  {request && onOpenRequest && (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 shrink-0"
                      disabled={saving || uncertain}
                      onClick={() => onOpenRequest(request.id)}
                    >
                      {compensatoryRequestActionLabel(request.phase, request.requestedDate, serviceDay)}
                    </Button>
                  )}
                </div>
                <details className="mt-3 rounded-md bg-muted/40 px-3 py-2">
                  <summary className="min-h-8 cursor-pointer text-sm font-medium">
                    Detalles y auditoría
                  </summary>
                  <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">Actor</dt>
                      <dd>{row.actor || "No informado"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Identificador</dt>
                      <dd className="break-all">{row.sourceId}</dd>
                    </div>
                    {row.revision !== null && (
                      <div>
                        <dt className="text-muted-foreground">Revisión del período</dt>
                        <dd>{row.revision}</dd>
                      </div>
                    )}
                    {period?.reversedAt && (
                      <div>
                        <dt className="text-muted-foreground">Revertido por</dt>
                        <dd>
                          {period.reversedByName} · {period.reversedAt} · {period.reversalReason}
                        </dd>
                      </div>
                    )}
                  </dl>
                </details>
                {reversingId === period?.id && period && (
                  <form
                    className="mt-3 grid min-w-0 gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
                    onSubmit={(event) => void handleReverse(event, period)}
                  >
                    <label
                      className="min-w-0 space-y-1 text-sm font-medium"
                      htmlFor={`period-reversal-${period.id}`}
                    >
                      Motivo de reversión
                      <Input
                        id={`period-reversal-${period.id}`}
                        className="min-h-11"
                        value={reason}
                        onChange={(event) => setReason(event.currentTarget.value)}
                        maxLength={1000}
                        required
                        disabled={saving}
                      />
                    </label>
                    <p className="text-xs text-muted-foreground sm:col-span-3">
                      Confirmar agrega un movimiento inverso auditado; el período y sus revisiones
                      se conservan.
                    </p>
                    <Button type="submit" className="min-h-11" disabled={saving || !reason.trim()}>
                      {saving
                        ? "Confirmando…"
                        : uncertain
                          ? "Reintentar reversión"
                          : "Confirmar reversión"}
                    </Button>
                    {!uncertain && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-11"
                        disabled={saving}
                        onClick={() => setReversingId("")}
                      >
                        Cancelar
                      </Button>
                    )}
                  </form>
                )}
                {reversingMovementId === movement?.id && movement && canReverseMovement && (
                  <form
                    className="mt-3 grid min-w-0 gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,auto)_auto_auto] sm:items-end"
                    onSubmit={(event) => void handleMovementReverse(event, movement)}
                  >
                    <label
                      className="min-w-0 space-y-1 text-sm font-medium"
                      htmlFor={`movement-reversal-reason-${movement.id}`}
                    >
                      Motivo de reversión
                      <Input
                        id={`movement-reversal-reason-${movement.id}`}
                        className="min-h-11"
                        value={movementReason}
                        onChange={(event) => setMovementReason(event.currentTarget.value)}
                        maxLength={1000}
                        required
                        disabled={saving}
                      />
                    </label>
                    <label
                      className="space-y-1 text-sm font-medium"
                      htmlFor={`movement-reversal-date-${movement.id}`}
                    >
                      Fecha efectiva
                      <Input
                        id={`movement-reversal-date-${movement.id}`}
                        className="min-h-11"
                        type="date"
                        value={movementDate}
                        onChange={(event) => setMovementDate(event.currentTarget.value)}
                        required
                        disabled={saving}
                      />
                    </label>
                    <p className="text-xs text-muted-foreground sm:col-span-4">
                      La reversión se agrega como un movimiento nuevo; el original permanece en el
                      historial.
                    </p>
                    <Button
                      type="submit"
                      className="min-h-11"
                      disabled={saving || !movementReason.trim() || !movementDate}
                    >
                      {saving
                        ? "Confirmando…"
                        : uncertain
                          ? "Reintentar reversión"
                          : "Confirmar reversión"}
                    </Button>
                    {!uncertain && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-11"
                        disabled={saving}
                        onClick={() => setReversingMovementId("")}
                      >
                        Cancelar
                      </Button>
                    )}
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <details className="rounded-lg border bg-card">
        <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold">
          Auditoría del perfil · {audits.length} cambios
        </summary>
        <div className="px-4 pb-4 text-sm">
          {audits.length ? (
            <ul className="space-y-3">
              {audits.map((audit) => (
                <li key={audit.id} className="border-b pb-3">
                  <p className="font-medium">
                    {audit.createdAt} · {audit.actorName}
                  </p>
                  <p>{audit.reason}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <p>Antes: {JSON.stringify(audit.before ?? {})}</p>
                    <p>Después: {JSON.stringify(audit.after)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No hay cambios de perfil registrados.</p>
          )}
        </div>
      </details>
    </section>
  );
}
