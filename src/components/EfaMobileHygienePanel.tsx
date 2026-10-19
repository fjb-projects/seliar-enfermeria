import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CircleCheck, Clock, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deleteEfaMobileHygiene,
  markEfaMobileHygieneAvailable,
  requestEfaMobileHygiene,
  updateEfaMobileHygiene,
} from "@/lib/efa-mobile-hygiene.functions";
import {
  formatDateTimeMinutes,
  formatHygieneDuration,
  formatTimeMinutes,
  hygienePeriodStatus,
  hygieneStatusLabel,
  type HygienePeriodStatus,
} from "@/lib/efa-labels";

export type MobileHygieneView = {
  id: string;
  guardId: string;
  baseId: string;
  baseNameSnapshot: string;
  requestedAt: string;
  availableAt: string | null;
  notInformed: boolean;
  note: string | null;
  deletedAt: string | null;
  version: number;
  canEdit: boolean;
};

type PendingOperation = { fingerprint: string; id: string };

function createOperationId(source: Crypto | undefined = globalThis.crypto) {
  if (!source) throw new Error("A secure random source is required for this operation.");
  if (typeof source.randomUUID === "function") {
    try {
      return source.randomUUID();
    } catch {
      // Fall through to getRandomValues, which gives the same cryptographic guarantee.
    }
  }
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Reuses the same identity while a retry carries the same payload, so a lost reply replays safely. */
export function getStableHygieneOperation(
  pending: Map<string, PendingOperation>,
  scope: string,
  payload: unknown,
  createId: () => string = createOperationId,
) {
  const fingerprint = JSON.stringify(payload);
  const current = pending.get(scope);
  if (current?.fingerprint === fingerprint) return current.id;
  const id = createId();
  pending.set(scope, { fingerprint, id });
  return id;
}

export function clearConfirmedHygieneOperation(
  pending: Map<string, PendingOperation>,
  scope: string,
  id: string,
) {
  if (pending.get(scope)?.id === id) pending.delete(scope);
}

/** Converts a `datetime-local` value (browser local time) to an ISO instant, or null when invalid. */
export function parseLocalHygieneTimestamp(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const date = new Date(year, month - 1, day, hour, minute);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  )
    return null;
  return date.toISOString();
}

