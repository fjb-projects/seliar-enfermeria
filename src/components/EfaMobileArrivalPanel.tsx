import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import type { GuardBase } from "@/components/EfaGuardPanel";
import {
  createEfaMobileArrival,
  deleteEfaMobileArrival,
  updateEfaMobileArrival,
} from "@/lib/efa-mobile-arrivals.functions";
import type { MobileArrivalRole } from "@/lib/efa-mobile-arrivals.server";

export type MobileArrivalView = {
  id: string;
  guardId: string;
  baseId: string;
  baseNameSnapshot: string;
  role: MobileArrivalRole;
  arrivedAt: string;
  deletedAt: string | null;
  version: number;
  canEdit: boolean;
};

type PendingArrivalOperation = { fingerprint: string; id: string };
type SecureCrypto = Pick<Crypto, "getRandomValues"> & Partial<Pick<Crypto, "randomUUID">>;

export function createSecureOperationId(source: SecureCrypto | undefined = globalThis.crypto) {
  if (!source) throw new Error("A secure random source is required for this operation.");
  if (typeof source.randomUUID === "function") {
    try {
      return source.randomUUID();
    } catch {
      // Fall through to getRandomValues, which provides the same cryptographic guarantee.
    }
  }
  if (typeof source.getRandomValues !== "function") {
    throw new Error("A secure random source is required for this operation.");
  }

  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function parseLocalArrivalTimestamp(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(
    value,
  );
  if (!match) return null;

  const [, yearPart, monthPart, dayPart, hourPart, minutePart, secondPart = "0"] = match;
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  const hour = Number(hourPart);
  const minute = Number(minutePart);
  const second = Number(secondPart);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    return null;

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function getStableArrivalOperation(
  pending: Map<string, PendingArrivalOperation>,
  scope: string,
  payload: unknown,
  createId: () => string = createSecureOperationId,
) {
  const fingerprint = JSON.stringify(payload);
  const current = pending.get(scope);
  if (current?.fingerprint === fingerprint) return current.id;
  const id = createId();
  pending.set(scope, { fingerprint, id });
  return id;
}

export function clearConfirmedArrivalOperation(
  pending: Map<string, PendingArrivalOperation>,
  scope: string,
  id: string,
) {
  if (pending.get(scope)?.id === id) pending.delete(scope);
}

export function setBusyArrivalOperation(current: ReadonlySet<string>, key: string, busy: boolean) {
  const next = new Set(current);
  if (busy) next.add(key);
  else next.delete(key);
  return next;
}

const roles: { id: MobileArrivalRole; label: string }[] = [
  { id: "nurse", label: "Enfermería" },
  { id: "driver", label: "Conducción" },
  { id: "doctor", label: "Medicina" },
];

export const mobileArrivalEditClasses = {
  row: "grid min-w-0 gap-2 border-t py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
  content: "min-w-0",
  form: "mt-2 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]",
  label: "grid min-w-0 gap-1 text-xs text-muted-foreground",
  input:
    "min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3 text-sm text-foreground",
} as const;

function toLocalDateTimeValue(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function EfaMobileArrivalPanel({
  guardId,
  bases,
  arrivals,
  canWrite,
  onArrivalsChange,
  expandBasesByDefault = false,
}: {
  guardId: string;
  bases: GuardBase[];
  arrivals: MobileArrivalView[];
  canWrite: boolean;
  onArrivalsChange: (arrival: MobileArrivalView) => void;
  expandBasesByDefault?: boolean;
}) {
  const createArrival = useServerFn(createEfaMobileArrival);
  const updateArrival = useServerFn(updateEfaMobileArrival);
  const deleteArrival = useServerFn(deleteEfaMobileArrival);
  const pendingOperations = useRef(new Map<string, PendingArrivalOperation>());
  const inFlight = useRef(new Set<string>());
  const [busyKeys, setBusyKeys] = useState<Set<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [expandedBaseIds, setExpandedBaseIds] = useState<Set<string>>(() =>
    expandBasesByDefault ? new Set(bases.map((base) => base.id)) : new Set(),
  );
  const [collapsedBaseIds, setCollapsedBaseIds] = useState<Set<string>>(() => new Set());

  const selectedBaseIds = new Set(bases.map((base) => base.id));
  const historicalArrivals = arrivals.filter(
    (arrival) =>
      arrival.deletedAt === null &&
      arrival.guardId === guardId &&
      !selectedBaseIds.has(arrival.baseId),
  );

  function reportError(key: string, message: string) {
    setErrors((current) => ({ ...current, [key]: message }));
  }

  async function runOperation(
    key: string,
    scope: string,
    payload: unknown,
    action: (operationId: string, creationKey?: string) => Promise<MobileArrivalView>,
    creationScope?: string,
  ): Promise<boolean> {
    if (inFlight.current.has(key)) return false;
    inFlight.current.add(key);
    setBusyKeys((current) => setBusyArrivalOperation(current, key, true));
    setErrors((current) => ({ ...current, [key]: "" }));
    try {
      const operationId = getStableArrivalOperation(pendingOperations.current, scope, payload);
      const creationKey = creationScope
        ? getStableArrivalOperation(pendingOperations.current, creationScope, payload)
        : undefined;
      const saved = await action(operationId, creationKey);
      onArrivalsChange(saved);
      clearConfirmedArrivalOperation(pendingOperations.current, scope, operationId);
      if (creationScope && creationKey)
        clearConfirmedArrivalOperation(pendingOperations.current, creationScope, creationKey);
      setErrors((current) => ({ ...current, [key]: "" }));
      return true;
    } catch {
      reportError(key, "No se pudo guardar el cambio. Reintenta esta acción.");
      return false;
    } finally {
      inFlight.current.delete(key);
      setBusyKeys((current) => setBusyArrivalOperation(current, key, false));
    }
  }

  function activeArrival(baseId: string, role: MobileArrivalRole) {
    return arrivals.find(
      (arrival) =>
        arrival.guardId === guardId &&
        arrival.baseId === baseId &&
        arrival.role === role &&
        arrival.deletedAt === null,
    );
  }

  function register(baseId: string, role: MobileArrivalRole) {
    const key = `${baseId}:${role}:create`;
    const payload = { guardId, baseId, role };
    void runOperation(
      key,
      `create:${key}`,
      payload,
      async (operationId, clientCreationKey) => {
        if (!clientCreationKey) throw new Error("A creation key is required.");
        const result = (await createArrival({
          data: { ...payload, operationId, clientCreationKey },
        })) as { arrival: MobileArrivalView };
        return result.arrival;
      },
      `creation:${key}`,
    );
  }

  function saveEdit(arrival: MobileArrivalView) {
    const key = `${arrival.id}:update`;
    const arrivedAt = parseLocalArrivalTimestamp(editValue);
    if (!arrivedAt) {
      reportError(key, "Ingresá una fecha y hora válidas.");
      return;
    }
    const payload = { arrivalId: arrival.id, expectedVersion: arrival.version, arrivedAt };
    void runOperation(key, `update:${arrival.id}`, payload, async (operationId) => {
      const result = (await updateArrival({ data: { ...payload, operationId } })) as {
        arrival: MobileArrivalView;
      };
      return result.arrival;
    }).then((saved) => {
      if (saved) setEditingId(null);
    });
  }

  function remove(arrival: MobileArrivalView) {
    if (
      !window.confirm(
        `¿Eliminar el ingreso de ${arrival.baseNameSnapshot} · ${roles.find((role) => role.id === arrival.role)?.label}?`,
      )
    )
      return;
    const key = `${arrival.id}:delete`;
    const payload = { arrivalId: arrival.id, expectedVersion: arrival.version };
    void runOperation(key, `delete:${arrival.id}`, payload, async (operationId) => {
      const result = (await deleteArrival({ data: { ...payload, operationId } })) as {
        arrival: MobileArrivalView;
      };
      return result.arrival;
    });
  }

  function renderRoleRow(base: GuardBase, role: (typeof roles)[number]) {
    const arrival = activeArrival(base.id, role.id);
    const createKey = `${base.id}:${role.id}:create`;
    const updateKey = `${arrival?.id}:update`;
    const deleteKey = `${arrival?.id}:delete`;
    const createBusy = busyKeys.has(createKey);
    const updateBusy = busyKeys.has(updateKey);
    const deleteBusy = busyKeys.has(deleteKey);
    const editable = Boolean(canWrite && arrival?.canEdit);
    return (
      <div key={role.id} className={mobileArrivalEditClasses.row}>
        <div className={mobileArrivalEditClasses.content}>
          <p className="font-medium">{role.label}</p>
          {arrival ? (
            editingId === arrival.id ? (
              <div className={mobileArrivalEditClasses.form}>
                <label className={mobileArrivalEditClasses.label}>
                  Hora de ingreso
                  <input
                    className={mobileArrivalEditClasses.input}
                    type="datetime-local"
                    value={editValue}
                    onChange={(event) => setEditValue(event.target.value)}
                  />
                </label>
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={!editValue || updateBusy}
                  onClick={() => saveEdit(arrival)}
                >
                  {updateBusy ? "Guardando…" : "Guardar"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={updateBusy}
                  onClick={() => setEditingId(null)}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <time dateTime={arrival.arrivedAt} className="text-muted-foreground">
                {new Date(arrival.arrivedAt).toLocaleString()}
              </time>
            )
          ) : (
            <p className="text-muted-foreground">Sin ingreso registrado</p>
          )}
          {(errors[createKey] || errors[updateKey] || errors[deleteKey]) && (
            <p role="alert" className="mt-1 text-sm text-destructive">
              {errors[createKey] || errors[updateKey] || errors[deleteKey]}
            </p>
          )}
        </div>
        {!arrival && canWrite && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full sm:w-auto"
            disabled={createBusy}
            onClick={() => register(base.id, role.id)}
          >
            {createBusy ? "Registrando…" : "Registrar ingreso"}
          </Button>
        )}
        {arrival && editable && editingId !== arrival.id && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={updateBusy || deleteBusy}
              onClick={() => {
                setEditValue(toLocalDateTimeValue(arrival.arrivedAt));
                setEditingId(arrival.id);
                setErrors((current) => ({ ...current, [updateKey]: "" }));
              }}
            >
              Editar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              disabled={updateBusy || deleteBusy}
              onClick={() => remove(arrival)}
            >
              {deleteBusy ? "Eliminando…" : "Eliminar"}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="space-y-2" aria-label="Ingresos por móvil">
      <h3 className="text-sm font-medium">Ingreso de móviles</h3>
      {bases.map((base) => (
        <details
          key={base.id}
          open={
            expandBasesByDefault ? !collapsedBaseIds.has(base.id) : expandedBaseIds.has(base.id)
          }
          onToggle={(event) => {
            const nextOpen = event.currentTarget.open;
            if (expandBasesByDefault) {
              setCollapsedBaseIds((current) => {
                const next = new Set(current);
                if (nextOpen) next.delete(base.id);
                else next.add(base.id);
                return next;
              });
            } else {
              setExpandedBaseIds((current) => {
                const next = new Set(current);
                if (nextOpen) next.add(base.id);
                else next.delete(base.id);
                return next;
              });
            }
          }}
          className="rounded-md border px-3"
        >
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
            {base.name}
          </summary>
          <div className="pb-2">{roles.map((role) => renderRoleRow(base, role))}</div>
        </details>
      ))}
      {historicalArrivals.length > 0 && (
        <details className="rounded-md border px-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
            Ingresos históricos de móviles sin seleccionar
          </summary>
          <ul className="space-y-2 pb-3 text-sm">
            {historicalArrivals.map((arrival) => (
              <li key={arrival.id}>
                {arrival.baseNameSnapshot} · {roles.find((role) => role.id === arrival.role)?.label}{" "}
                ·{" "}
                <time dateTime={arrival.arrivedAt}>
                  {new Date(arrival.arrivedAt).toLocaleString()}
                </time>
                <span className="ml-2 text-xs text-muted-foreground">Solo lectura</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {bases.length === 0 && historicalArrivals.length === 0 && (
        <p className="rounded border border-dashed p-3 text-sm text-muted-foreground">
          No hay ingresos de móviles para esta guardia.
        </p>
      )}
    </section>
  );
}
