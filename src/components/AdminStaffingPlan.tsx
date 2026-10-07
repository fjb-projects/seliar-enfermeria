import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addOperationalDays, getOperationalDate } from "@/lib/efa-staffing-plan.date";
import {
  listEfaStaffingPlan,
  previewEfaStaffingPlan,
  saveEfaStaffingPlan,
  saveEfaStaffingPlanException,
} from "@/lib/efa-staffing-plan.functions";
import type {
  CoverageTarget,
  CycleSlot,
  DatedSlot,
  PlannedRole,
  StaffingPlan,
} from "@/lib/efa-staffing-plan.server";

const roles: Record<PlannedRole, string> = {
  nurse: "Enfermería",
  driver: "Conducción",
  doctor: "Medicina",
};
const blankSlot = {
  role: "nurse" as PlannedRole,
  start: "06:00",
  end: "18:00",
  endDayOffset: 0 as 0 | 1,
  label: "",
};

type PendingPlanOperation = { fingerprint: string; id: string };
export function getStablePlanOperationId(
  pending: Map<string, PendingPlanOperation>,
  scope: string,
  payload: unknown,
  createId: () => string = () => crypto.randomUUID(),
) {
  const fingerprint = JSON.stringify(payload);
  const current = pending.get(scope);
  if (current?.fingerprint === fingerprint) return current.id;
  const id = createId();
  pending.set(scope, { fingerprint, id });
  return id;
}
export function clearConfirmedPlanOperation(
  pending: Map<string, PendingPlanOperation>,
  scope: string,
  id: string,
) {
  if (pending.get(scope)?.id === id) pending.delete(scope);
}

