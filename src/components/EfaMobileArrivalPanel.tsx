import { useId, useRef, useState, type ComponentType } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Plus, Stethoscope, Syringe } from "lucide-react";
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
import { formatTimeMinutes, hygienePeriodStatus } from "@/lib/efa-labels";
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

type RoleIcon = ComponentType<{ className?: string; "aria-hidden"?: "true" }>;

// The installed lucide-react has no steering wheel, so this one follows lucide's drawing style.
function SteeringWheelIcon({
  className,
  ...props
}: {
  className?: string;
  "aria-hidden"?: "true";
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      data-icon="steering-wheel"
      className={className}
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="2" />
      <path d="M10 12H2" />
      <path d="M14 12h8" />
      <path d="M12 14v8" />
    </svg>
  );
}

// Nurse and driver make a mobile operational; the doctor is optional and only adds to the state.
const roles: { id: MobileArrivalRole; label: string; required: boolean; icon: RoleIcon }[] = [
  { id: "nurse", label: "Enfermería", required: true, icon: Syringe },
  { id: "driver", label: "Conducción", required: true, icon: SteeringWheelIcon },
  { id: "doctor", label: "Medicina", required: false, icon: Stethoscope },
];

const roleLabel = (role: MobileArrivalRole) => roles.find((item) => item.id === role)?.label;

export type MobileCrewState = {
  tone: "hygiene" | "empty" | "partial" | "operational";
  label: string;
};

/**
 * Card state of a mobile from its active arrivals and hygiene periods in this guard. An open
 * hygiene period wins; otherwise nurse plus driver make it operational and a doctor adds to it.
 */
export function getMobileCrewState({
  guardId,
  baseId,
  arrivals,
  hygienePeriods = [],
}: {
  guardId: string;
  baseId: string;
  arrivals: MobileArrivalView[];
  hygienePeriods?: MobileHygieneView[] | undefined;
}): MobileCrewState {
  const owns = (record: { guardId: string; baseId: string; deletedAt: string | null }) =>
    record.guardId === guardId && record.baseId === baseId && record.deletedAt === null;
  const openHygiene = hygienePeriods
    .filter((period) => owns(period) && hygienePeriodStatus(period) === "open")
    .reduce<MobileHygieneView | undefined>(
      (latest, period) =>
        !latest || Date.parse(period.requestedAt) > Date.parse(latest.requestedAt)
          ? period
          : latest,
      undefined,
    );
  if (openHygiene)
    return {
      tone: "hygiene",
      label: `En higiene desde ${formatTimeMinutes(openHygiene.requestedAt)}`,
    };

  const present = new Set(arrivals.filter(owns).map((arrival) => arrival.role));
  const nurse = present.has("nurse");
  const driver = present.has("driver");
  if (!nurse && !driver) return { tone: "empty", label: "Sin tripulación" };
  if (!driver) return { tone: "partial", label: `Falta ${roleLabel("driver")}` };
  if (!nurse) return { tone: "partial", label: `Falta ${roleLabel("nurse")}` };
  return {
    tone: "operational",
    label: present.has("doctor") ? "Operativo · con médico" : "Operativo",
  };
}

// Text always carries the state; color only reinforces it.
const crewStateClasses: Record<MobileCrewState["tone"], string> = {
  hygiene: "bg-[var(--brand-orange)]/15 text-foreground",
  empty: "bg-muted text-muted-foreground",
  partial: "bg-warning-soft text-warning-foreground dark:text-warning",
  operational: "bg-[var(--success)]/15 text-[var(--success)]",
};

export const mobileArrivalEditClasses = {
  cells: "grid min-w-0 grid-cols-3 gap-2",
  cell: "flex min-h-11 min-w-0 flex-col items-start justify-between gap-1 rounded-md border p-2 text-left",
  cellButton:
    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 enabled:hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-60",
  actions: "grid min-w-0 gap-2 border-t pt-2 text-sm",
  form: "grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]",
  label: "grid min-w-0 gap-1 text-xs text-muted-foreground",
  input:
    "min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3 text-sm text-foreground",
} as const;

