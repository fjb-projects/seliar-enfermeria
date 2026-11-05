import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CompensatoryAgentInput } from "@/components/CompensatoryAgentInput";
import type { StaffView } from "@/lib/compensatory-bank.functions";
import {
  getCompensatoryCoverage,
  saveCompensatoryCoverage,
} from "@/lib/compensatory-coverage.functions";
import type {
  CompensatoryCoverageState,
  CompensatoryCoverageHistory,
} from "@/lib/compensatory-coverage.server";
import {
  argentinaLocalValue,
  formatArgentinaDateTime,
  formatCoverageHistorySnapshot,
  toArgentinaTimestamp,
  validateCoveragePlan,
  type CoverageAssignmentDraft,
} from "@/lib/compensatory-coverage-form";

type CoverageRequest = {
  id: string;
  staffId: string;
  requestedDate: string | null;
  requestedMinutes: number | null;
  phase: string;
};
type SavePayload = {
  requestId: string;
  clientOperationId: string;
  expectedVersion: number;
  plannedStart: string;
  plannedEnd: string;
  assignments: Array<{
    staffId: string;
    start: string;
    end: string;
    confirmed: boolean;
    verificationMethod: string | null;
  }>;
  reason: string;
};
export type CompensatoryCoverageApi = {
  getCoverage: typeof getCompensatoryCoverage;
  saveCoverage: typeof saveCompensatoryCoverage;
};
const defaultApi: CompensatoryCoverageApi = {
  getCoverage: getCompensatoryCoverage,
  saveCoverage: saveCompensatoryCoverage,
};
type DraftRow = CoverageAssignmentDraft & { key: string };
type FrozenAttempt = { data: SavePayload };

function operationId() {
  return globalThis.crypto.randomUUID();
}
function initialRow(): DraftRow {
  return {
    key: operationId(),
    staffId: "",
    start: "",
    end: "",
    confirmed: false,
    verificationMethod: "",
  };
}
function messageOf(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "No se pudo guardar la asignación.";
}
function phaseCanEdit(phase: string) {
  return phase === "approved" || phase === "consumed";
}
function formatState(state: CompensatoryCoverageState) {
  const start = state.plannedStart
    ? argentinaLocalValue(state.plannedStart).replace("T", " ")
    : "Sin horario registrado";
  const end = state.plannedEnd ? argentinaLocalValue(state.plannedEnd).replace("T", " ") : "";
  return `${start}${end ? ` a ${end}` : ""}`;
}
function statusLabel(status: CompensatoryCoverageState["status"]) {
  return status === "confirmed"
    ? "Horario completo confirmado"
    : status === "partial"
      ? "Falta confirmar parte del horario"
      : "Sin personas asignadas";
}
export function CoverageEntry({
  hasAssignments,
  onEdit,
}: {
  hasAssignments: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="space-y-2">
      <p className="font-medium">¿Quién cubre este horario?</p>
      {!hasAssignments && (
        <p className="text-muted-foreground">
          Opcional. Registrá las personas que cubrirán el compensatorio y sus horarios.
        </p>
      )}
      <Button type="button" variant="outline" className="min-h-11" aria-expanded={false} onClick={onEdit}>
        {hasAssignments ? "Editar" : "+ Registrar quién cubre"}
      </Button>
    </div>
  );
}
export function HistoryItem({ item }: { item: CompensatoryCoverageHistory }) {
  const before = formatCoverageHistorySnapshot(item.before);
  const after = formatCoverageHistorySnapshot(item.after);
  return (
    <li className="border-b py-3 last:border-0">
      <p className="font-medium">
        {formatArgentinaDateTime(item.occurredAt)} · {item.actorName} · versión {item.version}
      </p>
      <p className="mt-1">Motivo: {item.reason}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <HistorySnapshot label="Antes" snapshot={before} />
        <HistorySnapshot label="Después" snapshot={after} />
      </div>
    </li>
  );
}