export function AdminStaffingPlan({
  bases = [],
}: {
  bases?: Array<{ id: string; name: string; isActive: boolean }>;
}) {
  const listPlans = useServerFn(listEfaStaffingPlan);
  const savePlan = useServerFn(saveEfaStaffingPlan);
  const saveException = useServerFn(saveEfaStaffingPlanException);
  const previewPlan = useServerFn(previewEfaStaffingPlan);
  const [baseId, setBaseId] = useState(bases.find((base) => base.isActive)?.id ?? "");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const minimumEffectiveDate = addOperationalDays(getOperationalDate(new Date()), 1);
  const [cycleAnchor, setCycleAnchor] = useState("");
  const [cycleLengthDays, setCycleLengthDays] = useState("4");
  const [dayOffset, setDayOffset] = useState("0");
  const [slot, setSlot] = useState(blankSlot);
  const [cycleSlots, setCycleSlots] = useState<CycleSlot[]>([]);
  const [exceptionDate, setExceptionDate] = useState("");
  const [exceptionSlots, setExceptionSlots] = useState<Array<Omit<DatedSlot, "date" | "endDate">>>(
    [],
  );
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preview, setPreview] = useState<DatedSlot[] | null>(null);
  const [history, setHistory] = useState<StaffingPlan[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const pendingOperations = useRef(new Map<string, PendingPlanOperation>());
  const name = bases.find((base) => base.id === baseId)?.name ?? "";
  const activeBase = bases.find((base) => base.id === baseId)?.isActive === true;
  const target = (): CoverageTarget => ({ kind: "base", baseId, name });
  const targetScope = () => `base:${baseId}`;
  function addCycleSlot() {
    setCycleSlots((current) => [
      ...current,
      { ...slot, dayOffset: Number(dayOffset), label: slot.label.trim() || null },
    ]);
  }
  function addExceptionSlot() {
    setExceptionSlots((current) => [...current, { ...slot, label: slot.label.trim() || null }]);
  }
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
      return true;
    } catch {
      setError(
        "No se pudo guardar o consultar la planificación. Revisa los datos e inténtalo nuevamente.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function runIdempotent(
    scope: string,
    payload: unknown,
    action: (operationId: string) => Promise<unknown>,
    success: string,
  ) {
    const operationId = getStablePlanOperationId(pendingOperations.current, scope, payload);
    if (await run(() => action(operationId), success)) {
      clearConfirmedPlanOperation(pendingOperations.current, scope, operationId);
    }
  }
  const cycleValid = Boolean(activeBase && effectiveFrom && cycleAnchor && cycleSlots.length);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Planificación futura de cobertura</CardTitle>
        <p className="text-sm text-muted-foreground">
          Configura ciclos independientes por opción del catálogo, rol y fecha. Es una
          planificación, no una dotación real ni una nómina de personas.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm text-green-700">
            {message}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1 text-sm">
            <Label htmlFor="plan-target-base">Base del catálogo</Label>
            <select
              id="plan-target-base"
              className="min-h-11 rounded-md border bg-background px-3"
              value={baseId}
              onChange={(event) => {
                setBaseId(event.target.value);
                setHistory(null);
                setPreview(null);
              }}
            >
              <option value="">Selecciona una base</option>
              {bases.map((base) => (
                <option key={base.id} value={base.id}>
                  {base.name}
                  {base.isActive ? "" : " (inactiva)"}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1 text-sm">
            <Label htmlFor="plan-effective-from">Vigente desde</Label>
            <Input
              id="plan-effective-from"
              type="date"
              value={effectiveFrom}
              min={minimumEffectiveDate}
              onChange={(event) => setEffectiveFrom(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Las versiones y excepciones deben tener vigencia posterior al día operativo actual.
            </p>
          </div>
          <div className="grid gap-1 text-sm">
            <Label htmlFor="plan-cycle-anchor">Fecha de anclaje del ciclo</Label>
            <Input
              id="plan-cycle-anchor"
              type="date"
              value={cycleAnchor}
              onChange={(event) => setCycleAnchor(event.target.value)}
            />
          </div>
          <div className="grid gap-1 text-sm">
            <Label htmlFor="plan-cycle-length">Duración del ciclo en días</Label>
            <Input
              id="plan-cycle-length"
              type="number"
              min={1}
              max={366}
              value={cycleLengthDays}
              onChange={(event) => setCycleLengthDays(event.target.value)}
            />
          </div>
        </div>
        <section className="space-y-3 rounded-md border p-3" aria-label="Tramos del ciclo">
          <h3 className="font-medium">Tramos del ciclo (pueden repetirse por día y rol)</h3>
          <div className="grid gap-2 sm:grid-cols-6">
            <label className="grid gap-1 text-sm">
              Día del ciclo
              <input
                className="min-h-11 rounded-md border bg-background px-3"
                type="number"
                min={0}
                max={Math.max(0, Number(cycleLengthDays) - 1)}
                value={dayOffset}
                onChange={(event) => setDayOffset(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Rol
              <select
                className="min-h-11 rounded-md border bg-background px-3"
                value={slot.role}
                onChange={(event) =>
                  setSlot((current) => ({ ...current, role: event.target.value as PlannedRole }))
                }
              >
                {Object.entries(roles).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Desde
              <input
                className="min-h-11 rounded-md border bg-background px-3"
                type="time"
                value={slot.start}
                onChange={(event) =>
                  setSlot((current) => ({ ...current, start: event.target.value }))
                }
              />
            </label>
            <label className="grid gap-1 text-sm">
              Hasta
              <input
                className="min-h-11 rounded-md border bg-background px-3"
                type="time"
                value={slot.end}
                onChange={(event) =>
                  setSlot((current) => ({ ...current, end: event.target.value }))
                }
              />
            </label>
            <label className="grid gap-1 text-sm">
              Finaliza
              <select
                className="min-h-11 rounded-md border bg-background px-3"
                value={slot.endDayOffset}
                onChange={(event) =>
                  setSlot((current) => ({
                    ...current,
                    endDayOffset: Number(event.target.value) as 0 | 1,
                  }))
                }
              >
                <option value={0}>El mismo día</option>
                <option value={1}>Al día siguiente (hasta 24 h)</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Etiqueta opcional
              <input
                className="min-h-11 rounded-md border bg-background px-3"
                maxLength={40}
                value={slot.label}
                onChange={(event) =>
                  setSlot((current) => ({ ...current, label: event.target.value }))
                }
                placeholder="A, B, C, D…"
              />
            </label>
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={busy || Number(dayOffset) >= Number(cycleLengthDays)}
            onClick={addCycleSlot}
          >
            Agregar tramo al ciclo
          </Button>
          {cycleSlots.length > 0 && (
            <ol className="space-y-1 text-sm">
              {cycleSlots.map((item, index) => (
                <li key={`${index}-${item.start}`}>
                  Día {item.dayOffset + 1} · {roles[item.role]} · {item.start}–{item.end}
                  {item.endDayOffset === 1 ? " · termina al día siguiente" : ""}
                  {item.label ? ` · ${item.label}` : ""}{" "}
                  <button
                    type="button"
                    className="ml-2 underline"
                    onClick={() =>
                      setCycleSlots((items) => items.filter((_, itemIndex) => itemIndex !== index))
                    }
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ol>
          )}
          <Button
            className="min-h-11"
            disabled={busy || !cycleValid}
            onClick={() => {
              const payload = {
                target: target(),
                effectiveFrom,
                cycleAnchor,
                cycleLengthDays: Number(cycleLengthDays),
                slots: cycleSlots,
              };
              void runIdempotent(
                `plan:${targetScope()}`,
                payload,
                async (clientOperationId) => {
                  await savePlan({ data: { ...payload, clientOperationId } });
                  setHistory((await listPlans({ data: { target: target() } })) as StaffingPlan[]);
                },
                "Se guardó una nueva versión efectiva; las anteriores se conservaron.",
              );
            }}
          >
            Guardar nueva versión del ciclo
          </Button>
        </section>
        <section className="space-y-3 rounded-md border p-3" aria-label="Excepción por fecha">
          <h3 className="font-medium">Excepción para una fecha</h3>
          <p className="text-sm text-muted-foreground">
            Los tramos de la excepción reemplazan el ciclo completo ese día. Una lista vacía
            significa que no se planifica cobertura para esa fecha.
          </p>
          <label className="grid max-w-sm gap-1 text-sm">
            Fecha de excepción
            <input
              className="min-h-11 rounded-md border bg-background px-3"
              type="date"
              value={exceptionDate}
              min={minimumEffectiveDate}
              onChange={(event) => setExceptionDate(event.target.value)}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={busy || !exceptionDate || !activeBase}
            onClick={addExceptionSlot}
          >
            Agregar tramo a la excepción
          </Button>
          {exceptionSlots.length > 0 && (
            <ol className="space-y-1 text-sm">
              {exceptionSlots.map((item, index) => (
                <li key={`${index}-${item.start}`}>
                  {roles[item.role]} · {item.start}–{item.end}
                  {item.endDayOffset === 1 ? " (día siguiente)" : ""}
                  {item.label ? ` · ${item.label}` : ""}{" "}
                  <button
                    type="button"
                    className="ml-2 underline"
                    onClick={() =>
                      setExceptionSlots((items) =>
                        items.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ol>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-11"
              disabled={busy || !exceptionDate || !activeBase}
              onClick={() => {
                const payload = { target: target(), date: exceptionDate, slots: exceptionSlots };
                void runIdempotent(
                  `exception:${targetScope()}:${exceptionDate}`,
                  payload,
                  (clientOperationId) => saveException({ data: { ...payload, clientOperationId } }),
                  "La excepción por fecha se guardó como una nueva revisión.",
                );
              }}
            >
              Guardar excepción
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={busy}
              onClick={() => setExceptionSlots([])}
            >
              Limpiar tramos (sin cobertura planificada)
            </Button>
          </div>
        </section>
        <section className="space-y-3 rounded-md border p-3" aria-label="Vista previa de cobertura">
          <h3 className="font-medium">Vista previa de planificación</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              Desde
              <input
                className="min-h-11 rounded-md border bg-background px-3"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Hasta
              <input
                className="min-h-11 rounded-md border bg-background px-3"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={busy || !name.trim() || !from || !to}
            onClick={() =>
              void run(async () => {
                const result = (await previewPlan({ data: { target: target(), from, to } })) as {
                  slots: DatedSlot[];
                };
                setPreview(result.slots);
              }, "Vista previa actualizada. Solo muestra cobertura planificada.")
            }
          >
            Consultar vista previa
          </Button>
          <Button
            type="button"
            variant="outline"
            className="ml-2 min-h-11"
            disabled={busy || !name.trim()}
            onClick={() =>
              void run(async () => {
                setHistory((await listPlans({ data: { target: target() } })) as StaffingPlan[]);
              }, "Historial de versiones actualizado.")
            }
          >
            Consultar historial de versiones
          </Button>
          {history && (
            <ol className="space-y-1 text-sm" aria-label="Versiones efectivas del plan">
              {history.map((item) => (
                <li key={item.id}>
                  Versión {item.version} · efectiva desde {item.effectiveFrom} · ciclo de{" "}
                  {item.cycleLengthDays} días · anclaje {item.cycleAnchor} · {item.slots.length}{" "}
                  tramos
                </li>
              ))}
              {history.length === 0 && <li>No hay versiones registradas para este objetivo.</li>}
            </ol>
          )}
          {preview &&
            (preview.length ? (
              <ul className="space-y-1 text-sm">
                {preview.map((item, index) => (
                  <li key={`${item.date}-${item.role}-${index}`}>
                    {item.date} · {roles[item.role]} · {item.start}–{item.end}
                    {item.label ? ` · ${item.label}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No hay tramos planificados en esas fechas. Esto no confirma ni infiere dotación
                real.
              </p>
            ))}
        </section>
      </CardContent>
    </Card>
  );
}
