import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CompensatoryAgentInput } from "@/components/CompensatoryAgentInput";
import type { StaffView } from "@/lib/compensatory-bank.functions";
import { createAdministrativeCompensatoryRequest } from "@/lib/compensatory-admin-request.functions";
import { getArgentinaToday, parseWorkflowMinutes } from "@/lib/compensatory-hours-workflow";
import {
  ADMINISTRATIVE_MOBILE_CHOICES,
  formatAdministrativeRequestHours,
  getAdministrativeRequestOperation,
  validateAdministrativeRequestDraft,
  type AdministrativeRequestDraft,
  type AdministrativeRequestOperation,
} from "@/lib/compensatory-admin-request-form";

type Step = "data" | "review" | "confirmed";
type RequestInput = Parameters<typeof createAdministrativeCompensatoryRequest>[0];
type RequestResult = Awaited<ReturnType<typeof createAdministrativeCompensatoryRequest>>;
type AdministrativeRequestData = {
  clientOperationId: string;
  staffId: string;
  requesterEmail: string;
  requesterMobile: string;
  compensatoryDate: string;
  hours: string;
  reason: string;
  confirmDuplicate?: boolean;
};

export type CompensatoryAdminRequestApi = {
  createRequest: (input: RequestInput) => Promise<RequestResult>;
};

export type CompensatoryAdminRequestFormProps = {
  staff: StaffView[];
  initialStaffId?: string;
  onSaved: () => void | Promise<void>;
  onBusyChange?: (busy: boolean) => void;
  api?: Partial<CompensatoryAdminRequestApi>;
};

const defaultApi: CompensatoryAdminRequestApi = {
  createRequest: createAdministrativeCompensatoryRequest,
};

function createOperationId() {
  return globalThis.crypto.randomUUID();
}

function initialDraft(staffId: string): AdministrativeRequestDraft {
  return {
    staffId,
    requesterEmail: "",
    requesterMobile: "",
    compensatoryDate: getArgentinaToday(),
    hours: "0",
    minutes: "0",
    reason: "",
  };
}

