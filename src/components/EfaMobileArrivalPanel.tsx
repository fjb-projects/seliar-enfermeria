import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EfaActionConfirmation } from "@/components/EfaActionConfirmation";
import type { GuardBase } from "@/components/EfaGuardPanel";
import { cn } from "@/lib/utils";
import {
  createEfaMobileArrival,
  deleteEfaMobileArrival,
  updateEfaMobileArrival,
} from "@/lib/efa-mobile-arrivals.functions";
import type { MobileArrivalRole } from "@/lib/efa-mobile-arrivals.server";
import { sortGuardMobileBases } from "@/lib/efa-guard-mobile-workspace";
import { EfaMobileHygienePanel, type MobileHygieneView } from "@/components/EfaMobileHygienePanel";

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
  row: "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t py-2 text-sm",
  editingRow: "grid min-w-0 grid-cols-1 gap-2 border-t py-2 text-sm",
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

/**
 * Removing a mobile keeps its records: active arrivals move to the read-only historical list and
 * hygiene periods stop showing, until the mobile is added back. Returns the warning to confirm,
 * or null when the mobile has nothing recorded in this guard and can be removed right away.
 */
export function getMobileRemovalConfirmation({
  guardId,
  base,
  arrivals,
  hygienePeriods = [],
}: {
  guardId: string;
  base: GuardBase;
  arrivals: MobileArrivalView[];
  hygienePeriods?: MobileHygieneView[] | undefined;
}): string | null {
  const ownsRecord = (record: { guardId: string; baseId: string; deletedAt: string | null }) =>
    record.guardId === guardId && record.baseId === base.id && record.deletedAt === null;
  const hasArrivals = arrivals.some(ownsRecord);
  const hasHygiene = hygienePeriods.some(ownsRecord);
  if (!hasArrivals && !hasHygiene) return null;

  const name = `Móvil ${base.name}`;
  const comeBack = base.isActive
    ? "Nada se borra: si lo volvés a sumar, vuelven a aparecer."
    : "Nada se borra, pero este móvil ya no está disponible y no vas a poder volver a sumarlo.";
  if (hasArrivals && hasHygiene)
    return `${name} tiene ingresos y períodos de higiene registrados en esta guardia. Si lo quitás, los ingresos pasan a “Ingresos históricos” como solo lectura y la higiene deja de mostrarse acá. ${comeBack}`;
  if (hasArrivals)
    return `${name} tiene ingresos registrados en esta guardia. Si lo quitás, esos ingresos pasan a “Ingresos históricos” como solo lectura y no se pueden editar desde acá. ${comeBack}`;
  return `${name} tiene períodos de higiene y reposición registrados en esta guardia. Si lo quitás, dejan de mostrarse acá. ${comeBack}`;
}

const mobileChipClasses = {
  base: "inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border px-4 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
  selected: "border-primary bg-primary text-primary-foreground",
  unselected:
    "border-dashed border-muted-foreground/50 text-muted-foreground enabled:hover:bg-accent enabled:hover:text-accent-foreground",
} as const;

