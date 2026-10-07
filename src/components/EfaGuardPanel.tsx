import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
  correctEfaGuardEnd,
  endEfaGuard,
  listActiveEfaGuardBases,
  listEfaGuards,
  setEfaGuardBases,
  startEfaGuard,
} from "@/lib/efa-guards.functions";

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
  currentUserId,
  isAdmin,
  canWrite,
}: {
  initialGuards: GuardView[];
  activeBases: GuardBase[];
  initialStaffing: Record<string, StaffingView[]>;
  currentUserId: string;
  isAdmin: boolean;
  canWrite: boolean;
}) {
  const listGuards = useServerFn(listEfaGuards);
  const listBases = useServerFn(listActiveEfaGuardBases);
  const listStaffing = useServerFn(listEfaStaffing);
  const startGuard = useServerFn(startEfaGuard);
  const updateBases = useServerFn(setEfaGuardBases);
  const endGuard = useServerFn(endEfaGuard);
  const correctGuardEnd = useServerFn(correctEfaGuardEnd);
  const [guards, setGuards] = useState(initialGuards);
  const [bases, setBases] = useState(activeBases);
  const [staffingByGuard, setStaffingByGuard] = useState(initialStaffing);
  const [selectedBaseIds, setSelectedBaseIds] = useState<string[]>(() => {
    const openOwnGuard = initialGuards.find(
      (guard) => guard.ownerUserId === currentUserId && !guard.endedAt,
    );
    return openOwnGuard?.bases.map((base) => base.id) ?? [];
  });
  const [centralConfirmed, setCentralConfirmed] = useState(false);
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [observationGuardId, setObservationGuardId] = useState<string | null>(null);

  async function refresh() {
    const [nextGuards, nextBases] = await Promise.all([
      listGuards(),
      canWrite ? listBases() : Promise.resolve([]),
    ]);
    const currentGuards = nextGuards as GuardView[];
    const staffingEntries = canWrite
      ? await Promise.all(
          currentGuards.map(
            async (guard) =>
              [guard.id, await listStaffing({ data: { guardId: guard.id } })] as const,
          ),
        )
      : [];
    setGuards(currentGuards);
    setBases(nextBases as GuardBase[]);
    setStaffingByGuard(Object.fromEntries(staffingEntries) as Record<string, StaffingView[]>);
    const open = currentGuards.find(
      (guard) => guard.ownerUserId === currentUserId && !guard.endedAt,
    );
    setSelectedBaseIds(open?.bases.map((base) => base.id) ?? []);
  }

  async function runAction(action: () => Promise<unknown>, success: string): Promise<boolean> {
    if (!canWrite || busy) return false;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      await refresh();
      setMessage(success);
      return true;
    } catch {
      setError("No se pudo guardar el cambio. Actualiza la guardia e inténtalo nuevamente.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const openOwnGuard = guards.find(
    (guard) => guard.ownerUserId === currentUserId && !guard.endedAt,
  );

  return (
    <div className="space-y-5">
      <Button asChild variant="outline" className="min-h-11">
        <Link to="/episodios-efa">Ver episodios de atención</Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Guardia EFA</CardTitle>
          <p className="text-sm text-muted-foreground">
            El inicio y el cierre son manuales. La declaración de presencia no usa GPS ni verifica
            ubicación.
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
          {!openOwnGuard && canWrite && (
            <div className="space-y-4 rounded-lg border p-4">
              <p className="font-medium">Iniciar una guardia</p>
              <label className="flex min-h-11 items-start gap-3 text-sm">
                <input
                  className="mt-1 size-5 accent-primary"
                  type="checkbox"
                  checked={centralConfirmed}
                  onChange={(event) => setCentralConfirmed(event.target.checked)}
                />
                <span>Declaro que estoy en la Central al iniciar esta guardia.</span>
              </label>
              <Button
                className="min-h-11 w-full sm:w-auto"
                disabled={busy || !canWrite || !centralConfirmed}
                onClick={() =>
                  void runAction(async () => {
                    await startGuard({ data: { declaredAtCentral: true } });
                    setCentralConfirmed(false);
                  }, "La guardia se inició.")
                }
              >
                Iniciar guardia
              </Button>
            </div>
          )}
          {openOwnGuard && (
            <div className="space-y-4 rounded-lg border p-4">
              <div>
                <p className="font-medium">Guardia en curso</p>
                <p className="text-sm text-muted-foreground">
                  Inicio: {new Date(openOwnGuard.startedAt).toLocaleString()} · Presencia declarada
                  en Central
                </p>
              </div>
              <fieldset className="space-y-3" disabled={busy || !canWrite}>
                <legend className="text-sm font-medium">Bases seguidas</legend>
                {(canWrite ? bases : openOwnGuard.bases).map((base) => (
                  <label
                    key={base.id}
                    className="flex min-h-11 items-center gap-3 rounded-md border p-3 text-sm"
                  >
                    <input
                      className="size-5 accent-primary"
                      type="checkbox"
                      checked={selectedBaseIds.includes(base.id)}
                      onChange={(event) =>
                        setSelectedBaseIds((current) =>
                          event.target.checked
                            ? [...current, base.id]
                            : current.filter((id) => id !== base.id),
                        )
                      }
                    />
                    <span>{base.name}</span>
                  </label>
                ))}
                {canWrite && bases.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No hay bases activas en el catálogo.
                  </p>
                )}
              </fieldset>
              {canWrite && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Selecciona al menos una base. Cada alta o baja queda registrada con su autor y
                    hora.
                  </p>
                  <Button
                    variant="outline"
                    className="min-h-11 w-full sm:w-auto"
                    disabled={
                      busy ||
                      selectedBaseIds.length === 0 ||
                      (selectedBaseIds.length === openOwnGuard.bases.length &&
                        selectedBaseIds.every((id) =>
                          openOwnGuard.bases.some((base) => base.id === id),
                        ))
                    }
                    onClick={() =>
                      void runAction(
                        () =>
                          updateBases({
                            data: {
                              guardId: openOwnGuard.id,
                              expectedVersion: openOwnGuard.version,
                              baseIds: selectedBaseIds,
                            },
                          }),
                        "Las bases seguidas se actualizaron.",
                      )
                    }
                  >
                    Guardar bases
                  </Button>
                </>
              )}
              <Button
                variant="destructive"
                className="min-h-11 w-full sm:w-auto"
                disabled={busy || !canWrite}
                onClick={() =>
                  void runAction(
                    () =>
                      endGuard({
                        data: { guardId: openOwnGuard.id, expectedVersion: openOwnGuard.version },
                      }),
                    "La guardia terminó manualmente.",
                  )
                }
              >
                Terminar guardia
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isAdmin ? "Historial de guardias" : "Mis guardias"}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Administración puede consultar todas las guardias y corregir su hora de cierre."
              : "Solo se muestran guardias propias."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {guards.map((guard) => (
            <article key={guard.id} className="space-y-3 rounded-lg border p-4">
              <div>
                {isAdmin && <p className="text-sm font-medium">Responsable: {guard.ownerUserId}</p>}
                <p className="text-sm">Inicio: {new Date(guard.startedAt).toLocaleString()}</p>
                <p className="text-sm">
                  {guard.endedAt ? `Fin: ${new Date(guard.endedAt).toLocaleString()}` : "En curso"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Presencia declarada en Central · versión {guard.version}
                </p>
              </div>
              <div className="space-y-1 text-sm">
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
                    canWrite={canWrite && (isAdmin || guard.ownerUserId === currentUserId)}
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
                        {new Date(event.occurredAt).toLocaleString()} · actor {event.actorUserId}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {isAdmin && canWrite && guard.endedAt && (
                <div className="space-y-2 border-t pt-3">
                  <Label htmlFor={`guard-end-${guard.id}`}>Corregir hora de cierre</Label>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <input
                      id={`guard-end-${guard.id}`}
                      className="min-h-11 rounded-md border bg-background px-3 text-sm"
                      type="datetime-local"
                      value={corrections[guard.id] ?? toLocalDateTimeValue(guard.endedAt)}
                      onChange={(event) =>
                        setCorrections((current) => ({
                          ...current,
                          [guard.id]: event.target.value,
                        }))
                      }
                    />
                    <Button
                      variant="outline"
                      className="min-h-11"
                      disabled={
                        busy ||
                        !canWrite ||
                        !corrections[guard.id] ||
                        new Date(corrections[guard.id]!).getTime() ===
                          new Date(guard.endedAt).getTime()
                      }
                      onClick={() =>
                        void runAction(
                          () =>
                            correctGuardEnd({
                              data: {
                                guardId: guard.id,
                                expectedVersion: guard.version,
                                endedAt: new Date(corrections[guard.id]!).toISOString(),
                              },
                            }),
                          "La hora de cierre se corrigió y quedó en el historial.",
                        )
                      }
                    >
                      Guardar corrección
                    </Button>
                  </div>
                </div>
              )}
              <ObservedStaffingPanel
                guardId={guard.id}
                periods={staffingByGuard[guard.id] ?? []}
                canEdit={canWrite && (isAdmin || guard.ownerUserId === currentUserId)}
                canCreate={
                  canWrite && (isAdmin || guard.ownerUserId === currentUserId) && !guard.endedAt
                }
                busy={busy}
                runAction={runAction}
              />
            </article>
          ))}
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
