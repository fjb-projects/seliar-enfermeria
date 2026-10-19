import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  EfaActionConfirmation,
  isActionConfirmationCurrent,
} from "@/components/EfaActionConfirmation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EfaObservationPanel } from "@/components/EfaObservationPanel";
import type { StaffingCause, StaffingRole, StaffingView } from "@/lib/efa-staffing.server";
import {
  arriveEfaStaffing,
  departEfaStaffing,
  enterEfaStaffing,
  exitEfaStaffing,
  listEfaStaffing,
} from "@/lib/efa-staffing.functions";
import {
  endEfaGuard,
  listActiveEfaGuardBases,
  listEfaGuards,
  setEfaGuardBases,
  startEfaGuard,
} from "@/lib/efa-guards.functions";
import { previewEfaStaffingPlan } from "@/lib/efa-staffing-plan.functions";
import { getOperationalDateRange } from "@/lib/efa-staffing-plan.date";
import { formatDateTimeMinutes, formatTimeMinutes } from "@/lib/efa-labels";
import type { DatedSlot } from "@/lib/efa-staffing-plan.server";
import { listEfaMobileArrivalsForGuard } from "@/lib/efa-mobile-arrivals.functions";
import { listEfaMobileHygieneForGuard } from "@/lib/efa-mobile-hygiene.functions";
import { EfaMobileArrivalPanel, type MobileArrivalView } from "./EfaMobileArrivalPanel";
import type { MobileHygieneView } from "./EfaMobileHygienePanel";
import {
  createEfaGuardMobileWorkspace,
  type EfaGuardMobileWorkspaceSnapshot,
} from "@/lib/efa-guard-mobile-workspace";

export type GuardBase = { id: string; name: string; isActive: boolean };
export type GuardEvent = {
  baseId: string;
  baseName: string;
  actorUserId: string;
  action: "added" | "removed";
  occurredAt: Date | string;
};
export type GuardView = {
  id: string;
  ownerUserId: string;
  startedAt: Date | string;
  endedAt: Date | string | null;
  declaredAtCentral: boolean;
  version: number;
  bases: GuardBase[];
  baseEvents: GuardEvent[];
};

function toLocalDateTimeValue(value: Date | string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function localNow() {
  return toLocalDateTimeValue(new Date());
}

export type PendingStaffingOperation = { fingerprint: string; id: string };

export function getStableStaffingOperationId(
  pending: Map<string, PendingStaffingOperation>,
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

export function clearConfirmedStaffingOperation(
  pending: Map<string, PendingStaffingOperation>,
  scope: string,
  id: string,
) {
  if (pending.get(scope)?.id === id) pending.delete(scope);
}

const staffingRoleLabels: Record<StaffingRole, string> = {
  nurse: "Enfermería",
  driver: "Conducción",
  doctor: "Medicina",
};
const staffingCauseLabels: Record<StaffingCause, string> = {
  medical_request: "Requerimiento médico",
  coordination: "Coordinación",
  temporary: "Salida temporal",
  other: "Otra",
};

const clockTimeFormat = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const clockDateFormat = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

// Current time refreshed on each minute boundary. The server render has no trustworthy local
// time, so it returns null there (and on the first client render) until the effect fills it in.
function useMinuteNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const tick = () => setNow(new Date());
    tick();
    const current = new Date();
    const untilNextMinute = 60_000 - (current.getSeconds() * 1000 + current.getMilliseconds());
    const timeout = setTimeout(() => {
      tick();
      interval = setInterval(tick, 60_000);
    }, untilNextMinute);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);
  return now;
}