function HistorySnapshot({
  label,
  snapshot,
}: {
  label: string;
  snapshot: ReturnType<typeof formatCoverageHistorySnapshot>;
}) {
  return (
    <div className="rounded-md bg-muted/40 p-2">
      <p className="font-medium">
        {label}: {snapshot.status}
      </p>
      <p>{snapshot.plan}</p>
      {snapshot.emptyAssignmentsLabel ? (
        <p className="text-muted-foreground">{snapshot.emptyAssignmentsLabel}</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {snapshot.assignments.map((assignment, index) => (
            <li key={`${assignment.label}-${assignment.interval}-${index}`}>
              <span className="font-medium">{assignment.label}</span> · {assignment.interval} ·{" "}
              {assignment.confirmation}
              {assignment.verification && (
                <p className="text-muted-foreground">Verificación: {assignment.verification}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CompensatoryCoveragePanel({
  request,
  staff,
  onSaved,
  onBusyChange,
  api: apiOverrides,
}: {
  request: CoverageRequest;
  staff: StaffView[];
  onSaved: () => void | Promise<void>;
  onBusyChange?: (busy: boolean) => void;
  api?: Partial<CompensatoryCoverageApi>;
}) {
  const api = useMemo(() => ({ ...defaultApi, ...apiOverrides }), [apiOverrides]);
  const [state, setState] = useState<CompensatoryCoverageState | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [stale, setStale] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshIssue, setRefreshIssue] = useState("");
  const [loadRevision, setLoadRevision] = useState(0);
  const frozen = useRef<FrozenAttempt | null>(null);
  const editable = phaseCanEdit(request.phase) && !loading && !busy && !uncertain && !stale;
  const selectableStaff = useMemo(
    () => staff.filter((person) => person.isActive && person.id !== request.staffId),
    [staff, request.staffId],
  );

  useEffect(() => onBusyChange?.(busy || uncertain), [busy, uncertain, onBusyChange]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void api
      .getCoverage({ data: { requestId: request.id } })
      .then((loaded) => {
        if (!active) return;
        setState(loaded);
        setStart(argentinaLocalValue(loaded.plannedStart));
        setEnd(argentinaLocalValue(loaded.plannedEnd));
        setRows(
          loaded.assignments.map((assignment) => ({
            ...assignment,
            key: operationId(),
            verificationMethod: assignment.verificationMethod ?? "",
          })),
        );
        setReason("");
        setEditing(false);
        setUncertain(false);
        setStale(false);
        frozen.current = null;
      })
      .catch((cause: unknown) => {
        if (active) setError(messageOf(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, request.id, loadRevision]);

  function updateRow(key: string, patch: Partial<DraftRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setError("");
  }
  function beginReview() {
    const issue = validateCoveragePlan({
      requestedDate: request.requestedDate,
      requestedMinutes: request.requestedMinutes,
      plannedStart: start,
      plannedEnd: end,
      assignments: rows,
    });
    if (issue) {
      setError(issue);
      return;
    }
    if (!reason.trim()) {
      setError("Indica el motivo del registro o cambio.");
      return;
    }
    const plannedStart = toArgentinaTimestamp(start)!;
    const plannedEnd = toArgentinaTimestamp(end)!;
    const data: SavePayload = {
      requestId: request.id,
      clientOperationId: operationId(),
      expectedVersion: state?.version ?? 0,
      plannedStart,
      plannedEnd,
      assignments: rows.map(
        ({ staffId, start: rowStart, end: rowEnd, confirmed, verificationMethod }) => ({
          staffId,
          start: toArgentinaTimestamp(rowStart)!,
          end: toArgentinaTimestamp(rowEnd)!,
          confirmed,
          verificationMethod: confirmed ? verificationMethod.trim() : null,
        }),
      ),
      reason: reason.trim(),
    };
    frozen.current = { data };
    setError("");
    setReviewing(true);
  }
  async function save(attempt = frozen.current) {
    if (!attempt || busy) return;
    setBusy(true);
    setError("");
    try {
      const saved = await api.saveCoverage(attempt);
      setState(saved);
      setUncertain(false);
      setReviewing(false);
      setEditing(false);
      setNotice(
        "La asignación se guardó; este registro no modifica la aprobación ni el saldo de horas.",
      );
      frozen.current = null;
      try {
        await onSaved();
        setRefreshIssue("");
      } catch {
        setRefreshIssue(
          "La asignación se guardó, pero no se pudo actualizar la vista. Recargá los datos para ver el estado vigente.",
        );
      }
    } catch (cause) {
      const text = messageOf(cause);
      if (/cobertura cambió|versión.*actualiz|stale|version conflict/i.test(text)) {
        setStale(true);
        setReviewing(false);
        setError(text);
      } else if (
        /no se encontró|no puede cubrir|no está activo|no pueden superponerse|otra cobertura asignada|intervalo|duración|fecha de servicio|verificación manual|solo se puede registrar|solicitud no tiene/i.test(
          text,
        )
      ) {
        setReviewing(false);
        setError(text);
        frozen.current = null;
      } else {
        setUncertain(true);
        setError(
          `${text} El resultado es incierto; reintentá sin cambiar estos datos para reutilizar la misma operación.`,
        );
      }
    } finally {
      setBusy(false);
    }
  }
  function reloadAndDiscard() {
    frozen.current = null;
    setReviewing(false);
    setStale(false);
    setUncertain(false);
    setLoadRevision((value) => value + 1);
  }

  return (
    <div className="space-y-4 text-sm">
      {!phaseCanEdit(request.phase) && (
        <p role="status" className="rounded-md bg-muted p-3">
          La solicitud no está en una etapa habilitada para registrar quién cubre. La vista es de solo
          lectura.
        </p>
      )}
      {loading && <p role="status">Cargando asignaciones…</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {!loading && state && (
        <>
          {state.version > 0 && (
            <div>
              <p className="font-medium">{statusLabel(state.status)}</p>
              <p className="mt-1 text-muted-foreground">
                {formatState(state)}
                {request.requestedMinutes ? ` · ${request.requestedMinutes} min solicitados` : ""}
              </p>
            </div>
          )}
          {refreshIssue && <p role="alert">{refreshIssue}</p>}
          {notice && <p role="status">{notice}</p>}
          {stale && (
            <div className="space-y-2 rounded-md border border-amber-500/50 p-3">
              <p>
                La versión cambió en otra sesión. No reintentes esta versión: descartá el borrador y
                cargá el estado actualizado antes de decidir qué conservar.
              </p>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={reloadAndDiscard}
              >
                Recargar y descartar este borrador
              </Button>
            </div>
          )}
          {uncertain && (
            <div className="space-y-2 rounded-md border p-3">
              <p>
                El servidor no confirmó el resultado. Se mantienen congelados los datos y la misma
                clave de operación.
              </p>
              <Button type="button" className="min-h-11" onClick={() => void save()}>
                Reintentar el mismo registro
              </Button>
            </div>
          )}
          {editable && !reviewing && !editing && (
            <CoverageEntry
              hasAssignments={state.assignments.length > 0}
              onEdit={() => {
                if (!rows.length) setRows([initialRow()]);
                setEditing(true);
              }}
            />
          )}
          {editable && !reviewing && editing && (
            <form
              id="coverage-editor"
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                beginReview();
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="coverage-start" className="font-medium">
                    Inicio del compensatorio (Buenos Aires)
                  </label>
                  <Input
                    id="coverage-start"
                    type="datetime-local"
                    step="60"
                    className="min-h-11"
                    value={start}
                    onChange={(event) => setStart(event.currentTarget.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="coverage-end" className="font-medium">
                    Fin del compensatorio (Buenos Aires)
                  </label>
                  <Input
                    id="coverage-end"
                    type="datetime-local"
                    step="60"
                    className="min-h-11"
                    value={end}
                    onChange={(event) => setEnd(event.currentTarget.value)}
                    required
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                La duración debe coincidir exactamente con la solicitud; el fin puede quedar al día
                siguiente. No se completa un horario por defecto.
              </p>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">Quién lo cubre</h3>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => setRows((current) => [...current, initialRow()])}
                  >
                    {rows.length ? "Agregar otra persona" : "Agregar persona"}
                  </Button>
                </div>
                {!rows.length && (
                  <p className="text-muted-foreground">
                    Todavía no hay personas asignadas.
                  </p>
                )}
                {rows.map((row, index) => (
                  <fieldset className="space-y-3 rounded-md border p-3" key={row.key}>
                    <legend className="px-1 font-medium">Persona {index + 1}</legend>
                    <CompensatoryAgentInput
                      id={`coverage-staff-${row.key}`}
                      label="Agente activo"
                      value={row.staffId}
                      options={selectableStaff.map((person) => ({
                        id: person.id,
                        label: `${person.name} · DNI ${person.dni}`,
                      }))}
                      disabled={!editable}
                      onSelect={(staffId) => updateRow(row.key, { staffId: staffId ?? "" })}
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label htmlFor={`coverage-row-start-${row.key}`} className="font-medium">
                          Desde (Buenos Aires)
                        </label>
                        <Input
                          id={`coverage-row-start-${row.key}`}
                          type="datetime-local"
                          step="60"
                          className="min-h-11"
                          value={row.start}
                          onChange={(event) =>
                            updateRow(row.key, { start: event.currentTarget.value })
                          }
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor={`coverage-row-end-${row.key}`} className="font-medium">
                          Hasta (Buenos Aires)
                        </label>
                        <Input
                          id={`coverage-row-end-${row.key}`}
                          type="datetime-local"
                          step="60"
                          className="min-h-11"
                          value={row.end}
                          onChange={(event) =>
                            updateRow(row.key, { end: event.currentTarget.value })
                          }
                          required
                        />
                      </div>
                    </div>
                    <div className="flex min-h-11 items-center gap-2">
                      <Checkbox
                        id={`coverage-confirmed-${row.key}`}
                        checked={row.confirmed}
                        onCheckedChange={(checked) =>
                          updateRow(row.key, { confirmed: checked === true })
                        }
                      />
                      <label htmlFor={`coverage-confirmed-${row.key}`} className="cursor-pointer">
                        Ya confirmé con esta persona
                      </label>
                    </div>
                    {row.confirmed && (
                      <div className="space-y-1.5">
                        <label htmlFor={`coverage-method-${row.key}`} className="font-medium">
                          ¿Cómo lo confirmaste?
                        </label>
                        <Input
                          id={`coverage-method-${row.key}`}
                          className="min-h-11"
                          value={row.verificationMethod}
                          onChange={(event) =>
                            updateRow(row.key, { verificationMethod: event.currentTarget.value })
                          }
                          maxLength={500}
                          required
                        />
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-11"
                      onClick={() =>
                        setRows((current) => current.filter((item) => item.key !== row.key))
                      }
                    >
                      Quitar persona {index + 1}
                    </Button>
                  </fieldset>
                ))}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="coverage-reason" className="font-medium">
                  Motivo del registro o cambio
                </label>
                <Textarea
                  id="coverage-reason"
                  value={reason}
                  onChange={(event) => setReason(event.currentTarget.value)}
                  maxLength={1000}
                  required
                />
              </div>
              <Button type="submit" className="min-h-11">
                Revisar antes de guardar
              </Button>
            </form>
          )}
          {reviewing && !uncertain && !stale && frozen.current && (
            <div className="space-y-3 rounded-md border p-3">
              <h3 className="font-semibold">Revisión del registro</h3>
              <p>
                Horario del compensatorio:{" "}
                {formatState({
                  ...state,
                  plannedStart: frozen.current.data.plannedStart,
                  plannedEnd: frozen.current.data.plannedEnd,
                })}
              </p>
              <p>
                {frozen.current.data.assignments.length} asignación(es) · motivo:{" "}
                {frozen.current.data.reason}
              </p>
              <p className="text-muted-foreground">
                Un horario sin confirmar no se informará como completo y este registro no cambia la
                aprobación ni las horas.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => void save()}
                >
                  Guardar asignación
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => setReviewing(false)}
                >
                  Volver a editar
                </Button>
              </div>
            </div>
          )}
          {state.assignments.length > 0 && (
            <ul className="space-y-2" aria-label="Personas y horarios guardados">
              {state.assignments.map((assignment, index) => (
                <li
                  className="rounded-md border p-3"
                  key={`${assignment.staffId}-${assignment.start}-${index}`}
                >
                  <p className="font-medium">
                    {assignment.staffName} ·{" "}
                    {assignment.confirmed ? "Confirmada manualmente" : "Pendiente de confirmación"}
                  </p>
                  <p>
                    {argentinaLocalValue(assignment.start).replace("T", " ")} –{" "}
                    {argentinaLocalValue(assignment.end).replace("T", " ")}
                  </p>
                  {assignment.confirmed && (
                    <p className="text-muted-foreground">
                      Verificación: {assignment.verificationMethod}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <details className="rounded-md border">
            <summary className="min-h-11 cursor-pointer px-3 py-3 font-medium">
              Historial de cambios · {state.history.length}
            </summary>
            <div className="px-3 pb-3">
              {state.history.length ? (
                <ol>
                  {state.history.map((item, index) => (
                    <HistoryItem key={`${item.version}-${index}`} item={item} />
                  ))}
                </ol>
              ) : (
                <p className="text-muted-foreground">Todavía no hay cambios auditados.</p>
              )}
            </div>
          </details>
        </>
      )}
      {!state && !loading && error && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => setLoadRevision((value) => value + 1)}
        >
          Reintentar carga
        </Button>
      )}
    </div>
  );
}
