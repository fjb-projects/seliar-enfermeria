import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  CompensatorySourceReview,
  type ImportedStaff,
} from "@/components/CompensatorySourceReview";
import { StaffDirectoryFields } from "@/components/StaffDirectoryFields";
import { CompensatoryAgentInput } from "@/components/CompensatoryAgentInput";
import { CompensatoryPeriodPanel } from "@/components/CompensatoryPeriodPanel";
import {
  insertCompensatoryRequest,
  listCompensatoryRequests,
} from "@/lib/compensatory-requests.functions";
import type { CompensatoryRequestRecord } from "@/lib/compensatory-requests.server";
import { deleteCompensatoryStaff } from "@/lib/compensatory-staff-delete.functions";
import {
  createCompensatoryStaff,
  getCompensatoryHistory,
  listCompensatoryStaff,
  recordCompensatoryMovement,
  reverseCompensatoryMovement,
  updateCompensatoryStaff,
  type LedgerView,
  type StaffAuditView,
  type StaffView,
} from "@/lib/compensatory-bank.functions";

const staffDirectoryKeys = [
  "registrationNumber",
  "employmentStatus",
  "jobRole",
  "region",
  "contactPhone",
  "workplace",
  "operationalStatus",
  "operationalRole",
] as const;
export type BankOperationRegistry = Map<string, { fingerprint: string; id: string }>;
type StaffDirectoryValues = Partial<Record<(typeof staffDirectoryKeys)[number], string | null>>;

type BankApi = {
  listStaff: typeof listCompensatoryStaff;
  getHistory: typeof getCompensatoryHistory;
  createStaff: typeof createCompensatoryStaff;
  updateStaff: typeof updateCompensatoryStaff;
  recordMovement: typeof recordCompensatoryMovement;
  reverseMovement: typeof reverseCompensatoryMovement;
  insertRequest: typeof insertCompensatoryRequest;
  listRequests: typeof listCompensatoryRequests;
  deleteStaff: typeof deleteCompensatoryStaff;
};

const defaultApi: BankApi = {
  listStaff: listCompensatoryStaff,
  getHistory: getCompensatoryHistory,
  createStaff: createCompensatoryStaff,
  updateStaff: updateCompensatoryStaff,
  recordMovement: recordCompensatoryMovement,
  reverseMovement: reverseCompensatoryMovement,
  insertRequest: insertCompensatoryRequest,
  listRequests: listCompensatoryRequests,
  deleteStaff: deleteCompensatoryStaff,
};

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

function hoursAndMinutes(totalMinutes: number) {
  const sign = totalMinutes < 0 ? "−" : "";
  const absolute = Math.abs(totalMinutes);
  return `${sign}${Math.floor(absolute / 60)} h ${absolute % 60} min`;
}