export function EfaMobileArrivalPanel({
  guardId,
  bases,
  availableBases = bases,
  requestedBaseIds,
  membershipPendingBaseIds = [],
  membershipErrors = {},
  baseSelectionBlocked = false,
  membershipBlocked = false,
  onBaseSelectionChange,
  onArrivalMutationStart,
  arrivals,
  canWrite,
  onArrivalsChange,
  hygienePeriods,
  onHygieneChange,
}: {
  guardId: string;
  bases: GuardBase[];
  availableBases?: GuardBase[];
  requestedBaseIds?: string[];
  membershipPendingBaseIds?: string[];
  membershipErrors?: Record<string, string>;
  baseSelectionBlocked?: boolean;
  membershipBlocked?: boolean;
  onBaseSelectionChange?: (baseId: string, selected: boolean) => void;
  onArrivalMutationStart?: (key: string) => (() => void) | null;
  arrivals: MobileArrivalView[];
  canWrite: boolean;
  onArrivalsChange: (arrival: MobileArrivalView) => void;
  /** When both hygiene props are given, each selected mobile card shows its hygiene periods. */
  hygienePeriods?: MobileHygieneView[];
  onHygieneChange?: (period: MobileHygieneView) => void;
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
  const [removalBaseId, setRemovalBaseId] = useState<string | null>(null);

  const selectedBaseIds = new Set(bases.map((base) => base.id));
  const requested = new Set(requestedBaseIds ?? bases.map((base) => base.id));
  const pendingBaseSet = new Set(membershipPendingBaseIds);
  const sortedBases = sortGuardMobileBases(availableBases);
  const requestedBases = sortedBases.filter((base) => requested.has(base.id));
  // Toggle chips need someone allowed to write and a membership handler; otherwise the guard's
  // mobiles show as static tags.
  const selectionEditable = canWrite && Boolean(onBaseSelectionChange);
  const historicalArrivals = arrivals.filter(
    (arrival) =>
      arrival.deletedAt === null &&
      arrival.guardId === guardId &&
      !selectedBaseIds.has(arrival.baseId),
  );
  const removalBase = sortedBases.find((base) => base.id === removalBaseId);
  const removalTargetKey = removalBase ? `${guardId}:${removalBase.id}` : null;
  // The dialog closes on its own if the mobile left the selection while it was open.
  const currentRemovalKey =
    removalBase && requested.has(removalBase.id) ? `${guardId}:${removalBase.id}` : null;

  function toggleBase(base: GuardBase, selected: boolean) {
    if (!onBaseSelectionChange) return;
    if (
      selected &&
      getMobileRemovalConfirmation({ guardId, base, arrivals, hygienePeriods }) !== null
    ) {
      setRemovalBaseId(base.id);
      return;
    }
    onBaseSelectionChange(base.id, !selected);
  }

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
    const releaseAdmission = onArrivalMutationStart?.(key);
    if (onArrivalMutationStart && !releaseAdmission) {
      reportError(
        key,
        "Espera a que termine la sincronización de móviles antes de cambiar ingresos.",
      );
      return false;
    }
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
      releaseAdmission?.();
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
    const isEditing = Boolean(arrival && editingId === arrival.id);
    const rowBlocked = membershipBlocked || pendingBaseSet.has(base.id);
    return (
      <div
        key={role.id}
        className={isEditing ? mobileArrivalEditClasses.editingRow : mobileArrivalEditClasses.row}
      >
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
                  disabled={!editValue || updateBusy || rowBlocked}
                  onClick={() => saveEdit(arrival)}
                >
                  {updateBusy ? "Guardando…" : "Guardar"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={updateBusy || rowBlocked}
                  onClick={() => setEditingId(null)}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <time
                dateTime={arrival.arrivedAt}
                aria-label={`Ingreso registrado el ${new Date(arrival.arrivedAt).toLocaleString("es-AR")}`}
                className="text-muted-foreground"
              >
                {new Date(arrival.arrivedAt).toLocaleTimeString("es-AR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            )
          ) : !canWrite ? (
            <p className="text-muted-foreground">Sin ingreso registrado</p>
          ) : null}
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
            className="min-h-11 shrink-0 px-2 sm:px-4"
            disabled={createBusy || rowBlocked}
            onClick={() => register(base.id, role.id)}
          >
            {createBusy ? "Registrando…" : "Registrar ingreso"}
          </Button>
        )}
        {arrival && editable && editingId !== arrival.id && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 px-2 sm:px-4"
              disabled={updateBusy || deleteBusy || rowBlocked}
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
              className="min-h-11 px-2 sm:px-4"
              disabled={updateBusy || deleteBusy || rowBlocked}
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
    <section className="space-y-3" aria-label="Móviles">
      {selectionEditable && sortedBases.length > 0 && (
        <div role="group" aria-label="Móviles de la guardia" className="flex flex-wrap gap-2">
          {sortedBases.map((base) => {
            const selected = requested.has(base.id);
            const membershipPending = pendingBaseSet.has(base.id);
            const Icon = membershipPending ? Loader2 : selected ? Check : Plus;
            return (
              <button
                key={base.id}
                type="button"
                aria-pressed={selected}
                aria-busy={membershipPending || undefined}
                disabled={
                  baseSelectionBlocked || membershipPending || (!base.isActive && !selected)
                }
                onClick={() => toggleBase(base, selected)}
                className={cn(
                  mobileChipClasses.base,
                  selected ? mobileChipClasses.selected : mobileChipClasses.unselected,
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cn("size-4 shrink-0", membershipPending && "motion-safe:animate-spin")}
                />
                <span className="min-w-0 break-words">{base.name}</span>
                {membershipPending ? (
                  <span className="text-xs font-normal">Guardando…</span>
                ) : (
                  !base.isActive && <span className="text-xs font-normal">No disponible</span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {!selectionEditable && requestedBases.length > 0 && (
        <ul aria-label="Móviles de la guardia" className="flex flex-wrap gap-2">
          {requestedBases.map((base) => (
            <li
              key={base.id}
              className="inline-flex min-h-8 max-w-full items-center rounded-full border px-3 text-sm break-words"
            >
              {base.name}
            </li>
          ))}
        </ul>
      )}
      {sortedBases.map(
        (base) =>
          membershipErrors[base.id] && (
            <p key={base.id} role="alert" className="text-sm text-destructive">
              {`${base.name}: ${membershipErrors[base.id]}`}
            </p>
          ),
      )}
      {selectionEditable && sortedBases.length > 0 && requestedBases.length === 0 && (
        <p className="text-sm text-muted-foreground">Elegir móviles es opcional.</p>
      )}
      {requestedBases.map((base) => {
        const membershipPending = pendingBaseSet.has(base.id);
        return (
          <article
            key={base.id}
            aria-label={`Móvil ${base.name}`}
            className="min-w-0 rounded-md border px-2 sm:px-3"
          >
            <h4 className="flex min-h-11 min-w-0 items-center py-1 text-sm font-medium break-words">
              {base.name}
            </h4>
            <div className="pb-2">{roles.map((role) => renderRoleRow(base, role))}</div>
            {hygienePeriods && onHygieneChange && (
              <div className="pb-2">
                <EfaMobileHygienePanel
                  guardId={guardId}
                  baseId={base.id}
                  baseName={base.name}
                  periods={hygienePeriods}
                  canWrite={canWrite}
                  blocked={membershipBlocked || membershipPending}
                  onMutationStart={onArrivalMutationStart}
                  onPeriodChange={onHygieneChange}
                />
              </div>
            )}
          </article>
        );
      })}
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
      {sortedBases.length === 0 && historicalArrivals.length === 0 && (
        <p className="rounded border border-dashed p-3 text-sm text-muted-foreground">
          No hay móviles disponibles para esta guardia.
        </p>
      )}
      {selectionEditable && (
        <EfaActionConfirmation
          open={removalTargetKey !== null}
          onOpenChange={(open) => {
            if (!open) setRemovalBaseId(null);
          }}
          capturedTargetKey={removalTargetKey}
          currentTargetKey={currentRemovalKey}
          title="Quitar móvil"
          description={
            removalBase
              ? (getMobileRemovalConfirmation({
                  guardId,
                  base: removalBase,
                  arrivals,
                  hygienePeriods,
                }) ?? `¿Quitar Móvil ${removalBase.name} de la guardia?`)
              : ""
          }
          confirmLabel="Quitar móvil"
          onConfirm={() => {
            if (!removalBase) return;
            setRemovalBaseId(null);
            onBaseSelectionChange?.(removalBase.id, false);
          }}
        />
      )}
    </section>
  );
}