export function CompensatoryAdminRequestForm({
  staff,
  initialStaffId,
  onSaved,
  onBusyChange,
  api: apiOverrides,
}: CompensatoryAdminRequestFormProps) {
  const api = useMemo(() => ({ ...defaultApi, ...apiOverrides }), [apiOverrides]);
  const activeStaff = useMemo(() => staff.filter((person) => person.isActive), [staff]);
  const initialSelection = activeStaff.some((person) => person.id === initialStaffId)
    ? initialStaffId!
    : "";
  const [draft, setDraft] = useState(() => initialDraft(initialSelection));
  const [step, setStep] = useState<Step>("data");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const operation = useRef<AdministrativeRequestOperation | null>(null);
  const frozenAttempt = useRef<RequestInput | null>(null);
  const selectedStaff = activeStaff.find((person) => person.id === draft.staffId);
  const parsedMinutes = parseWorkflowMinutes(draft.hours, draft.minutes);
  const disabled = busy || uncertain;

  useEffect(() => onBusyChange?.(busy || uncertain), [busy, uncertain, onBusyChange]);

  function updateDraft<K extends keyof AdministrativeRequestDraft>(
    key: K,
    value: AdministrativeRequestDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    if (duplicateMatches) setDuplicateMatches(null);
    if (error) setError("");
  }

  function validationIssue() {
    return validateAdministrativeRequestDraft(draft, Boolean(selectedStaff), getArgentinaToday());
  }

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const issue = validationIssue();
    if (issue) {
      setError(issue);
      return;
    }
    setError("");
    setStep("review");
  }

  async function submit(attempt?: RequestInput) {
    if (busy) return;
    if (!attempt) {
      const issue = validationIssue();
      if (issue) {
        setStep("data");
        setError(issue);
        return;
      }
      operation.current = getAdministrativeRequestOperation(
        operation.current,
        draft,
        createOperationId,
      );
      attempt = {
        data: {
          clientOperationId: operation.current.id,
          staffId: draft.staffId,
          requesterEmail: draft.requesterEmail.trim(),
          requesterMobile: draft.requesterMobile,
          compensatoryDate: draft.compensatoryDate,
          hours: formatAdministrativeRequestHours(draft),
          reason: draft.reason.trim(),
          confirmDuplicate: Boolean(duplicateMatches),
        },
      } as RequestInput;
      frozenAttempt.current = attempt;
    }

    setBusy(true);
    setError("");
    try {
      const result = await api.createRequest(attempt);
      setUncertain(false);
      if (result.state === "duplicate_review_required") {
        setDuplicateMatches(result.matches.map((match) => match.id));
        setStep("review");
        setBusy(false);
        return;
      }
      frozenAttempt.current = null;
      operation.current = null;
      setDuplicateMatches(null);
      setNotice(
        "La solicitud quedó registrada en Pendientes. No implica aprobación ni reserva de horas.",
      );
      setStep("confirmed");
      try {
        await onSaved();
      } catch {
        setError(
          "La solicitud quedó registrada, pero no se pudo actualizar la vista. Puedes volver a cargarla.",
        );
      } finally {
        setBusy(false);
      }
    } catch (cause) {
      setUncertain(true);
      setError(
        `${cause instanceof Error ? cause.message : "No se pudo confirmar el registro."} Conservamos los datos para reintentar con la misma operación.`,
      );
      setBusy(false);
    }
  }

  function confirmPossibleDuplicate() {
    const previous = frozenAttempt.current;
    if (!previous) return;
    const confirmedAttempt = {
      data: { ...(previous.data as AdministrativeRequestData), confirmDuplicate: true },
    } as RequestInput;
    frozenAttempt.current = confirmedAttempt;
    setDuplicateMatches(null);
    void submit(confirmedAttempt);
  }

  function startAnother() {
    setDraft(initialDraft(""));
    setStep("data");
    setError("");
    setNotice("");
    setUncertain(false);
    setDuplicateMatches(null);
    operation.current = null;
    frozenAttempt.current = null;
  }

  return (
    <section className="space-y-4" aria-label="Cargar solicitud de compensatorios">
      <div className="flex justify-end border-b pb-3">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {step === "confirmed"
            ? "Confirmación"
            : step === "review"
              ? "Paso 2 de 2 · Revisar"
              : "Paso 1 de 2 · Datos"}
        </p>
      </div>
      {step === "confirmed" ? (
        <div className="space-y-3" role="status">
          <p className="font-medium">{notice}</p>
          <p className="text-sm text-muted-foreground">
            El correo se guarda como dato de contacto de esta solicitud; no verifica el buzón ni
            envía un mensaje.
          </p>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="button" variant="outline" onClick={startAnother}>
            Cargar otra solicitud
          </Button>
        </div>
      ) : step === "data" ? (
        <form className="space-y-4" onSubmit={review}>
          <fieldset className="space-y-4" disabled={disabled}>
            <CompensatoryAgentInput
              id="admin-request-staff"
              label="Agente activo"
              value={draft.staffId}
              options={activeStaff.map((person) => ({
                id: person.id,
                label: `${person.name} · DNI ${person.dni}`,
              }))}
              onSelect={(id) => updateDraft("staffId", id ?? "")}
            />
            {selectedStaff && (
              <p className="text-xs text-muted-foreground">
                Solicitud para {selectedStaff.name} · DNI {selectedStaff.dni}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-1.5">
                <label htmlFor="admin-request-email" className="text-sm font-medium">
                  Correo de contacto
                </label>
                <Input
                  id="admin-request-email"
                  type="email"
                  autoComplete="email"
                  required
                  className="min-h-11"
                  value={draft.requesterEmail}
                  onChange={(event) => updateDraft("requesterEmail", event.currentTarget.value)}
                />
              </div>
              <div className="min-w-0 space-y-1.5">
                <label htmlFor="admin-request-mobile" className="text-sm font-medium">
                  Móvil
                </label>
                <select
                  id="admin-request-mobile"
                  required
                  className="min-h-11 w-full rounded-md border bg-background px-3 text-sm"
                  value={draft.requesterMobile}
                  onChange={(event) => updateDraft("requesterMobile", event.currentTarget.value)}
                >
                  <option value="">Seleccionar móvil</option>
                  {ADMINISTRATIVE_MOBILE_CHOICES.map((mobile) => (
                    <option key={mobile} value={mobile}>
                      {mobile}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-1.5">
                <label htmlFor="admin-request-date" className="text-sm font-medium">
                  Fecha del servicio
                </label>
                <Input
                  id="admin-request-date"
                  type="date"
                  min={getArgentinaToday()}
                  required
                  className="min-h-11"
                  value={draft.compensatoryDate}
                  onChange={(event) => updateDraft("compensatoryDate", event.currentTarget.value)}
                />
              </div>
              <fieldset className="min-w-0 space-y-1.5">
                <legend className="text-sm font-medium">Tiempo solicitado</legend>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label htmlFor="admin-request-hours" className="text-xs text-muted-foreground">
                      Horas
                    </label>
                    <Input
                      id="admin-request-hours"
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      className="min-h-11"
                      value={draft.hours}
                      onChange={(event) => updateDraft("hours", event.currentTarget.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="admin-request-minutes"
                      className="text-xs text-muted-foreground"
                    >
                      Minutos
                    </label>
                    <Input
                      id="admin-request-minutes"
                      type="number"
                      min="0"
                      max="59"
                      step="1"
                      inputMode="numeric"
                      className="min-h-11"
                      value={draft.minutes}
                      onChange={(event) => updateDraft("minutes", event.currentTarget.value)}
                    />
                  </div>
                </div>
              </fieldset>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="admin-request-reason" className="text-sm font-medium">
                Motivo de la carga manual
              </label>
              <Textarea
                id="admin-request-reason"
                required
                maxLength={1000}
                rows={3}
                value={draft.reason}
                onChange={(event) => updateDraft("reason", event.currentTarget.value)}
              />
            </div>
          </fieldset>
          <p className="text-xs text-muted-foreground">
            Se crea una solicitud pendiente; no aprueba ni reserva horas y el correo no modifica el
            perfil del agente.
          </p>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={disabled}>
              Revisar
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2 rounded-md border p-3 text-sm">
            <p>
              <span className="font-medium">Agente:</span> {selectedStaff?.name} · DNI{" "}
              {selectedStaff?.dni}
            </p>
            <p>
              <span className="font-medium">Correo:</span> {draft.requesterEmail.trim()}
            </p>
            <p>
              <span className="font-medium">Móvil:</span> {draft.requesterMobile}
            </p>
            <p>
              <span className="font-medium">Fecha del servicio:</span> {draft.compensatoryDate}
            </p>
            <p>
              <span className="font-medium">Tiempo:</span>{" "}
              {parsedMinutes === null
                ? "—"
                : `${Math.floor(parsedMinutes / 60)} h ${parsedMinutes % 60} min`}
            </p>
            <p>
              <span className="font-medium">Motivo:</span> {draft.reason.trim()}
            </p>
          </div>
          {duplicateMatches && (
            <div
              className="space-y-2 rounded-md border border-amber-500/50 bg-amber-50 p-3 text-sm text-amber-950"
              role="alert"
            >
              <p className="font-medium">
                Hay solicitudes que podrían corresponder a este registro.
              </p>
              <p>
                Revisa los registros coincidentes antes de continuar. Todavía no se creó una
                solicitud.
              </p>
              <p className="text-xs">Referencias: {duplicateMatches.join(", ")}</p>
              <Button type="button" onClick={confirmPossibleDuplicate} disabled={disabled}>
                Registrar de todos modos
              </Button>
            </div>
          )}
          {uncertain && (
            <p className="text-sm text-muted-foreground">
              La respuesta del servidor fue incierta. Reintentaremos la misma solicitud sin cambiar
              sus datos.
            </p>
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                setStep("data");
                setDuplicateMatches(null);
                setError("");
              }}
            >
              Volver a Datos
            </Button>
            {uncertain ? (
              <Button
                type="button"
                onClick={() => frozenAttempt.current && void submit(frozenAttempt.current)}
                disabled={busy}
              >
                Reintentar registro
              </Button>
            ) : !duplicateMatches ? (
              <Button type="button" onClick={() => void submit()} disabled={disabled}>
                Registrar solicitud
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