function formatArrivalTime(value: string) {
  return new Date(value).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

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
  // One open actions row per mobile, keyed by mobile and holding the arrival it acts on. A new
  // arrival has a new id, so a deleted-then-registered role starts collapsed.
  const [openActions, setOpenActions] = useState<Record<string, string | null>>({});
  const actionsIdPrefix = useId();

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
        `¿Eliminar el ingreso de ${arrival.baseNameSnapshot} · ${roleLabel(arrival.role)}?`,
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

  function toggleActions(baseId: string, arrivalId: string) {
    const closing = openActions[baseId] === arrivalId;
    setOpenActions((current) => ({ ...current, [baseId]: closing ? null : arrivalId }));
    // An edit in progress belongs to the actions row being closed or replaced on this mobile.
    if (arrivals.some((arrival) => arrival.id === editingId && arrival.baseId === baseId))
      setEditingId(null);
  }

  function renderArrivalTime(arrival: MobileArrivalView) {
    return (
      <time
        dateTime={arrival.arrivedAt}
        aria-label={`Ingreso registrado el ${new Date(arrival.arrivedAt).toLocaleString("es-AR")}`}
        className="font-display text-lg leading-none font-semibold tabular-nums"
      >
        {formatArrivalTime(arrival.arrivedAt)}
      </time>
    );
  }

  function renderRoleCell(base: GuardBase, role: (typeof roles)[number]) {
    const arrival = activeArrival(base.id, role.id);
    const createKey = `${base.id}:${role.id}:create`;
    const createBusy = busyKeys.has(createKey);
    const rowBlocked = membershipBlocked || pendingBaseSet.has(base.id);
    const Icon = role.icon;
    const optional = !role.required && !arrival;
    const cellClass = cn(mobileArrivalEditClasses.cell, optional && "border-dashed");
    const heading = (
      <span className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 break-words">{role.label}</span>
        {optional && <span className="text-[0.625rem] leading-none italic">opcional</span>}
      </span>
    );

    if (!arrival && canWrite)
      return (
        <button
          key={role.id}
          type="button"
          data-role={role.id}
          aria-label={`Registrar ingreso de ${role.label} en ${base.name}`}
          aria-busy={createBusy || undefined}
          disabled={createBusy || rowBlocked}
          onClick={() => register(base.id, role.id)}
          className={cn(cellClass, mobileArrivalEditClasses.cellButton)}
        >
          {heading}
          <span className="text-sm font-medium">{createBusy ? "Registrando…" : "+ Ingreso"}</span>
        </button>
      );

    if (arrival && canWrite && arrival.canEdit) {
      const expanded = openActions[base.id] === arrival.id;
      return (
        <button
          key={role.id}
          type="button"
          data-role={role.id}
          aria-expanded={expanded}
          aria-controls={expanded ? `${actionsIdPrefix}-${base.id}` : undefined}
          aria-label={`${role.label}, ingreso ${formatArrivalTime(arrival.arrivedAt)}. Opciones`}
          onClick={() => toggleActions(base.id, arrival.id)}
          className={cn(
            cellClass,
            mobileArrivalEditClasses.cellButton,
            expanded && "border-primary bg-accent/40",
          )}
        >
          {heading}
          {renderArrivalTime(arrival)}
        </button>
      );
    }

    return (
      <div key={role.id} data-role={role.id} className={cellClass}>
        {heading}
        {arrival ? (
          renderArrivalTime(arrival)
        ) : (
          <span className="text-sm text-muted-foreground">Sin ingreso</span>
        )}
      </div>
    );
  }

  // Actions for the one filled role whose cell is expanded: the same edit form and delete as
  // before, out of the cells so they stay compact.
  function renderRoleActions(base: GuardBase) {
    if (!canWrite) return null;
    const arrival = arrivals.find(
      (item) =>
        item.id === openActions[base.id] &&
        item.guardId === guardId &&
        item.baseId === base.id &&
        item.deletedAt === null,
    );
    if (!arrival?.canEdit) return null;
    const updateKey = `${arrival.id}:update`;
    const deleteKey = `${arrival.id}:delete`;
    const updateBusy = busyKeys.has(updateKey);
    const deleteBusy = busyKeys.has(deleteKey);
    const rowBlocked = membershipBlocked || pendingBaseSet.has(base.id);
    return (
      <div id={`${actionsIdPrefix}-${base.id}`} className={mobileArrivalEditClasses.actions}>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="mr-auto min-w-0 font-medium break-words">
            {`${roleLabel(arrival.role)} · ${formatArrivalTime(arrival.arrivedAt)}`}
          </p>
          {editingId !== arrival.id && (
            <>
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
            </>
          )}
        </div>
        {editingId === arrival.id && (
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
        )}
      </div>
    );
  }

  function renderRoleErrors(base: GuardBase) {
    return roles.map((role) => {
      const arrival = activeArrival(base.id, role.id);
      const message =
        errors[`${base.id}:${role.id}:create`] ||
        errors[`${arrival?.id}:update`] ||
        errors[`${arrival?.id}:delete`];
      return (
        message && (
          <p key={role.id} role="alert" className="text-sm text-destructive">
            {`${role.label}: ${message}`}
          </p>
        )
      );
    });
  }

  // An unnamed container: the caller owns the "Móviles" region and its heading.
  return (
    <div className="space-y-3">
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
        const crewState = getMobileCrewState({
          guardId,
          baseId: base.id,
          arrivals,
          hygienePeriods,
        });
        return (
          <article
            key={base.id}
            aria-label={`Móvil ${base.name}`}
            className="min-w-0 space-y-2 rounded-md border p-2 sm:p-3"
          >
            <div className="flex min-h-11 min-w-0 flex-wrap items-center justify-between gap-2">
              <h4 className="min-w-0 font-display text-lg font-semibold break-words">
                {base.name}
              </h4>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  crewStateClasses[crewState.tone],
                )}
              >
                {crewState.label}
              </span>
            </div>
            <div className={mobileArrivalEditClasses.cells}>
              {roles.map((role) => renderRoleCell(base, role))}
            </div>
            {renderRoleActions(base)}
            {renderRoleErrors(base)}
            {hygienePeriods && onHygieneChange && (
              <div>
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
                {arrival.baseNameSnapshot} · {roleLabel(arrival.role)} ·{" "}
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
    </div>
  );
}