export function toLocalHygieneInputValue(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export const mobileHygieneClasses = {
  section: "min-w-0 border-t py-2 text-sm",
  form: "mt-2 grid min-w-0 grid-cols-1 gap-2",
  label: "grid min-w-0 gap-1 text-xs text-muted-foreground",
  input:
    "min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3 text-sm text-foreground",
  actions: "flex min-w-0 flex-wrap gap-2",
  item: "grid min-w-0 grid-cols-1 gap-2 border-t py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
  badge:
    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium [&_svg]:size-3.5",
} as const;

const statusIcon: Record<HygienePeriodStatus, typeof Clock> = {
  open: Clock,
  available: CircleCheck,
  not_informed: TriangleAlert,
};

function StatusBadge({ status }: { status: HygienePeriodStatus }) {
  const Icon = statusIcon[status];
  return (
    <span
      className={`${mobileHygieneClasses.badge} ${status === "not_informed" ? "border-dashed" : ""}`}
    >
      <Icon aria-hidden="true" />
      {hygieneStatusLabel(status)}
    </span>
  );
}

export function EfaMobileHygienePanel({
  guardId,
  baseId,
  baseName,
  periods,
  canWrite,
  blocked = false,
  onMutationStart,
  onPeriodChange,
}: {
  guardId: string;
  baseId: string;
  baseName: string;
  periods: MobileHygieneView[];
  canWrite: boolean;
  blocked?: boolean;
  onMutationStart?: ((key: string) => (() => void) | null) | undefined;
  onPeriodChange: (period: MobileHygieneView) => void;
}) {
  const requestPeriod = useServerFn(requestEfaMobileHygiene);
  const markAvailable = useServerFn(markEfaMobileHygieneAvailable);
  const updatePeriod = useServerFn(updateEfaMobileHygiene);
  const deletePeriod = useServerFn(deleteEfaMobileHygiene);
  const pendingOperations = useRef(new Map<string, PendingOperation>());
  const inFlight = useRef(new Set<string>());
  const [busyKeys, setBusyKeys] = useState<Set<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [manualTime, setManualTime] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRequested, setEditRequested] = useState("");
  const [editAvailable, setEditAvailable] = useState("");
  const [editNote, setEditNote] = useState("");

  const visiblePeriods = periods
    .filter(
      (period) =>
        period.guardId === guardId && period.baseId === baseId && period.deletedAt === null,
    )
    .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
  const openPeriod = visiblePeriods.find((period) => hygienePeriodStatus(period) === "open");
  const requestKey = `${baseId}:hygiene:request`;
  const availableKey = `${openPeriod?.id}:hygiene:available`;
  const anyBusy = busyKeys.size > 0;

  function reportError(key: string, message: string) {
    setErrors((current) => ({ ...current, [key]: message }));
  }

  async function runOperation(
    key: string,
    scope: string,
    payload: unknown,
    action: (operationId: string, creationKey?: string) => Promise<MobileHygieneView>,
    creationScope?: string,
  ): Promise<boolean> {
    if (inFlight.current.has(key)) return false;
    const release = onMutationStart?.(key);
    if (onMutationStart && !release) {
      reportError(
        key,
        "Esperá a que termine la sincronización de móviles antes de cambiar higiene y reposición.",
      );
      return false;
    }
    inFlight.current.add(key);
    setBusyKeys((current) => new Set(current).add(key));
    setErrors((current) => ({ ...current, [key]: "" }));
    try {
      const operationId = getStableHygieneOperation(pendingOperations.current, scope, payload);
      const creationKey = creationScope
        ? getStableHygieneOperation(pendingOperations.current, creationScope, payload)
        : undefined;
      const saved = await action(operationId, creationKey);
      onPeriodChange(saved);
      clearConfirmedHygieneOperation(pendingOperations.current, scope, operationId);
      if (creationScope && creationKey)
        clearConfirmedHygieneOperation(pendingOperations.current, creationScope, creationKey);
      return true;
    } catch {
      reportError(key, "No se pudo guardar el cambio. Reintentá esta acción.");
      return false;
    } finally {
      inFlight.current.delete(key);
      setBusyKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      release?.();
    }
  }

  /** Empty manual time means "now" (server time); a filled one is sent as an explicit instant. */
  function manualInstant(key: string): { ok: boolean; value?: string } {
    if (!manualTime) return { ok: true };
    const value = parseLocalHygieneTimestamp(manualTime);
    if (!value) {
      reportError(key, "Ingresá una fecha y hora válidas.");
      return { ok: false };
    }
    return { ok: true, value };
  }

  function request() {
    const time = manualInstant(requestKey);
    if (!time.ok) return;
    const payload = { guardId, baseId, ...(time.value ? { requestedAt: time.value } : {}) };
    void runOperation(
      requestKey,
      `request:${requestKey}`,
      payload,
      async (operationId, clientCreationKey) => {
        if (!clientCreationKey) throw new Error("A creation key is required.");
        const result = (await requestPeriod({
          data: { ...payload, operationId, clientCreationKey },
        })) as { period: MobileHygieneView };
        return result.period;
      },
      `creation:${requestKey}`,
    ).then((saved) => {
      if (saved) setManualTime("");
    });
  }

  function available(period: MobileHygieneView) {
    const time = manualInstant(availableKey);
    if (!time.ok) return;
    const payload = {
      periodId: period.id,
      expectedVersion: period.version,
      ...(time.value ? { availableAt: time.value } : {}),
    };
    void runOperation(availableKey, `available:${period.id}`, payload, async (operationId) => {
      const result = (await markAvailable({ data: { ...payload, operationId } })) as {
        period: MobileHygieneView;
      };
      return result.period;
    }).then((saved) => {
      if (saved) setManualTime("");
    });
  }

  function startEdit(period: MobileHygieneView) {
    setEditRequested(toLocalHygieneInputValue(period.requestedAt));
    setEditAvailable(period.availableAt ? toLocalHygieneInputValue(period.availableAt) : "");
    setEditNote(period.note ?? "");
    setEditingId(period.id);
    setErrors((current) => ({ ...current, [`${period.id}:hygiene:update`]: "" }));
  }

  function saveEdit(period: MobileHygieneView) {
    const key = `${period.id}:hygiene:update`;
    const requestedAt = parseLocalHygieneTimestamp(editRequested);
    const availableAt = editAvailable ? parseLocalHygieneTimestamp(editAvailable) : null;
    if (!requestedAt || (editAvailable && !availableAt)) {
      reportError(key, "Ingresá una fecha y hora válidas.");
      return;
    }
    if (period.availableAt && !availableAt) {
      reportError(key, "La hora de disponible es obligatoria en un período cerrado.");
      return;
    }
    if (availableAt && availableAt < requestedAt) {
      reportError(key, "La hora de disponible no puede ser anterior a la solicitud.");
      return;
    }
    const payload = {
      periodId: period.id,
      expectedVersion: period.version,
      requestedAt,
      availableAt,
      note: editNote.trim() ? editNote.trim() : null,
    };
    void runOperation(key, `update:${period.id}`, payload, async (operationId) => {
      const result = (await updatePeriod({ data: { ...payload, operationId } })) as {
        period: MobileHygieneView;
      };
      return result.period;
    }).then((saved) => {
      if (saved) setEditingId(null);
    });
  }

  function remove(period: MobileHygieneView) {
    if (
      !window.confirm(
        `¿Eliminar el período de higiene y reposición de ${period.baseNameSnapshot} iniciado a las ${formatTimeMinutes(period.requestedAt)}?`,
      )
    )
      return;
    const key = `${period.id}:hygiene:delete`;
    const payload = { periodId: period.id, expectedVersion: period.version };
    void runOperation(key, `delete:${period.id}`, payload, async (operationId) => {
      const result = (await deletePeriod({ data: { ...payload, operationId } })) as {
        period: MobileHygieneView;
      };
      return result.period;
    });
  }

  function renderPeriod(period: MobileHygieneView) {
    const status = hygienePeriodStatus(period);
    const updateKey = `${period.id}:hygiene:update`;
    const deleteKey = `${period.id}:hygiene:delete`;
    const updateBusy = busyKeys.has(updateKey);
    const deleteBusy = busyKeys.has(deleteKey);
    const editable = canWrite && period.canEdit;
    const isEditing = editingId === period.id;
    const duration = formatHygieneDuration(period.requestedAt, period.availableAt);
    const error = errors[updateKey] || errors[deleteKey];
    return (
      <li key={period.id} className={mobileHygieneClasses.item}>
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            {duration && <span className="text-muted-foreground">Duración: {duration}</span>}
          </div>
          {isEditing ? (
            <div className={mobileHygieneClasses.form}>
              <label className={mobileHygieneClasses.label}>
                Hora de la solicitud
                <input
                  className={mobileHygieneClasses.input}
                  type="datetime-local"
                  value={editRequested}
                  onChange={(event) => setEditRequested(event.target.value)}
                />
              </label>
              <label className={mobileHygieneClasses.label}>
                {period.availableAt
                  ? "Hora de disponible"
                  : "Hora de disponible (vacío = sigue en higiene y reposición)"}
                <input
                  className={mobileHygieneClasses.input}
                  type="datetime-local"
                  value={editAvailable}
                  onChange={(event) => setEditAvailable(event.target.value)}
                />
              </label>
              <label className={mobileHygieneClasses.label}>
                Nota (opcional)
                <input
                  className={mobileHygieneClasses.input}
                  type="text"
                  maxLength={300}
                  value={editNote}
                  onChange={(event) => setEditNote(event.target.value)}
                />
              </label>
              <div className={mobileHygieneClasses.actions}>
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={!editRequested || updateBusy || blocked}
                  onClick={() => saveEdit(period)}
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
            </div>
          ) : (
            <>
              <p>
                Solicitó:{" "}
                <time dateTime={period.requestedAt}>
                  {formatDateTimeMinutes(period.requestedAt)}
                </time>
              </p>
              {period.availableAt && (
                <p>
                  Disponible:{" "}
                  <time dateTime={period.availableAt}>
                    {formatDateTimeMinutes(period.availableAt)}
                  </time>
                </p>
              )}
              {status === "not_informed" && (
                <p className="text-muted-foreground">
                  Sin hora de disponible: la guardia terminó con el período abierto.
                </p>
              )}
              {period.note && <p className="break-words text-muted-foreground">{period.note}</p>}
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        {editable && !isEditing && (
          <div className={mobileHygieneClasses.actions}>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 px-2 sm:px-4"
              disabled={updateBusy || deleteBusy || blocked}
              onClick={() => startEdit(period)}
            >
              Editar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11 px-2 sm:px-4"
              disabled={updateBusy || deleteBusy || blocked}
              onClick={() => remove(period)}
            >
              {deleteBusy ? "Eliminando…" : "Eliminar"}
            </Button>
          </div>
        )}
      </li>
    );
  }

  const requestBusy = busyKeys.has(requestKey);
  const availableBusy = busyKeys.has(availableKey);
  const controlsLocked = blocked || anyBusy;
  return (
    <section
      aria-label={`Higiene y reposición de ${baseName}`}
      className={mobileHygieneClasses.section}
    >
      <h3 className="font-medium">Higiene y reposición</h3>
      {canWrite && (
        <div className={mobileHygieneClasses.form}>
          <label className={mobileHygieneClasses.label}>
            Hora (opcional; vacío = ahora)
            <input
              className={mobileHygieneClasses.input}
              type="datetime-local"
              value={manualTime}
              onChange={(event) => setManualTime(event.target.value)}
            />
          </label>
          <div className={mobileHygieneClasses.actions}>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 px-2 sm:px-4"
              disabled={controlsLocked || openPeriod !== undefined}
              onClick={request}
            >
              {requestBusy ? "Registrando…" : "Solicitó higiene y reposición"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 px-2 sm:px-4"
              disabled={controlsLocked || !openPeriod || openPeriod.canEdit === false}
              onClick={() => openPeriod && available(openPeriod)}
            >
              {availableBusy ? "Registrando…" : "Disponible (handy)"}
            </Button>
            {manualTime && (
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 px-2 sm:px-4"
                disabled={anyBusy}
                onClick={() => setManualTime("")}
              >
                Usar hora actual
              </Button>
            )}
          </div>
          {(errors[requestKey] || errors[availableKey]) && (
            <p role="alert" className="text-sm text-destructive">
              {errors[requestKey] || errors[availableKey]}
            </p>
          )}
        </div>
      )}
      {visiblePeriods.length > 0 ? (
        <ul className="mt-2">{visiblePeriods.map(renderPeriod)}</ul>
      ) : (
        <p className="mt-1 text-muted-foreground">Sin registros de higiene y reposición.</p>
      )}
    </section>
  );
}