// "Lunes 19 de octubre": the weekday capitalized and without the comma Intl adds after it.
function formatClockDate(date: Date) {
  const text = clockDateFormat.format(date).replace(",", "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Punch-clock face for the start block, at the live header's scale. The date joins the eyebrow
// once the client knows it; until then the eyebrow is only the label, still a single line.
function GuardStartClock() {
  const now = useMinuteNow();
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {now ? `Fichar entrada · ${formatClockDate(now)}` : "Fichar entrada"}
      </p>
      <p className="font-display text-3xl leading-none font-semibold tabular-nums sm:text-4xl">
        {now ? clockTimeFormat.format(now) : "--:--"}
      </p>
    </div>
  );
}

function formatElapsed(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

// Status-board header for the open guard, read as one line: "En curso · desde 08:05 · 1 h 16 min".
// The start time is fixed 24 h Buenos Aires time, so server and client agree; the elapsed time
// needs the client clock and keeps a placeholder until then. The visual pieces are hidden from
// assistive tech in favor of one unambiguous sentence.
function GuardLiveStatus({ startedAt }: { startedAt: string | Date }) {
  const now = useMinuteNow();
  const start = new Date(startedAt);
  const startLabel = formatTimeMinutes(start);
  return (
    <div className="min-w-0">
      <p className="sr-only">{`Guardia en curso desde ${startLabel}`}</p>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          aria-hidden="true"
          className="text-xs font-medium tracking-wide whitespace-nowrap uppercase"
        >
          <span className="mr-2 inline-block size-2.5 rounded-full bg-[var(--brand-orange)] align-middle motion-safe:animate-pulse" />
          En curso
        </span>
        <span aria-hidden="true" className="text-sm text-muted-foreground">
          desde
        </span>
        <span
          aria-hidden="true"
          className="font-display text-3xl leading-none font-semibold tabular-nums"
        >
          {startLabel}
        </span>
        <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
          {now ? (
            <>
              <span className="sr-only">Duración: </span>
              {formatElapsed(now.getTime() - start.getTime())}
            </>
          ) : (
            <span aria-hidden="true">-- min</span>
          )}
        </span>
      </p>
    </div>
  );
}

function PlannedCoverageReadOnly({ bases }: { bases: GuardBase[] }) {
  const previewPlan = useServerFn(previewEfaStaffingPlan);
  const [baseId, setBaseId] = useState(bases[0]?.id ?? "");
  const defaultRange = getOperationalDateRange(new Date(), 6);
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [slots, setSlots] = useState<DatedSlot[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (bases.length === 0) return null;
  return (
    <section
      className="space-y-3 rounded-lg border p-4"
      aria-label="Planificación futura de cobertura"
    >
      <div>
        <h3 className="font-medium">Planificación futura (solo lectura)</h3>
        <p className="text-sm text-muted-foreground">
          La planificación no confirma la dotación observada ni la disponibilidad del móvil.
        </p>
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-3">
        <label className="grid min-w-0 gap-1 text-sm">
          Base
          <select
            className="min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3"
            value={baseId}
            onChange={(event) => setBaseId(event.target.value)}
          >
            {bases.map((base) => (
              <option key={base.id} value={base.id}>
                {base.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          Desde
          <input
            className="min-h-11 rounded-md border bg-background px-3"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
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
        disabled={busy || !baseId || !from || !to}
        onClick={() => {
          setBusy(true);
          setError("");
          const selectedBase = bases.find((base) => base.id === baseId);
          if (!selectedBase) return;
          void previewPlan({
            data: {
              target: { kind: "base", baseId: selectedBase.id, name: selectedBase.name },
              from,
              to,
            },
          })
            .then((result) => setSlots((result as { slots: DatedSlot[] }).slots))
            .catch(() => setError("No se pudo consultar la planificación disponible."))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Consultando…" : "Consultar planificación"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {slots &&
        (slots.length ? (
          <ul className="space-y-1 text-sm">
            {slots.map((item, index) => (
              <li key={`${item.date}-${item.role}-${index}`}>
                {item.date} {item.start}–{item.endDate === item.date ? "" : `${item.endDate} `}
                {item.end} · {staffingRoleLabels[item.role]}
                {item.label ? ` · ${item.label}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No hay cobertura planificada en esas fechas. Esto no demuestra falta de dotación real.
          </p>
        ))}
    </section>
  );
}

function ObservedStaffingPanel({
  guardId,
  periods,
  canCreate,
  canEdit,
  busy,
  runAction,
}: {
  guardId: string;
  periods: StaffingView[];
  canCreate: boolean;
  canEdit: boolean;
  busy: boolean;
  runAction: (action: () => Promise<unknown>, success: string) => Promise<boolean>;
}) {
  const enter = useServerFn(enterEfaStaffing);
  const exit = useServerFn(exitEfaStaffing);
  const depart = useServerFn(departEfaStaffing);
  const arrive = useServerFn(arriveEfaStaffing);
  const [role, setRole] = useState<StaffingRole>("nurse");
  const [enteredAt, setEnteredAt] = useState(localNow);
  const [exitCauses, setExitCauses] = useState<Record<string, StaffingCause | "">>({});
  const [exitDescriptions, setExitDescriptions] = useState<Record<string, string>>({});
  const [exitTimes, setExitTimes] = useState<Record<string, string>>({});
  const [movementKinds, setMovementKinds] = useState<Record<string, "transfer" | "temporary">>({});
  const [movementCauses, setMovementCauses] = useState<Record<string, StaffingCause | "">>({});
  const [movementDescriptions, setMovementDescriptions] = useState<Record<string, string>>({});
  const [movementTimes, setMovementTimes] = useState<Record<string, string>>({});
  const pendingOperations = useRef(new Map<string, PendingStaffingOperation>());

  async function runIdempotentAction(
    scope: string,
    payload: unknown,
    action: (operationId: string) => Promise<unknown>,
    success: string,
  ) {
    const operationId = getStableStaffingOperationId(pendingOperations.current, scope, payload);
    if (await runAction(() => action(operationId), success)) {
      clearConfirmedStaffingOperation(pendingOperations.current, scope, operationId);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label="Dotación observada">
      <div>
        <h3 className="font-medium">Dotación observada</h3>
        <p className="text-sm text-muted-foreground">
          Registra hechos observados. Los datos faltantes no confirman ausencia y no representan una
          planificación.
        </p>
      </div>
      {canCreate && (
        <div className="grid gap-3 rounded-md bg-muted/40 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="grid gap-1 text-sm">
            Rol anónimo
            <select
              className="min-h-11 rounded-md border bg-background px-3"
              value={role}
              onChange={(event) => setRole(event.target.value as StaffingRole)}
            >
              {Object.entries(staffingRoleLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Hora de ingreso
            <input
              className="min-h-11 rounded-md border bg-background px-3"
              type="datetime-local"
              value={enteredAt}
              onChange={(event) => setEnteredAt(event.target.value)}
            />
          </label>
          <Button
            className="min-h-11"
            disabled={busy || !enteredAt}
            onClick={() => {
              const payload = { guardId, role, enteredAt: new Date(enteredAt).toISOString() };
              void runIdempotentAction(
                `entry:${guardId}`,
                payload,
                (clientOperationId) => enter({ data: { ...payload, clientOperationId } }),
                "El ingreso observado se registró.",
              );
            }}
          >
            Registrar ingreso
          </Button>
        </div>
      )}
      {periods.map((period) => {
        const openMovement = period.movements.find((movement) => !movement.arrivedAt);
        return (
          <article key={period.id} className="space-y-3 rounded-md border p-3">
            <div>
              <p className="font-medium">{staffingRoleLabels[period.role]} · registro anónimo</p>
              <p className="text-sm">Ingreso: {new Date(period.enteredAt).toLocaleString()}</p>
              <p className="text-sm">
                {period.exitedAt
                  ? `Egreso: ${new Date(period.exitedAt).toLocaleString()}`
                  : "Período en curso"}
              </p>
            </div>
            {period.movements.length > 0 && (
              <ul className="space-y-2 text-sm">
                {period.movements.map((movement) => (
                  <li key={movement.id} className="rounded border p-2">
                    {movement.kind === "transfer" ? "Traslado" : "Salida temporal"}: salida{" "}
                    {new Date(movement.departedAt).toLocaleString()}
                    {movement.arrivedAt
                      ? ` · ${movement.kind === "transfer" ? "llegada al destino" : "regreso"} ${new Date(movement.arrivedAt).toLocaleString()}`
                      : " · llegada o regreso pendiente"}
                    {movement.cause && ` · ${staffingCauseLabels[movement.cause]}`}
                    {movement.description && `: ${movement.description}`}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && !period.exitedAt && (
              <div className="grid gap-3 border-t pt-3">
                {!openMovement && (
                  <>
                    <fieldset className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr]" disabled={busy}>
                      <legend className="mb-1 text-sm font-medium">
                        Registrar salida observada
                      </legend>
                      <select
                        aria-label="Tipo de salida"
                        className="min-h-11 rounded-md border bg-background px-3"
                        value={movementKinds[period.id] ?? "transfer"}
                        onChange={(event) =>
                          setMovementKinds((current) => ({
                            ...current,
                            [period.id]: event.target.value as "transfer" | "temporary",
                          }))
                        }
                      >
                        <option value="transfer">Traslado</option>
                        <option value="temporary">Salida temporal</option>
                      </select>
                      <select
                        aria-label="Causa de salida"
                        className="min-h-11 rounded-md border bg-background px-3"
                        value={movementCauses[period.id] ?? ""}
                        onChange={(event) =>
                          setMovementCauses((current) => ({
                            ...current,
                            [period.id]: event.target.value as StaffingCause | "",
                          }))
                        }
                      >
                        <option value="">Sin causa informada</option>
                        {Object.entries(staffingCauseLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label="Hora de salida"
                        className="min-h-11 rounded-md border bg-background px-3"
                        type="datetime-local"
                        value={movementTimes[period.id] ?? localNow()}
                        onChange={(event) =>
                          setMovementTimes((current) => ({
                            ...current,
                            [period.id]: event.target.value,
                          }))
                        }
                      />
                    </fieldset>
                    {movementCauses[period.id] === "other" && (
                      <input
                        aria-label="Descripción de otra causa"
                        className="min-h-11 rounded-md border bg-background px-3"
                        maxLength={500}
                        value={movementDescriptions[period.id] ?? ""}
                        onChange={(event) =>
                          setMovementDescriptions((current) => ({
                            ...current,
                            [period.id]: event.target.value,
                          }))
                        }
                        placeholder="Describe la causa"
                      />
                    )}
                    <Button
                      variant="outline"
                      className="min-h-11 w-full sm:w-auto"
                      disabled={
                        busy ||
                        movementTimes[period.id] === "" ||
                        (movementCauses[period.id] === "other" &&
                          !movementDescriptions[period.id]?.trim())
                      }
                      onClick={() => {
                        const localDeparture = movementTimes[period.id] ?? localNow();
                        setMovementTimes((current) => ({
                          ...current,
                          [period.id]: localDeparture,
                        }));
                        const payload = {
                          periodId: period.id,
                          kind: movementKinds[period.id] ?? "transfer",
                          departedAt: new Date(localDeparture).toISOString(),
                          cause: movementCauses[period.id] || null,
                          description: movementDescriptions[period.id] || null,
                        };
                        void runIdempotentAction(
                          `departure:${period.id}`,
                          payload,
                          (clientOperationId) =>
                            depart({ data: { ...payload, clientOperationId } }),
                          "La salida observada quedó registrada.",
                        );
                      }}
                    >
                      Registrar salida
                    </Button>
                  </>
                )}
                {openMovement && (
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <label className="grid gap-1 text-sm">
                      {openMovement.kind === "transfer"
                        ? "Hora de llegada al destino"
                        : "Hora de regreso"}
                      <input
                        className="min-h-11 rounded-md border bg-background px-3"
                        type="datetime-local"
                        value={movementTimes[openMovement.id] ?? localNow()}
                        onChange={(event) =>
                          setMovementTimes((current) => ({
                            ...current,
                            [openMovement.id]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <Button
                      className="min-h-11"
                      disabled={busy}
                      onClick={() => {
                        const localArrival = movementTimes[openMovement.id] ?? localNow();
                        setMovementTimes((current) => ({
                          ...current,
                          [openMovement.id]: localArrival,
                        }));
                        const payload = {
                          movementId: openMovement.id,
                          arrivedAt: new Date(localArrival).toISOString(),
                        };
                        void runIdempotentAction(
                          `arrival:${openMovement.id}`,
                          payload,
                          () => arrive({ data: payload }),
                          openMovement.kind === "transfer"
                            ? "La llegada al destino quedó registrada."
                            : "El regreso quedó registrado.",
                        );
                      }}
                    >
                      {openMovement.kind === "transfer"
                        ? "Registrar llegada al destino"
                        : "Registrar regreso"}
                    </Button>
                  </div>
                )}
                {!openMovement && (
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <label className="grid gap-1 text-sm">
                      Causa al egreso (opcional)
                      <select
                        className="min-h-11 rounded-md border bg-background px-3"
                        value={exitCauses[period.id] ?? ""}
                        onChange={(event) =>
                          setExitCauses((current) => ({
                            ...current,
                            [period.id]: event.target.value as StaffingCause | "",
                          }))
                        }
                      >
                        <option value="">Sin causa informada</option>
                        {Object.entries(staffingCauseLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm">
                      Hora de egreso
                      <input
                        className="min-h-11 rounded-md border bg-background px-3"
                        type="datetime-local"
                        value={exitTimes[period.id] ?? localNow()}
                        onChange={(event) =>
                          setExitTimes((current) => ({
                            ...current,
                            [period.id]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <Button
                      variant="outline"
                      className="min-h-11"
                      disabled={
                        busy ||
                        (exitCauses[period.id] === "other" && !exitDescriptions[period.id]?.trim())
                      }
                      onClick={() => {
                        const localExit = exitTimes[period.id] ?? localNow();
                        setExitTimes((current) => ({ ...current, [period.id]: localExit }));
                        const payload = {
                          periodId: period.id,
                          expectedVersion: period.version,
                          exitedAt: new Date(localExit).toISOString(),
                          cause: exitCauses[period.id] || null,
                          description: exitDescriptions[period.id] || null,
                        };
                        void runIdempotentAction(
                          `exit:${period.id}`,
                          payload,
                          () => exit({ data: payload }),
                          "El egreso observado quedó registrado.",
                        );
                      }}
                    >
                      Registrar egreso
                    </Button>
                  </div>
                )}
                {exitCauses[period.id] === "other" && (
                  <input
                    aria-label="Descripción de otra causa de egreso"
                    className="min-h-11 rounded-md border bg-background px-3"
                    maxLength={500}
                    value={exitDescriptions[period.id] ?? ""}
                    onChange={(event) =>
                      setExitDescriptions((current) => ({
                        ...current,
                        [period.id]: event.target.value,
                      }))
                    }
                    placeholder="Describe la causa"
                  />
                )}
              </div>
            )}
          </article>
        );
      })}
      {periods.length === 0 && (
        <p className="rounded border border-dashed p-3 text-sm text-muted-foreground">
          Todavía no hay ingresos observados. No se infiere ausencia de personal.
        </p>
      )}
    </section>
  );
}

export function EfaGuardPanel({
  initialGuards,
  activeBases,
  initialStaffing,
  initialArrivals,
  initialHygiene,
  currentUserId,
  isAdmin,
  canWrite,
}: {
  initialGuards: GuardView[];
  activeBases: GuardBase[];
  initialStaffing: Record<string, StaffingView[]>;
  initialArrivals?: Record<string, MobileArrivalView[]>;
  initialHygiene?: Record<string, MobileHygieneView[]>;
  currentUserId: string;
  isAdmin: boolean;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const listGuards = useServerFn(listEfaGuards);
  const listBases = useServerFn(listActiveEfaGuardBases);
  const listStaffing = useServerFn(listEfaStaffing);
  const listArrivals = useServerFn(listEfaMobileArrivalsForGuard);
  const listHygiene = useServerFn(listEfaMobileHygieneForGuard);
  const startGuard = useServerFn(startEfaGuard);
  const updateBases = useServerFn(setEfaGuardBases);
  const endGuard = useServerFn(endEfaGuard);
  const [guards, setGuards] = useState(initialGuards);
  const [bases, setBases] = useState(activeBases);
  const [staffingByGuard, setStaffingByGuard] = useState(initialStaffing);
  const [arrivalsByGuard, setArrivalsByGuard] = useState(initialArrivals ?? {});
  const [hygieneByGuard, setHygieneByGuard] = useState(initialHygiene ?? {});
  const [centralConfirmed, setCentralConfirmed] = useState(false);
  const declarationId = useId();
  const [guardDetailsOpen, setGuardDetailsOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(initialGuards.map((guard) => [guard.id, false])),
  );
  const mobilesHeadingId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [observationGuardId, setObservationGuardId] = useState<string | null>(null);
  const [endingGuardTarget, setEndingGuardTarget] = useState<string | null>(null);

  async function refresh() {
    const [nextGuards, nextBases] = await Promise.all([
      listGuards(),
      canWrite ? listBases() : Promise.resolve([]),
    ]);
    const currentGuards = nextGuards as GuardView[];
    const guardEntries = await Promise.all(
      currentGuards.map(async (guard) => {
        const arrivals = await listArrivals({ data: guard.id });
        const hygiene = await listHygiene({ data: guard.id });
        const staffing = canWrite ? await listStaffing({ data: { guardId: guard.id } }) : [];
        return { id: guard.id, staffing, arrivals, hygiene };
      }),
    );
    setGuards(currentGuards);
    setBases(nextBases as GuardBase[]);
    setStaffingByGuard(
      Object.fromEntries(guardEntries.map(({ id, staffing }) => [id, staffing])) as Record<
        string,
        StaffingView[]
      >,
    );
    setArrivalsByGuard(
      Object.fromEntries(guardEntries.map(({ id, arrivals }) => [id, arrivals])) as Record<
        string,
        MobileArrivalView[]
      >,
    );
    setHygieneByGuard(
      Object.fromEntries(guardEntries.map(({ id, hygiene }) => [id, hygiene])) as Record<
        string,
        MobileHygieneView[]
      >,
    );
  }

  function upsertHygiene(guardId: string, period: MobileHygieneView) {
    setHygieneByGuard((current) => ({
      ...current,
      [guardId]: [...(current[guardId] ?? []).filter((item) => item.id !== period.id), period],
    }));
  }

  async function runAction(action: () => Promise<unknown>, success: string): Promise<boolean> {
    if (!canWrite || busy) return false;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["efa-panel-summary"] });
      await refresh();
      setMessage(success);
      return true;
    } catch {
      setError("No se pudo guardar el cambio. Actualizá la guardia e intentá nuevamente.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const openOwnGuard = guards.find(
    (guard) => guard.ownerUserId === currentUserId && !guard.endedAt,
  );
  const activeGuardRef = useRef<GuardView | undefined>(openOwnGuard);
  activeGuardRef.current = openOwnGuard;
  const serverFunctionsRef = useRef({ updateBases, listGuards, listArrivals });
  serverFunctionsRef.current = { updateBases, listGuards, listArrivals };
  const activeWorkspace = useMemo(() => {
    if (!openOwnGuard) return null;
    const guardId = openOwnGuard.id;
    const workspace = createEfaGuardMobileWorkspace<GuardBase, GuardView, MobileArrivalView>({
      initialGuard: openOwnGuard,
      writeMembership: (input) =>
        serverFunctionsRef.current.updateBases({ data: input }) as Promise<GuardView>,
      readGuard: async (id) => {
        const currentGuards = (await serverFunctionsRef.current.listGuards()) as GuardView[];
        return currentGuards.find((guard) => guard.id === id) ?? null;
      },
      readArrivals: async (id) =>
        (await serverFunctionsRef.current.listArrivals({ data: id })) as MobileArrivalView[],
      isCurrent: (id) => {
        const current = activeGuardRef.current;
        return (
          current?.id === id &&
          current.ownerUserId === currentUserId &&
          !current.endedAt &&
          canWrite
        );
      },
      onGuardConfirmed: (confirmed) => {
        void queryClient.invalidateQueries({ queryKey: ["efa-panel-summary"] });
        setGuards((current) =>
          current.map((guard) => (guard.id === guardId ? { ...guard, ...confirmed } : guard)),
        );
      },
      onArrivalsConfirmed: (id, nextArrivals) => {
        setArrivalsByGuard((current) => ({ ...current, [id]: nextArrivals }));
      },
    });
    return workspace;
  }, [openOwnGuard?.id, currentUserId, canWrite, queryClient]);
  const [workspaceSnapshot, setWorkspaceSnapshot] = useState<{
    guardId: string;
    snapshot: EfaGuardMobileWorkspaceSnapshot<GuardView, GuardBase>;
  } | null>(null);

  useEffect(() => {
    if (!activeWorkspace || !openOwnGuard) {
      setWorkspaceSnapshot(null);
      return;
    }
    const guardId = openOwnGuard.id;
    const updateSnapshot = () =>
      setWorkspaceSnapshot({ guardId, snapshot: activeWorkspace.getSnapshot() });
    updateSnapshot();
    const unsubscribe = activeWorkspace.subscribe(updateSnapshot);
    return () => {
      unsubscribe();
      activeWorkspace.dispose();
    };
  }, [activeWorkspace, openOwnGuard?.id]);

  const activeWorkspaceState =
    workspaceSnapshot && workspaceSnapshot.guardId === openOwnGuard?.id
      ? workspaceSnapshot.snapshot
      : activeWorkspace?.getSnapshot();
  const guardEndTargetKey =
    openOwnGuard && activeWorkspaceState
      ? `${currentUserId}:${openOwnGuard.id}:${activeWorkspaceState.confirmedGuard.version}`
      : null;
  const confirmEndGuard = (confirmedTargetKey: string) => {
    const workspace = activeWorkspace;
    const currentGuard = activeGuardRef.current;
    const snapshot = workspace?.getSnapshot();
    const currentTargetKey =
      currentGuard && snapshot
        ? `${currentUserId}:${currentGuard.id}:${snapshot.confirmedGuard.version}`
        : null;
    if (
      !isActionConfirmationCurrent(confirmedTargetKey, currentTargetKey) ||
      !canWrite ||
      busy ||
      !workspace ||
      !currentGuard ||
      currentGuard.ownerUserId !== currentUserId ||
      currentGuard.endedAt ||
      !activeWorkspaceState?.canClose ||
      !snapshot?.canClose ||
      snapshot.confirmedGuard.id !== currentGuard.id
    )
      return;
    const release = workspace.beginClose();
    if (!release) return;
    void runAction(
      () =>
        endGuard({
          data: {
            guardId: currentGuard.id,
            expectedVersion: snapshot.confirmedGuard.version,
          },
        }),
      "La guardia terminó manualmente.",
    ).finally(release);
  };
  const confirmedActiveGuard = activeWorkspaceState?.confirmedGuard ?? openOwnGuard;
  const mobileCatalog = confirmedActiveGuard
    ? [
        ...bases,
        ...confirmedActiveGuard.bases.filter((base) => !bases.some((item) => item.id === base.id)),
      ]
    : bases;

  return (
    <div className="min-w-0 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Mi guardia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-3 pt-0 sm:px-6">
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
          {!openOwnGuard && (
            // The card is the only surface: the start block groups by spacing, not borders.
            <div className="space-y-5">
              {canWrite && (
                <>
                  <GuardStartClock />
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-r-md border-l-4 border-[var(--brand-orange)] px-3 py-3 text-sm transition-colors has-[:checked]:bg-accent/40">
                    <input
                      className="mt-0.5 size-5 shrink-0 accent-primary"
                      type="checkbox"
                      checked={centralConfirmed}
                      onChange={(event) => setCentralConfirmed(event.target.checked)}
                    />
                    <span id={declarationId}>
                      Declaro que estoy en la Central al iniciar esta guardia.
                    </span>
                  </label>
                  <div className="space-y-2">
                    <Button
                      className="min-h-11 w-full sm:w-auto"
                      aria-describedby={declarationId}
                      disabled={busy || !canWrite || !centralConfirmed}
                      onClick={() =>
                        void runAction(async () => {
                          await startGuard({ data: { declaredAtCentral: true } });
                          setCentralConfirmed(false);
                        }, "La guardia se inició.")
                      }
                    >
                      {busy ? "Iniciando…" : "Iniciar guardia"}
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      Después vas a poder elegir los móviles y registrar las atenciones.
                    </p>
                  </div>
                </>
              )}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  El inicio y el cierre son manuales. La presencia es declarada: no usa GPS ni
                  verifica ubicación.
                </p>
                <Button asChild variant="link" className="min-h-11 px-0">
                  <Link to="/episodios-efa">Ver episodios de atención</Link>
                </Button>
              </div>
            </div>
          )}
          {openOwnGuard && (
            // Same single surface as the start block: status first, the frequent action next,
            // the mobiles in the middle and the irreversible close at the end.
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <GuardLiveStatus startedAt={openOwnGuard.startedAt} />
                <Button asChild className="min-h-11 w-full sm:w-auto">
                  <Link to="/episodios-efa">
                    {canWrite
                      ? "Registrar atenciones"
                      : "Consultar atenciones de la guardia abierta"}
                  </Link>
                </Button>
              </div>
              <section aria-labelledby={mobilesHeadingId} className="min-w-0 space-y-3 pt-2">
                <div className="space-y-1">
                  <h3
                    id={mobilesHeadingId}
                    className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
                  >
                    Móviles
                  </h3>
                  {canWrite && mobileCatalog.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Tocá un móvil para sumarlo o quitarlo de la guardia.
                    </p>
                  )}
                </div>
                <div className="min-w-0 space-y-2">
                  {canWrite && activeWorkspaceState?.unresolved && (
                    <div className="space-y-2" role="alert">
                      <p className="text-sm text-destructive">
                        No se pudo completar la sincronización de móviles; revisá el error del móvil
                        afectado.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        disabled={activeWorkspaceState.synchronizing}
                        onClick={() => void activeWorkspace?.reconcile()}
                      >
                        Reintentar sincronización
                      </Button>
                    </div>
                  )}
                  <EfaMobileArrivalPanel
                    key={openOwnGuard.id}
                    guardId={openOwnGuard.id}
                    bases={confirmedActiveGuard?.bases ?? openOwnGuard.bases}
                    availableBases={mobileCatalog}
                    requestedBaseIds={
                      activeWorkspaceState?.requestedBaseIds ??
                      confirmedActiveGuard?.bases.map((base) => base.id) ??
                      []
                    }
                    membershipPendingBaseIds={activeWorkspaceState?.pendingBaseIds ?? []}
                    membershipErrors={activeWorkspaceState?.errors ?? {}}
                    baseSelectionBlocked={!activeWorkspaceState?.canChangeBases}
                    membershipBlocked={!activeWorkspaceState?.canCapture}
                    onBaseSelectionChange={(baseId, selected) =>
                      void activeWorkspace?.requestBaseSelection(baseId, selected)
                    }
                    onArrivalMutationStart={(key) => activeWorkspace?.beginArrival(key) ?? null}
                    arrivals={arrivalsByGuard[openOwnGuard.id] ?? []}
                    hygienePeriods={hygieneByGuard[openOwnGuard.id] ?? []}
                    onHygieneChange={(period) => upsertHygiene(openOwnGuard.id, period)}
                    canWrite={canWrite}
                    onArrivalsChange={(arrival) =>
                      setArrivalsByGuard((current) => ({
                        ...current,
                        [openOwnGuard.id]: [
                          ...(current[openOwnGuard.id] ?? []).filter(
                            (item) => item.id !== arrival.id,
                          ),
                          arrival,
                        ],
                      }))
                    }
                  />
                </div>
              </section>
              <div className="space-y-2 border-t pt-4">
                <p className="text-sm text-muted-foreground">
                  Al terminar, la guardia no admite nuevos registros.
                </p>
                {/* Ghost base: the repo's outline variant carries its own fill. */}
                <Button
                  variant="ghost"
                  className="min-h-11 w-full border border-destructive font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
                  disabled={busy || !canWrite || !activeWorkspaceState?.canClose}
                  onClick={() => setEndingGuardTarget(guardEndTargetKey)}
                >
                  Terminar guardia
                </Button>
              </div>
              <EfaActionConfirmation
                open={endingGuardTarget !== null}
                onOpenChange={(open) => {
                  if (!open) setEndingGuardTarget(null);
                }}
                capturedTargetKey={endingGuardTarget}
                currentTargetKey={guardEndTargetKey}
                title="Terminar guardia"
                description="La guardia finalizará con la hora actual y no admitirá nuevos registros. El historial seguirá disponible."
                confirmLabel="Terminar guardia"
                onConfirm={confirmEndGuard}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mis guardias</CardTitle>
          <p className="text-sm text-muted-foreground">Solo se muestran guardias propias.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {guards.map((guard) => {
            const detailsOpen = guardDetailsOpen[guard.id] ?? false;
            return (
              <article key={guard.id} className="min-w-0 space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span
                    className={`inline-flex min-h-7 items-center rounded-full px-2 text-xs font-medium ${
                      guard.endedAt
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    {guard.endedAt ? "Finalizada" : "En curso"}
                  </span>
                  <p className="text-sm">
                    Inicio: {formatDateTimeMinutes(guard.startedAt)}
                    {guard.endedAt && ` · Fin: ${formatDateTimeMinutes(guard.endedAt)}`}
                  </p>
                </div>
                <details
                  className="min-w-0 space-y-3"
                  open={detailsOpen}
                  onToggle={(event) => {
                    const nextOpen = event.currentTarget.open;
                    setGuardDetailsOpen((current) =>
                      current[guard.id] === nextOpen
                        ? current
                        : { ...current, [guard.id]: nextOpen },
                    );
                  }}
                >
                  <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
                    {detailsOpen ? "Ocultar detalles" : "Ver detalles"}
                  </summary>
                  <div className="min-w-0 space-y-3">
                    <div className="text-sm">
                      <p>Inicio: {new Date(guard.startedAt).toLocaleString()}</p>
                      {guard.endedAt && <p>Fin: {new Date(guard.endedAt).toLocaleString()}</p>}
                      <p className="text-xs text-muted-foreground">
                        Presencia declarada en Central · versión {guard.version}
                      </p>
                    </div>
                    <div className="min-w-0 space-y-1 text-sm">
                      <p className="font-medium">Bases seguidas</p>
                      <p>
                        {guard.bases.length
                          ? guard.bases.map((base) => base.name).join(", ")
                          : "Sin base activa"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      onClick={() => setObservationGuardId(guard.id)}
                    >
                      Ver conductas observadas
                    </Button>
                    {observationGuardId === guard.id && (
                      <section key={`${currentUserId}:${guard.id}`} className="space-y-3">
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          onClick={() => setObservationGuardId(null)}
                        >
                          Cerrar conductas observadas
                        </Button>
                        <EfaObservationPanel
                          root={{
                            guardId: guard.id,
                            ownerUserId: guard.ownerUserId,
                            guardEndedAt: guard.endedAt,
                          }}
                          title="Conductas observadas de la guardia"
                          currentUserId={currentUserId}
                          canWrite={canWrite && guard.ownerUserId === currentUserId}
                          isAdmin={isAdmin}
                        />
                      </section>
                    )}
                    {guard.baseEvents.length > 0 && (
                      <details>
                        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
                          Historial de cambios de base
                        </summary>
                        <ul className="space-y-2 pl-5 text-sm">
                          {guard.baseEvents.map((event, index) => (
                            <li key={`${event.baseId}-${event.action}-${index}`}>
                              {event.action === "added" ? "Agregó" : "Quitó"} {event.baseName} ·{" "}
                              {new Date(event.occurredAt).toLocaleString()} ·{" "}
                              {event.actorUserId === currentUserId ? "por vos" : "por otra cuenta"}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {canWrite && <PlannedCoverageReadOnly bases={guard.bases} />}
                    {guard.id !== openOwnGuard?.id && (
                      <EfaMobileArrivalPanel
                        key={guard.id}
                        guardId={guard.id}
                        bases={guard.bases}
                        arrivals={arrivalsByGuard[guard.id] ?? []}
                        hygienePeriods={hygieneByGuard[guard.id] ?? []}
                        onHygieneChange={(period) => upsertHygiene(guard.id, period)}
                        canWrite={canWrite && guard.ownerUserId === currentUserId && !guard.endedAt}
                        onArrivalsChange={(arrival) =>
                          setArrivalsByGuard((current) => ({
                            ...current,
                            [guard.id]: [
                              ...(current[guard.id] ?? []).filter((item) => item.id !== arrival.id),
                              arrival,
                            ],
                          }))
                        }
                      />
                    )}
                    <ObservedStaffingPanel
                      guardId={guard.id}
                      periods={staffingByGuard[guard.id] ?? []}
                      canEdit={canWrite && guard.ownerUserId === currentUserId}
                      canCreate={canWrite && guard.ownerUserId === currentUserId && !guard.endedAt}
                      busy={busy}
                      runAction={runAction}
                    />
                  </div>
                </details>
              </article>
            );
          })}
          {guards.length === 0 && (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Todavía no hay guardias registradas.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