function parseMinutes(hours: string, minutes: string) {
  const h = Number(hours);
  const m = Number(minutes);
  if (!Number.isInteger(h) || h < 0 || !Number.isInteger(m) || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function createOperationId() {
  return globalThis.crypto.randomUUID();
}

function inputClass() {
  return "min-h-11";
}

function Field({
  label,
  id,
  children,
  hint,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function requiresPeriodHistoryReversal(
  entry: Pick<LedgerView, "compensatoryPeriodId" | "periodEffect">,
) {
  return Boolean(entry.compensatoryPeriodId && entry.periodEffect === "record");
}

function readDirectoryValues(form: FormData, prefix: "staff" | "profile") {
  return Object.fromEntries(
    staffDirectoryKeys.map((key) => {
      const name = `${prefix}${key.charAt(0).toUpperCase()}${key.slice(1)}`;
      const value = String(form.get(name) ?? "").trim();
      return [key, value || null];
    }),
  ) as Record<(typeof staffDirectoryKeys)[number], string | null>;
}

export function StaffAuditHistory({ changes }: { changes: StaffAuditView[] }) {
  return (
    <details className="rounded-lg border bg-card">
      <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold">
        Auditoría del perfil{" "}
        <span className="ml-1 font-normal text-muted-foreground">
          · cambios de nombre, correo y estado
        </span>
      </summary>
      <div className="px-4 pb-4 text-sm">
        {!changes.length ? (
          <p className="text-sm text-muted-foreground">No hay cambios de perfil registrados.</p>
        ) : (
          <ul className="space-y-3">
            {changes.map((change) => (
              <li className="border-b pb-3 text-sm" key={change.id}>
                <p className="font-medium">
                  {change.createdAt} · {change.actorName}
                </p>
                <p className="mt-1">{change.reason}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <p>
                    <span className="font-medium">Antes:</span>{" "}
                    {JSON.stringify(change.before ?? {})}
                  </p>
                  <p>
                    <span className="font-medium">Después:</span> {JSON.stringify(change.after)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

export function CompensatoryBankPanel({
  initialStaff,
  api: apiOverrides,
  initialSelectedId,
  tool,
  onSaved,
  onExit,
  onBusyChange,
  operationRegistry,
}: {
  initialStaff: StaffView[];
  api?: Partial<BankApi>;
  initialSelectedId?: string;
  tool?: "create" | "profile" | "movement" | "ledger" | "import";
  onSaved?: () => void;
  onExit?: () => void;
  onBusyChange?: (busy: boolean) => void;
  operationRegistry?: BankOperationRegistry;
}) {
  const api = useMemo(() => ({ ...defaultApi, ...apiOverrides }), [apiOverrides]);
  const [staff, setStaff] = useState(initialStaff);
  const [selectedId, setSelectedId] = useState(initialSelectedId ?? initialStaff[0]?.id ?? "");
  const selected = staff.find((person) => person.id === selectedId);
  const [entries, setEntries] = useState<LedgerView[]>([]);
  const [changes, setChanges] = useState<StaffAuditView[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadedFor, setHistoryLoadedFor] = useState("");
  const [historyRevision, setHistoryRevision] = useState(0);
  const [historyError, setHistoryError] = useState("");
  const [requestHistory, setRequestHistory] = useState<CompensatoryRequestRecord[]>([]);
  const [requestHistoryError, setRequestHistoryError] = useState("");
  const [requestHistoryLoading, setRequestHistoryLoading] = useState(false);
  const [requestHistoryLoadedFor, setRequestHistoryLoadedFor] = useState("");
  const [requestHistoryRevision, setRequestHistoryRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reverseEntryId, setReverseEntryId] = useState("");
  const [activeView, setActiveView] = useState<"bank" | "review">("bank");
  const requestSequence = useRef(0);
  const requestHistorySequence = useRef(0);
  const pendingOperations = useRef(
    operationRegistry ?? new Map<string, { fingerprint: string; id: string }>(),
  );
  useEffect(() => {
    onBusyChange?.(saving || deleting || sourceBusy);
  }, [saving, deleting, sourceBusy, onBusyChange]);
  useEffect(() => {
    if (tool && tool !== "import" && notice) onSaved?.();
  }, [notice, tool, onSaved]);

  const getOperationId = (slot: string, payload: unknown) => {
    const fingerprint = JSON.stringify(payload);
    const previous = pendingOperations.current.get(slot);
    if (previous?.fingerprint === fingerprint) return previous.id;
    const id = createOperationId();
    pendingOperations.current.set(slot, { fingerprint, id });
    return id;
  };

  useEffect(() => {
    const request = ++requestSequence.current;
    if (!selectedId) {
      setEntries([]);
      setChanges([]);
      setHistoryLoading(false);
      return;
    }
    setEntries([]);
    setChanges([]);
    setHistoryLoadedFor("");
    setHistoryError("");
    setHistoryLoading(true);
    void api
      .getHistory({ data: { staffId: selectedId } })
      .then((history) => {
        if (request !== requestSequence.current) return;
        setEntries(history.entries);
        setChanges(history.changes);
        setHistoryLoadedFor(selectedId);
      })
      .catch((cause: unknown) => {
        if (request !== requestSequence.current) return;
        setHistoryError(
          getErrorMessage(cause, "No se pudo cargar el historial. Inténtalo de nuevo."),
        );
      })
      .finally(() => {
        if (request === requestSequence.current) setHistoryLoading(false);
      });
    return () => {
      requestSequence.current += 1;
    };
  }, [api, selectedId, historyRevision]);

  useEffect(() => {
    const request = ++requestHistorySequence.current;
    if (!selectedId) {
      setRequestHistory([]);
      setRequestHistoryError("");
      setRequestHistoryLoading(false);
      return;
    }
    setRequestHistory([]);
    setRequestHistoryLoadedFor("");
    setRequestHistoryError("");
    setRequestHistoryLoading(true);
    void api
      .listRequests({ data: { staffId: selectedId } })
      .then((items) => {
        if (request === requestHistorySequence.current) {
          setRequestHistory(items);
          setRequestHistoryLoadedFor(selectedId);
        }
      })
      .catch((cause: unknown) => {
        if (request === requestHistorySequence.current)
          setRequestHistoryError(
            getErrorMessage(cause, "No se pudo cargar el historial de solicitudes."),
          );
      })
      .finally(() => {
        if (request === requestHistorySequence.current) setRequestHistoryLoading(false);
      });
    return () => {
      requestHistorySequence.current += 1;
    };
  }, [api, selectedId, requestHistoryRevision]);

  async function reloadAfterSave(message: string) {
    try {
      const latest = await api.listStaff();
      setStaff(latest);
      setNotice(message);
      setError("");
      return true;
    } catch (cause) {
      setNotice("");
      setError(
        `${message} Se guardó, pero no se pudo actualizar la lista; vuelve a cargar la página. ${getErrorMessage(cause, "")}`.trim(),
      );
      return false;
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const dni = String(form.get("dni") ?? "").trim();
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const monthlyLimitMinutes = parseMinutes(
      String(form.get("monthlyLimitHours") ?? ""),
      String(form.get("monthlyLimitMinutes") ?? "0"),
    );
    if (!dni || !name || monthlyLimitMinutes === null || monthlyLimitMinutes < 1) {
      setError("Completa un DNI, nombre y referencia mensual válida.");
      return;
    }
    const payload = {
      dni,
      name,
      ...(email ? { email } : {}),
      ...readDirectoryValues(form, "staff"),
      monthlyLimitMinutes,
    };
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const created = await api.createStaff({
        data: { ...payload, clientOperationId: getOperationId("create", payload) },
      });
      pendingOperations.current.delete("create");
      formElement.reset();
      const reloaded = await reloadAfterSave("Agente registrado. No se creó una cuenta de acceso.");
      if (reloaded) setSelectedId(created.id);
    } catch (cause) {
      setError(
        getErrorMessage(
          cause,
          "No se pudo registrar el agente. Puedes reintentar sin perder los datos.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleProfileSave(
    event: FormEvent<HTMLFormElement>,
    nextActive = selected?.isActive ?? true,
  ) {
    event.preventDefault();
    await saveProfile(event.currentTarget, nextActive);
  }

  async function saveProfile(formElement: HTMLFormElement, nextActive: boolean) {
    if (!selected) return;
    const form = new FormData(formElement);
    const name = String(form.get("profileName") ?? "").trim();
    const email = String(form.get("profileEmail") ?? "").trim();
    const reason = String(form.get("profileReason") ?? "").trim();
    const monthlyLimitMinutes = parseMinutes(
      String(form.get("profileMonthlyHours") ?? ""),
      String(form.get("profileMonthlyMinutes") ?? "0"),
    );
    if (!name || !reason || monthlyLimitMinutes === null || monthlyLimitMinutes < 1) {
      setError("Indica nombre, referencia mensual válida y motivo del cambio.");
      return;
    }
    const payload = {
      staffId: selected.id,
      name,
      ...(email ? { email } : {}),
      isActive: nextActive,
      monthlyLimitMinutes,
      expectedVersion: selected.version,
      reason,
      ...readDirectoryValues(form, "profile"),
    };
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.updateStaff({
        data: { ...payload, clientOperationId: getOperationId(`profile:${selected.id}`, payload) },
      });
      pendingOperations.current.delete(`profile:${selected.id}`);
      const reloaded = await reloadAfterSave("Perfil actualizado y cambio auditado.");
      setHistoryRevision((revision) => revision + 1);
      if (reloaded && nextActive !== selected.isActive)
        setNotice(
          nextActive
            ? "Agente reactivado."
            : "Agente desactivado; su historial permanece disponible.",
        );
    } catch (cause) {
      setError(
        getErrorMessage(
          cause,
          "No se pudo guardar el perfil. Conservamos el formulario para reintentar.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const kind = String(form.get("kind")) as "opening" | "credit" | "debit";
    const hours = String(form.get("hours") ?? "");
    const minutesField = String(form.get("minutes") ?? "0");
    const minutes = parseMinutes(hours, minutesField);
    const reason = String(form.get("reason") ?? "").trim();
    const effectiveDate = String(form.get("effectiveDate") ?? "");
    if (!selected.isActive) {
      setError("Reactiva al agente antes de registrar movimientos.");
      return;
    }
    if (!minutes || !reason || !effectiveDate) {
      setError(
        "Indica una cantidad positiva de horas y minutos, fecha efectiva y motivo o respaldo.",
      );
      return;
    }
    if (kind === "debit" && minutes > selected.balanceMinutes) {
      setError("El débito supera el saldo disponible. No se puede registrar saldo negativo.");
      return;
    }
    const payload = { staffId: selected.id, kind, minutes, reason, effectiveDate };
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.recordMovement({
        data: { ...payload, clientOperationId: getOperationId(`movement:${selected.id}`, payload) },
      });
      pendingOperations.current.delete(`movement:${selected.id}`);
      formElement.reset();
      await reloadAfterSave("Movimiento registrado en el historial inmutable.");
      setHistoryRevision((revision) => revision + 1);
    } catch (cause) {
      setError(
        getErrorMessage(
          cause,
          "No se pudo registrar el movimiento. Conservamos los datos para reintentar.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleReverse(event: FormEvent<HTMLFormElement>, entry: LedgerView) {
    event.preventDefault();
    if (!selected) return;
    if (!selected.isActive) {
      setError("Reactiva al agente antes de registrar una reversión.");
      return;
    }
    if (
      entry.kind === "reversal" ||
      entry.reversesEntryId ||
      entries.some((item) => item.reversesEntryId === entry.id)
    ) {
      setError("Este movimiento ya fue revertido o es una reversión.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reverseReason") ?? "").trim();
    const effectiveDate = String(form.get("reverseDate") ?? "");
    if (!reason || !effectiveDate) {
      setError("Indica un motivo y una fecha para la reversión.");
      return;
    }
    const payload = { staffId: selected.id, entryId: entry.id, reason, effectiveDate };
    if (
      !window.confirm(
        "Se agregará un movimiento inverso; el registro original no se modifica. ¿Continuar?",
      )
    )
      return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.reverseMovement({
        data: { ...payload, clientOperationId: getOperationId(`reverse:${entry.id}`, payload) },
      });
      pendingOperations.current.delete(`reverse:${entry.id}`);
      setReverseEntryId("");
      await reloadAfterSave("Reversión agregada como un nuevo movimiento.");
      setHistoryRevision((revision) => revision + 1);
    } catch (cause) {
      setError(getErrorMessage(cause, "No se pudo revertir el movimiento. Puedes reintentar."));
    } finally {
      setSaving(false);
    }
  }

  async function refreshStaff() {
    setRefreshing(true);
    setError("");
    try {
      setStaff(await api.listStaff());
    } catch (cause) {
      setError(getErrorMessage(cause, "No se pudo actualizar la lista."));
    } finally {
      setRefreshing(false);
    }
  }

  async function handleDeleteStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || saving || deleting) return;
    if (
      historyLoadedFor !== selected.id ||
      requestHistoryLoadedFor !== selected.id ||
      historyLoading ||
      requestHistoryLoading ||
      historyError ||
      requestHistoryError
    ) {
      setError("No se pudo verificar el historial; actualízalo antes de intentar eliminar.");
      return;
    }
    if (entries.length > 0 || requestHistory.length > 0) {
      setError(
        "El agente tiene historial; no se puede eliminar. Puedes desactivarlo y conservar su historial.",
      );
      return;
    }
    const form = new FormData(event.currentTarget);
    const confirmation = String(form.get("deleteConfirmation") ?? "");
    const reason = String(form.get("deleteReason") ?? "").trim();
    if (confirmation !== selected.dni || !reason) {
      setError("Escribe el DNI exacto del agente y el motivo para confirmar la eliminación.");
      return;
    }
    const payload = {
      staffId: selected.id,
      expectedVersion: selected.version,
      reason,
    };
    if (
      !window.confirm(
        `¿Eliminar definitivamente a ${selected.name} (DNI ${selected.dni})? Esta acción solo procede sin historial y conservará la constancia.`,
      )
    )
      return;
    const slot = `delete:${selected.id}`;
    setDeleting(true);
    setError("");
    setNotice("");
    try {
      const result = await api.deleteStaff({
        data: { ...payload, clientOperationId: getOperationId(slot, payload) },
      });
      if (result.id !== selected.id)
        throw new Error("La respuesta no coincide con el agente seleccionado.");
      pendingOperations.current.delete(slot);
      setStaff((current) => current.filter((person) => person.id !== selected.id));
      setSelectedId("");
      setHistoryRevision((revision) => revision + 1);
      setRequestHistoryRevision((revision) => revision + 1);
      try {
        setStaff(await api.listStaff());
        setNotice("Agente eliminado y constancia guardada.");
      } catch (cause) {
        setError(
          `Agente eliminado y constancia guardada; no se pudo actualizar la lista. ${getErrorMessage(cause, "")}`.trim(),
        );
      }
    } catch (cause) {
      setError(
        getErrorMessage(
          cause,
          "No se pudo eliminar el agente. Conservamos la confirmación para reintentar.",
        ),
      );
    } finally {
      setDeleting(false);
    }
  }

  async function importStaffProfile(profile: ImportedStaff) {
    const canonicalDni = profile.dni.replace(/[.\s]/gu, "");
    if (staff.some((person) => person.dni.replace(/[.\s]/gu, "") === canonicalDni)) {
      throw new Error("Ya existe un agente con ese DNI; no se modificó.");
    }
    const payload = { ...profile };
    const created = await api.createStaff({
      data: { ...payload, clientOperationId: getOperationId(`import:${canonicalDni}`, payload) },
    });
    const latest = await api.listStaff();
    pendingOperations.current.delete(`import:${canonicalDni}`);
    setStaff(latest);
    setSelectedId(created.id);
    setNotice("Agente importado desde el CSV.");
    setError("");
  }

  async function saveReviewedRequest(
    staffId: string,
    request: {
      submittedAt: string;
      name: string;
      mobile: string;
      requestedDate: string;
      requestedHours: string;
    },
    confirmDuplicate: boolean,
    responseId: string,
  ) {
    const payload = {
      staffId,
      submittedAt: request.submittedAt,
      requesterName: request.name,
      requesterMobile: request.mobile,
      compensatoryDate: request.requestedDate,
      hours: request.requestedHours,
    };
    const slot = `request:${responseId}`;
    const result = await api.insertRequest({
      data: {
        ...payload,
        clientOperationId: getOperationId(slot, payload),
        ...(confirmDuplicate ? { confirmDuplicate: true } : {}),
      },
    });
    if (result.status === "stored") {
      pendingOperations.current.delete(slot);
      setRequestHistoryRevision((revision) => revision + 1);
      setNotice("Solicitud agregada al historial del agente.");
      setError("");
    }
    return result;
  }

  async function copyReviewedRequesterEmail(staffId: string, email: string, responseId: string) {
    const person = staff.find((candidate) => candidate.id === staffId);
    if (!person || !email || person.email === email) return;
    const payload = {
      staffId: person.id,
      name: person.name,
      email,
      isActive: person.isActive,
      monthlyLimitMinutes: person.monthlyLimitMinutes,
      expectedVersion: person.version,
      reason: "Correo del solicitante revisado y copiado desde una solicitud de compensatorio.",
      ...Object.fromEntries(staffDirectoryKeys.map((key) => [key, person[key] ?? null])),
    };
    const slot = `request-email:${responseId}`;
    await api.updateStaff({
      data: { ...payload, clientOperationId: getOperationId(slot, payload) },
    });
    const latest = await api.listStaff();
    pendingOperations.current.delete(slot);
    setStaff(latest);
    setRequestHistoryRevision((revision) => revision + 1);
    setNotice("Correo copiado al perfil y cambio auditado.");
    setError("");
  }

  return (
    <div className="space-y-3 compensatory-bank-panel" data-active-view={activeView}>
      {!tool && (
        <>
          <style className="compensatory-bank-view-styles">{`.compensatory-bank-panel[data-active-view="review"] > :not(.compensatory-bank-view-switch):not(.compensatory-review-view):not(.compensatory-bank-view-styles) { display: none; }
.compensatory-bank-panel[data-active-view="bank"] > .compensatory-review-view { display: none; }`}</style>
          <div
            className="flex flex-wrap gap-2 compensatory-bank-view-switch"
            aria-label="Vistas de compensatorios"
          >
            <Button
              type="button"
              variant={activeView === "bank" ? "default" : "outline"}
              className="min-h-11"
              aria-pressed={activeView === "bank"}
              onClick={() => setActiveView("bank")}
            >
              Banco de horas
            </Button>
            <Button
              type="button"
              variant={activeView === "review" ? "default" : "outline"}
              className="min-h-11"
              aria-pressed={activeView === "review"}
              onClick={() => setActiveView("review")}
            >
              Revisar vinculaciones
            </Button>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Compensatorios</h2>
            </div>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 gap-2"
              onClick={() => void refreshStaff()}
              disabled={refreshing}
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              {refreshing ? "Actualizando…" : "Actualizar"}
            </Button>
          </div>
          <details className="text-sm">
            <summary className="min-h-11 cursor-pointer py-2.5 text-muted-foreground">
              Cómo funciona el banco
            </summary>
            <p className="max-w-3xl pb-2 text-muted-foreground">
              Administra el saldo histórico con motivo, fecha y trazabilidad. La referencia mensual
              es editable y orientativa; no es un tope del saldo. Este registro no crea cuentas ni
              accesos. No hay datos existentes que se infieran automáticamente.
            </p>
          </details>
        </>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-md border border-border bg-muted/30 p-3 text-sm">
          {notice}
        </p>
      )}
      {tool !== "import" && (
        <div
          className={
            tool
              ? "min-w-0 space-y-3"
              : "grid min-w-0 gap-3 xl:grid-cols-[minmax(17rem,0.8fr)_minmax(0,1.6fr)]"
          }
        >
          {(!tool || tool === "create" || tool === "profile") && (
            <div className="space-y-3">
              {!tool && (
                <Card>
                  <CardHeader className="space-y-1 p-4 pb-2">
                    <CardTitle className="text-base">Agentes</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 p-4 pt-2">
                    <CompensatoryAgentInput
                      key={`staff-select:${staff.map((person) => person.id).join("|")}`}
                      id="staff-select"
                      label="Seleccionar agente"
                      value={selectedId}
                      options={staff.map((person) => ({
                        id: person.id,
                        label: `${person.name} · DNI ${person.dni}${person.isActive ? "" : " · Inactivo"}`,
                      }))}
                      disabled={saving}
                      onSelect={(id) => setSelectedId(id ?? "")}
                    />
                    {!staff.length && (
                      <p className="text-sm text-muted-foreground">
                        Todavía no hay agentes registrados.
                      </p>
                    )}
                    {selected && (
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Saldo disponible
                        </p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">
                          {hoursAndMinutes(selected.balanceMinutes)}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          DNI {selected.dni} · Referencia{" "}
                          {hoursAndMinutes(selected.monthlyLimitMinutes)} al mes
                        </p>
                        {!selected.isActive && (
                          <p className="mt-2 text-sm font-medium text-destructive">
                            Inactivo: historial disponible; nuevos movimientos bloqueados.
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
              {(!tool || tool === "create") && (
                <details
                  className="rounded-lg border bg-card"
                  open={tool === "create" ? true : undefined}
                >
                  <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold">
                    Nuevo agente{" "}
                    <span className="ml-1 font-normal text-muted-foreground">
                      · DNI único, sin cuenta de acceso
                    </span>
                  </summary>
                  <div className="px-4 pb-4">
                    <form className="space-y-3" onSubmit={(event) => void handleCreate(event)}>
                      <Field id="new-dni" label="DNI">
                        <Input
                          id="new-dni"
                          name="dni"
                          className={inputClass()}
                          required
                          autoComplete="off"
                        />
                      </Field>
                      <Field id="new-name" label="Nombre y apellido">
                        <Input id="new-name" name="name" className={inputClass()} required />
                      </Field>
                      <Field id="new-email" label="Correo electrónico (opcional)">
                        <Input id="new-email" name="email" type="email" className={inputClass()} />
                      </Field>
                      <StaffDirectoryFields prefix="staff" />
                      <div>
                        <p className="mb-1.5 text-sm font-medium">Referencia mensual</p>
                        <p className="mb-2 text-xs text-muted-foreground">
                          Valor inicial: 24 horas. Es una referencia, no un límite de saldo.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <Field id="new-monthly-limit-hours" label="Horas">
                            <Input
                              id="new-monthly-limit-hours"
                              name="monthlyLimitHours"
                              type="number"
                              min="0"
                              step="1"
                              defaultValue="24"
                              className={inputClass()}
                              required
                            />
                          </Field>
                          <Field id="new-monthly-limit-minutes" label="Minutos">
                            <Input
                              id="new-monthly-limit-minutes"
                              name="monthlyLimitMinutes"
                              type="number"
                              min="0"
                              max="59"
                              step="1"
                              defaultValue="0"
                              className={inputClass()}
                              required
                            />
                          </Field>
                        </div>
                      </div>
                      <Button type="submit" className="min-h-11 w-full" disabled={saving}>
                        {saving ? "Guardando…" : "Crear agente"}
                      </Button>
                    </form>
                  </div>
                </details>
              )}
              {selected && (!tool || tool === "profile") && (
                <details
                  className="rounded-lg border bg-card"
                  open={tool === "profile" ? true : undefined}
                >
                  <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold">
                    Editar ficha{" "}
                    <span className="ml-1 font-normal text-muted-foreground">
                      · cambios auditados
                    </span>
                  </summary>
                  <div className="px-4 pb-4">
                    <form
                      key={`${selected.id}:${selected.version}`}
                      className="space-y-3"
                      onSubmit={(event) => void handleProfileSave(event)}
                    >
                      <Field id="profile-name" label="Nombre">
                        <Input
                          id="profile-name"
                          name="profileName"
                          className={inputClass()}
                          defaultValue={selected.name}
                          required
                        />
                      </Field>
                      <Field id="profile-email" label="Correo electrónico (opcional)">
                        <Input
                          id="profile-email"
                          name="profileEmail"
                          type="email"
                          className={inputClass()}
                          defaultValue={selected.email ?? ""}
                        />
                      </Field>
                      <StaffDirectoryFields
                        prefix="profile"
                        values={
                          Object.fromEntries(
                            staffDirectoryKeys.map((key) => [key, selected[key] ?? null]),
                          ) as StaffDirectoryValues
                        }
                      />
                      <div>
                        <p className="mb-1.5 text-sm font-medium">Referencia mensual</p>
                        <div className="grid grid-cols-2 gap-2">
                          <Field id="profile-limit-hours" label="Horas">
                            <Input
                              id="profile-limit-hours"
                              name="profileMonthlyHours"
                              type="number"
                              min="0"
                              step="1"
                              className={inputClass()}
                              defaultValue={Math.floor(selected.monthlyLimitMinutes / 60)}
                              required
                            />
                          </Field>
                          <Field id="profile-limit-minutes" label="Minutos">
                            <Input
                              id="profile-limit-minutes"
                              name="profileMonthlyMinutes"
                              type="number"
                              min="0"
                              max="59"
                              step="1"
                              className={inputClass()}
                              defaultValue={selected.monthlyLimitMinutes % 60}
                              required
                            />
                          </Field>
                        </div>
                      </div>
                      <Field id="profile-reason" label="Motivo del cambio">
                        <Input
                          id="profile-reason"
                          name="profileReason"
                          className={inputClass()}
                          required
                        />
                      </Field>
                      <Button
                        type="submit"
                        variant="outline"
                        className="min-h-11"
                        disabled={saving}
                      >
                        Guardar perfil
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-11"
                        disabled={saving}
                        onClick={(event) => {
                          const form = event.currentTarget.form;
                          if (form) void saveProfile(form, !selected.isActive);
                        }}
                      >
                        {selected.isActive ? "Desactivar agente" : "Reactivar agente"}
                      </Button>
                    </form>
                    <form
                      key={`delete:${selected.id}:${selected.version}`}
                      id="delete-agent-form"
                      className="mt-4 space-y-3 border-t border-destructive/30 pt-4"
                      onSubmit={(event) => void handleDeleteStaff(event)}
                    >
                      <div>
                        <h3 className="text-sm font-semibold text-destructive">Eliminar agente</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Solo se puede eliminar sin solicitudes ni movimientos. Si tiene historial,
                          desactívalo para conservarlo.
                        </p>
                      </div>
                      {(historyLoadedFor !== selected.id ||
                        requestHistoryLoadedFor !== selected.id ||
                        historyLoading ||
                        requestHistoryLoading) && (
                        <p role="status" className="text-sm">
                          Verificando historial antes de habilitar la eliminación…
                        </p>
                      )}
                      {(entries.length > 0 || requestHistory.length > 0) && (
                        <p role="alert" className="text-sm text-destructive">
                          El historial operativo impide eliminar este agente. Puedes desactivarlo;
                          el historial se conserva.
                        </p>
                      )}
                      {(historyError || requestHistoryError) && (
                        <p role="alert" className="text-sm text-destructive">
                          No se pudo comprobar que el historial esté vacío; la eliminación queda
                          bloqueada.
                        </p>
                      )}
                      <Field
                        id="delete-confirmation"
                        label={`Escribe el DNI exacto ${selected.dni} para confirmar`}
                      >
                        <Input
                          id="delete-confirmation"
                          name="deleteConfirmation"
                          className={inputClass()}
                          autoComplete="off"
                          disabled={saving || deleting}
                          required
                        />
                      </Field>
                      <Field id="delete-reason" label="Motivo de la eliminación">
                        <Input
                          id="delete-reason"
                          name="deleteReason"
                          className={inputClass()}
                          maxLength={500}
                          disabled={saving || deleting}
                          required
                        />
                      </Field>
                      <Button
                        type="submit"
                        variant="destructive"
                        className="min-h-11"
                        disabled={
                          saving ||
                          deleting ||
                          historyLoadedFor !== selected.id ||
                          requestHistoryLoadedFor !== selected.id ||
                          historyLoading ||
                          requestHistoryLoading ||
                          Boolean(historyError || requestHistoryError) ||
                          entries.length > 0 ||
                          requestHistory.length > 0
                        }
                      >
                        {deleting ? "Eliminando…" : "Eliminar agente definitivamente"}
                      </Button>
                      {deleting && (
                        <p role="status" className="text-sm">
                          No cambies de agente mientras se confirma la eliminación.
                        </p>
                      )}
                    </form>
                  </div>
                </details>
              )}
            </div>
          )}
          {(!tool || tool === "movement" || tool === "ledger") && (
            <div className="min-w-0 space-y-3">
              {selected && (!tool || tool === "movement") && (
                <Card className="shadow-sm">
                  <CardHeader className="space-y-1 p-4 pb-2">
                    <CardTitle className="text-base">Registrar horas</CardTitle>
                    <CardDescription>
                      Solo registra horas ya existentes. Toda cantidad requiere fecha efectiva y
                      motivo o respaldo.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 pt-2">
                    <form
                      key={selected.id}
                      className="grid gap-3 sm:grid-cols-2"
                      onSubmit={(event) => void handleMovement(event)}
                    >
                      <Field id="movement-kind" label="Tipo de movimiento">
                        <select
                          id="movement-kind"
                          name="kind"
                          className={`${inputClass()} w-full rounded-md border border-input bg-background px-3`}
                        >
                          {!entries.length && (
                            <option value="opening">Saldo inicial (solo primer movimiento)</option>
                          )}
                          <option value="credit">Crédito manual</option>
                          <option value="debit">Débito manual</option>
                        </select>
                      </Field>
                      <div className="grid grid-cols-2 gap-2">
                        <Field id="movement-hours" label="Horas">
                          <Input
                            id="movement-hours"
                            name="hours"
                            type="number"
                            min="0"
                            step="1"
                            className={inputClass()}
                            required
                          />
                        </Field>
                        <Field id="movement-minutes" label="Minutos">
                          <Input
                            id="movement-minutes"
                            name="minutes"
                            type="number"
                            min="0"
                            max="59"
                            step="1"
                            defaultValue="0"
                            className={inputClass()}
                            required
                          />
                        </Field>
                      </div>
                      <Field id="movement-effective-date" label="Fecha efectiva">
                        <Input
                          id="movement-effective-date"
                          name="effectiveDate"
                          type="date"
                          max={today()}
                          defaultValue={today()}
                          className={inputClass()}
                          required
                        />
                      </Field>
                      <Field id="movement-reason" label="Motivo y respaldo">
                        <Input
                          id="movement-reason"
                          name="reason"
                          className={inputClass()}
                          required
                        />
                      </Field>
                      <div className="sm:col-span-2">
                        <Button
                          type="submit"
                          className="min-h-11"
                          disabled={saving || !selected.isActive}
                        >
                          {saving ? "Guardando…" : "Registrar movimiento"}
                        </Button>
                        {!selected.isActive && (
                          <p className="mt-2 text-sm text-muted-foreground">
                            Reactiva al agente para registrar movimientos.
                          </p>
                        )}
                      </div>
                    </form>
                  </CardContent>
                </Card>
              )}
              {selected && (!tool || tool === "ledger") && (
                <CompensatoryPeriodPanel key={selected.id} staffId={selected.id} />
              )}
              {(!tool || tool === "ledger") && (
                <details
                  className="rounded-lg border bg-card"
                  open={tool === "ledger" || Boolean(historyError) ? true : undefined}
                >
                  <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold">
                    Movimientos recientes{" "}
                    <span className="ml-1 font-normal text-muted-foreground">
                      · historial de saldo y reversiones
                    </span>
                  </summary>
                  <Card className="rounded-none border-0 shadow-none">
                    <CardContent className="space-y-3 p-4 pt-1">
                      {!selected && (
                        <p className="text-sm text-muted-foreground">
                          Selecciona un agente para consultar su historial.
                        </p>
                      )}
                      {historyLoading && (
                        <p role="status" className="text-sm text-muted-foreground">
                          Cargando historial…
                        </p>
                      )}
                      {historyError && (
                        <div role="alert" className="space-y-2">
                          <p className="text-sm text-destructive">{historyError}</p>
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-11"
                            onClick={() => setHistoryRevision((revision) => revision + 1)}
                          >
                            Reintentar carga
                          </Button>
                        </div>
                      )}
                      {selected && !historyLoading && !historyError && !entries.length && (
                        <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                          No hay movimientos registrados para este agente.
                        </p>
                      )}
                      {entries.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
                            <thead>
                              <tr className="border-b text-muted-foreground">
                                <th className="p-2">Fecha / registro</th>
                                <th className="p-2">Movimiento</th>
                                <th className="p-2">Motivo</th>
                                <th className="p-2">Saldo antes / después</th>
                                <th className="p-2">Responsable</th>
                                <th className="p-2">Acción</th>
                              </tr>
                            </thead>
                            <tbody>
                              {entries.map((entry) => (
                                <tr
                                  id={`ledger-entry-${entry.id}`}
                                  className="border-b align-top"
                                  key={entry.id}
                                >
                                  <td className="p-2 tabular-nums">
                                    {entry.effectiveDate}
                                    <br />
                                    <span className="text-xs text-muted-foreground">
                                      {new Date(entry.createdAt).toLocaleString()}
                                    </span>
                                  </td>
                                  <td className="p-2">
                                    <span className="capitalize">
                                      {entry.kind === "opening"
                                        ? "Saldo inicial"
                                        : entry.kind === "credit"
                                          ? "Crédito"
                                          : entry.kind === "debit"
                                            ? "Débito"
                                            : "Reversión"}
                                    </span>
                                    <br />
                                    <span className="tabular-nums">
                                      {hoursAndMinutes(entry.minutes)}
                                    </span>
                                  </td>
                                  <td className="max-w-64 whitespace-normal p-2">
                                    {entry.reason}
                                    {entry.reversesEntryId && (
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        <a
                                          className="underline underline-offset-2"
                                          href={`#ledger-entry-${entry.reversesEntryId}`}
                                        >
                                          Reversa el movimiento original
                                        </a>
                                      </p>
                                    )}
                                  </td>
                                  <td className="p-2 tabular-nums">
                                    {hoursAndMinutes(entry.balanceBeforeMinutes)}
                                    <br />
                                    {hoursAndMinutes(entry.balanceAfterMinutes)}
                                  </td>
                                  <td className="p-2">{entry.actorName}</td>
                                  <td className="p-2">
                                    {selected?.isActive &&
                                      requiresPeriodHistoryReversal(entry) && (
                                        <a
                                          className="text-sm underline underline-offset-2"
                                          href={`#compensatory-period-${entry.compensatoryPeriodId}`}
                                        >
                                          Gestionar reversión en historial de períodos
                                        </a>
                                      )}
                                    {selected?.isActive &&
                                      !entry.compensatoryPeriodId &&
                                      entry.kind !== "reversal" &&
                                      !entry.reversesEntryId &&
                                      !entries.some(
                                        (item) => item.reversesEntryId === entry.id,
                                      ) && (
                                        <Button
                                          type="button"
                                          variant="outline"
                                          className="min-h-11"
                                          onClick={() => setReverseEntryId(entry.id)}
                                        >
                                          Revertir
                                        </Button>
                                      )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {reverseEntryId &&
                        selected &&
                        entries.find((entry) => entry.id === reverseEntryId) && (
                          <form
                            className="mt-4 grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
                            onSubmit={(event) =>
                              void handleReverse(
                                event,
                                entries.find((entry) => entry.id === reverseEntryId)!,
                              )
                            }
                          >
                            <p className="sm:col-span-2 text-sm font-medium">
                              La reversión crea un asiento nuevo y no edita el original.
                            </p>
                            <Field id="reverse-reason" label="Motivo de la reversión">
                              <Input
                                id="reverse-reason"
                                name="reverseReason"
                                className={inputClass()}
                                required
                              />
                            </Field>
                            <Field id="reverse-date" label="Fecha efectiva">
                              <Input
                                id="reverse-date"
                                name="reverseDate"
                                type="date"
                                max={today()}
                                defaultValue={today()}
                                className={inputClass()}
                                required
                              />
                            </Field>
                            <div className="flex flex-wrap gap-2 sm:col-span-2">
                              <Button type="submit" className="min-h-11" disabled={saving}>
                                Confirmar reversión
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                className="min-h-11"
                                onClick={() => setReverseEntryId("")}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </form>
                        )}
                    </CardContent>
                  </Card>
                </details>
              )}
              {!tool && (
                <>
                  <details
                    className="rounded-lg border bg-card"
                    open={Boolean(requestHistoryError)}
                  >
                    <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold">
                      Solicitudes guardadas{" "}
                      <span className="ml-1 font-normal text-muted-foreground">
                        · historial asociado al agente
                      </span>
                    </summary>
                    <Card className="rounded-none border-0 shadow-none">
                      <CardContent className="space-y-3 p-4 pt-1">
                        {!selected && (
                          <p className="text-sm text-muted-foreground">
                            Selecciona un agente para consultar sus solicitudes.
                          </p>
                        )}
                        {requestHistoryLoading && (
                          <p role="status" className="text-sm text-muted-foreground">
                            Cargando solicitudes guardadas…
                          </p>
                        )}
                        {requestHistoryError && (
                          <div role="alert" className="space-y-2">
                            <p className="text-sm text-destructive">{requestHistoryError}</p>
                            <Button
                              type="button"
                              variant="outline"
                              className="min-h-11"
                              onClick={() => setRequestHistoryRevision((revision) => revision + 1)}
                            >
                              Reintentar carga
                            </Button>
                          </div>
                        )}
                        {selected &&
                          !requestHistoryLoading &&
                          !requestHistoryError &&
                          requestHistory.length === 0 && (
                            <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                              No hay solicitudes guardadas para este agente.
                            </p>
                          )}
                        {requestHistory.map((request) => (
                          <article className="rounded-md border p-3 text-sm" key={request.id}>
                            <p className="font-medium">
                              {request.submittedAt} · {request.requesterName}
                            </p>
                            <p className="mt-1">
                              Móvil: {request.requesterMobile} · Fecha solicitada:{" "}
                              {request.compensatoryDate} · Horas: {request.hours}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Registrada: {new Date(request.createdAt).toLocaleString()}
                            </p>
                          </article>
                        ))}
                      </CardContent>
                    </Card>
                  </details>
                  {selected && <StaffAuditHistory changes={changes} />}
                </>
              )}
            </div>
          )}
        </div>
      )}
      {(!tool || tool === "import") && (
        <div className="compensatory-review-view">
          <CompensatorySourceReview
            onBack={() => {
              if (tool === "import") {
                if (!sourceBusy && !saving && !deleting) onExit?.();
              } else setActiveView("bank");
            }}
            onBusyChange={setSourceBusy}
            existingDnis={staff.map((person) => person.dni)}
            onImportStaff={importStaffProfile}
            staffTargets={staff}
            onSaveRequest={saveReviewedRequest}
            onCopyRequesterEmail={copyReviewedRequesterEmail}
          />
        </div>
      )}
    </div>
  );
}
