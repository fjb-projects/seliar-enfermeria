import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Mail,
  Phone,
  Send,
  UserRound,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  listPublicCompensatoryAgents,
  submitPublicCompensatoryRequest,
} from "@/lib/compensatory-public.functions";
import {
  ensureClientOperationId,
  isPastCompensatoryDate,
  isWholeMinuteHours,
  operationIdAfterIntentChange,
  localDateString,
  permanentSubmissionRejectionMessage,
} from "@/lib/compensatory-public-client";

export type PublicAgentOption = { id: string; name: string; hasProfileEmail: boolean };

type Stage = "details" | "review" | "confirmed";
type RequestDraft = {
  staffId: string;
  requesterEmail: string;
  requesterMobile: string;
  compensatoryDate: string;
  hours: string;
};

const MOBILE_CHOICES = [
  "Móvil 1",
  "Móvil 2",
  "Móvil 3",
  "Móvil 4",
  "Móvil 5",
  "Móvil 6",
  "Móvil 7",
  "Móvil 9",
  "Móvil 11",
  "Móvil 12",
  "Móvil 15",
  "Móvil 26",
  "Móvil Flotante",
  "Otro Movil no Nomenclado",
] as const;

const EMPTY_REQUEST: RequestDraft = {
  staffId: "",
  requesterEmail: "",
  requesterMobile: "",
  compensatoryDate: "",
  hours: "",
};

export function resolveUniquePublicAgentId(
  agents: PublicAgentOption[],
  officialName: string,
): string | undefined {
  const matches = agents.filter((agent) => agent.name === officialName);
  return matches.length === 1 ? matches[0]?.id : undefined;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().trim();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearPart, monthPart, dayPart] = value.split("-");
  if (!yearPart || !monthPart || !dayPart) return false;
  const date = new Date(0);
  date.setUTCFullYear(Number(yearPart), Number(monthPart) - 1, Number(dayPart));
  date.setUTCHours(0, 0, 0, 0);
  return (
    date.getUTCFullYear() === Number(yearPart) &&
    date.getUTCMonth() === Number(monthPart) - 1 &&
    date.getUTCDate() === Number(dayPart)
  );
}

function isValidHours(value: string) {
  if (!/^\d+(?:[.,]\d+)?$/.test(value.trim())) return false;
  const hours = Number(value.trim().replace(",", "."));
  return Number.isFinite(hours) && hours > 0;
}

function uniqueAgent(agents: PublicAgentOption[], id: string) {
  const agent = agents.find((option) => option.id === id);
  return agent && resolveUniquePublicAgentId(agents, agent.name) === id ? agent : undefined;
}

export function PublicEmailField({
  hasProfileEmail,
  value,
  onChange,
}: {
  hasProfileEmail: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  if (hasProfileEmail) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-bold uppercase tracking-[0.06em] text-foreground">
          Correo electrónico
        </p>
        <p className="text-sm text-foreground">Ya hay un correo registrado para recibir la respuesta.</p>
        <p className="text-sm text-muted-foreground">Si necesitás cambiarlo, contactá a Coordinación.</p>
      </div>
    );
  }
  return (
    <Field
      id="public-requester-email"
      label="Correo electrónico"
      type="email"
      value={value}
      onChange={onChange}
      help="Coordinación usará este correo para comunicarte la respuesta cuando resuelva la solicitud. Todavía no se envía ningún correo."
    />
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  min,
  help,
  required = true,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "date" | "email" | "text";
  inputMode?: "decimal";
  min?: string;
  help?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-xs font-bold uppercase tracking-[0.06em] text-foreground"
      >
        {label} {required && <span aria-hidden="true">*</span>}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        min={min}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        required={required}
        disabled={disabled}
        autoComplete={type === "email" ? "email" : undefined}
        maxLength={type === "text" || type === "email" ? 255 : undefined}
        className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-inner outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/35 motion-reduce:transition-none"
      />
      {help && <p className="text-xs leading-5 text-muted-foreground">{help}</p>}
    </div>
  );
}

export function CompensatoryPublicForm() {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("details");
  const [request, setRequest] = useState<RequestDraft>(EMPTY_REQUEST);
  const [agents, setAgents] = useState<PublicAgentOption[] | null>(null);
  const [agentSearch, setAgentSearch] = useState("");
  const [agentListOpen, setAgentListOpen] = useState(false);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [attemptedReview, setAttemptedReview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [permanentRejection, setPermanentRejection] = useState(false);
  const clientOperationId = useRef<string | null>(null);
  const fetchAgents = useServerFn(listPublicCompensatoryAgents);
  const submitRequest = useServerFn(submitPublicCompensatoryRequest);

  useEffect(() => {
    if (!open || agents !== null || loadingAgents || agentsError) return;
    setLoadingAgents(true);
    void fetchAgents()
      .then((result) => setAgents(result))
      .catch(() => setAgentsError("No se pudo cargar la lista de agentes. Intentá nuevamente."))
      .finally(() => setLoadingAgents(false));
  }, [open, agents, loadingAgents, agentsError]);

  const updateField = <Field extends keyof RequestDraft>(
    field: Field,
    value: RequestDraft[Field],
  ) => {
    if (request[field] === value) return;
    clientOperationId.current = operationIdAfterIntentChange(
      clientOperationId.current,
      request[field],
      value,
    );
    setSubmissionError(null);
    setPermanentRejection(false);
    setRequest((current) => {
      if (current[field] === value) return current;
      return { ...current, [field]: value };
    });
  };

  const selectedAgent = agents ? uniqueAgent(agents, request.staffId) : undefined;
  const matchingAgents = (agents ?? [])
    .filter((agent) => normalize(agent.name).includes(normalize(agentSearch)))
    .slice(0, 60);
  const emailValid = Boolean(selectedAgent?.hasProfileEmail) || isValidEmail(request.requesterEmail);
  const emailError = attemptedReview && !emailValid;
  const dateError =
    attemptedReview &&
    (!isValidDate(request.compensatoryDate) || isPastCompensatoryDate(request.compensatoryDate));
  const hoursError =
    attemptedReview && (!isValidHours(request.hours) || !isWholeMinuteHours(request.hours));
  const isValid = Boolean(
    selectedAgent &&
    emailValid &&
    MOBILE_CHOICES.includes(request.requesterMobile as (typeof MOBILE_CHOICES)[number]) &&
    isValidDate(request.compensatoryDate) &&
    !isPastCompensatoryDate(request.compensatoryDate) &&
    isValidHours(request.hours) &&
    isWholeMinuteHours(request.hours),
  );

  const reviewRequest = () => {
    setAttemptedReview(true);
    if (permanentRejection) return;
    if (isValid) setStage("review");
  };

  const confirmRequest = async () => {
    if (!isValid || !selectedAgent) {
      setAttemptedReview(true);
      setSubmissionError("Revisá los datos requeridos antes de confirmar la solicitud.");
      setStage("details");
      return;
    }

    const operationId = ensureClientOperationId(clientOperationId.current);
    clientOperationId.current = operationId;
    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      const result = await submitRequest({
        data: {
          clientOperationId: operationId,
          staffId: selectedAgent.id,
          requesterEmail: request.requesterEmail.trim(),
          requesterMobile: request.requesterMobile,
          compensatoryDate: request.compensatoryDate,
          hours: request.hours.trim(),
        },
      });
      if (result.state === "submitted") setStage("confirmed");
      else setSubmissionError("No se pudo registrar la solicitud. Intentá nuevamente.");
    } catch (error) {
      const permanentMessage = permanentSubmissionRejectionMessage(error);
      if (permanentMessage) {
        setSubmissionError(permanentMessage);
        setPermanentRejection(true);
        setAttemptedReview(true);
        setStage("details");
      } else {
        setSubmissionError(
          "No pudimos confirmar si la solicitud se registró. Tus datos siguen disponibles; podés reintentar sin crear otra solicitud.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const startAnother = () => {
    setRequest(EMPTY_REQUEST);
    setStage("details");
    setAttemptedReview(false);
    setSubmissionError(null);
    setAgentSearch("");
    clientOperationId.current = null;
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isSubmitting) setOpen(nextOpen);
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="mt-5 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-bold text-primary-foreground shadow-[0_4px_0_oklch(0.23_0.04_202)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto sm:min-w-64"
        >
          Iniciar solicitud
          <ClipboardCheck className="size-5" aria-hidden="true" />
        </button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[calc(100svh-1.5rem-env(safe-area-inset-bottom))] w-[calc(100%-1.5rem)] max-w-2xl gap-3 overflow-y-auto rounded-xl p-4 sm:p-5"
        onEscapeKeyDown={(event) => {
          if (isSubmitting) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (isSubmitting) event.preventDefault();
        }}
      >
        {stage === "confirmed" ? (
          <section className="py-2 text-center" aria-labelledby="public-confirmation-heading">
            <CheckCircle2 className="mx-auto size-10 text-primary" aria-hidden="true" />
            <DialogHeader className="mt-3">
              <DialogTitle id="public-confirmation-heading">Solicitud registrada</DialogTitle>
              <DialogDescription>
                Coordinación revisará el pedido y verificará el destinatario antes de comunicar una
                confirmación o negación. Esta pantalla no confirma que se haya enviado un correo.
              </DialogDescription>
            </DialogHeader>
            <button
              type="button"
              onClick={startAnother}
              className="mt-5 min-h-11 rounded-lg border border-input bg-background px-4 text-sm font-bold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Iniciar otra solicitud
            </button>
          </section>
        ) : (
          <>
            <DialogHeader className="pr-8 text-left">
              <DialogTitle>Solicitud de compensatorio</DialogTitle>
              <DialogDescription>
                {stage === "details"
                  ? "Completá los datos para que Coordinación evalúe el pedido."
                  : "Revisá los datos antes de registrar la solicitud."}
              </DialogDescription>
            </DialogHeader>

            <ol className="grid grid-cols-2 gap-2" aria-label="Progreso de la solicitud">
              {["Datos", "Revisión"].map((label, index) => (
                <li
                  key={label}
                  aria-current={stage === (index === 0 ? "details" : "review") ? "step" : undefined}
                >
                  <div
                    className={`h-1 rounded-full ${stage === "review" || index === 0 ? "bg-[var(--brand-orange)]" : "bg-border"}`}
                    aria-hidden="true"
                  />
                  <span className="mt-1 block text-xs font-bold text-muted-foreground">
                    {label}
                  </span>
                </li>
              ))}
            </ol>

            {stage === "details" ? (
              <form
                className="space-y-4"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  reviewRequest();
                }}
              >
                <fieldset disabled={isSubmitting} className="space-y-4">
                  <legend className="sr-only">Datos de la solicitud</legend>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="public-agent-search"
                      className="block text-xs font-bold uppercase tracking-[0.06em] text-foreground"
                    >
                      Agente <span aria-hidden="true">*</span>
                    </label>
                    <input
                      id="public-agent-search"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={agentListOpen}
                      aria-controls="public-agent-options"
                      autoComplete="off"
                      placeholder="Buscá por nombre y apellido"
                      value={selectedAgent && !agentSearch ? selectedAgent.name : agentSearch}
                      onFocus={() => setAgentListOpen(true)}
                      onChange={(event) => {
                        setAgentSearch(event.currentTarget.value);
                        setAgentListOpen(true);
                        updateField("staffId", "");
                      }}
                      className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/35"
                    />
                    {loadingAgents && (
                      <p className="text-xs text-muted-foreground" role="status">
                        Cargando agentes…
                      </p>
                    )}
                    {agentsError && (
                      <div
                        className="flex items-center justify-between gap-3 text-xs text-destructive"
                        role="alert"
                      >
                        <span>{agentsError}</span>
                        <button
                          type="button"
                          className="font-bold underline"
                          onClick={() => setAgentsError(null)}
                        >
                          Reintentar
                        </button>
                      </div>
                    )}
                    {agents && agentListOpen && (
                      <ul
                        id="public-agent-options"
                        role="listbox"
                        aria-label="Agentes"
                        className="max-h-40 overflow-y-auto rounded-md border border-border bg-background p-1"
                      >
                        {matchingAgents.length === 0 ? (
                          <li className="px-3 py-2 text-sm text-muted-foreground" role="status">
                            No se encontraron agentes.
                          </li>
                        ) : (
                          matchingAgents.map((agent) => {
                            const isUnique =
                              resolveUniquePublicAgentId(agents, agent.name) === agent.id;
                            return (
                              <li key={agent.id}>
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={request.staffId === agent.id}
                                  disabled={!isUnique}
                                  onClick={() => {
                                    if (!isUnique) return;
                                    updateField("staffId", agent.id);
                                    updateField("requesterEmail", "");
                                    setAgentSearch("");
                                    setAgentListOpen(false);
                                  }}
                                  className="flex min-h-10 w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <span>{agent.name}</span>
                                  {!isUnique && (
                                    <span className="text-xs text-muted-foreground">
                                      Nombre repetido
                                    </span>
                                  )}
                                </button>
                              </li>
                            );
                          })
                        )}
                      </ul>
                    )}
                    {attemptedReview && !selectedAgent && (
                      <p className="text-xs font-semibold text-destructive">
                        Elegí un agente con nombre único.
                      </p>
                    )}
                    <p className="text-xs leading-5 text-muted-foreground">
                      Se muestra el nombre oficial completo. Si hay nombres repetidos, Coordinación
                      deberá ayudar a identificar el registro correcto.
                    </p>
                  </div>

                  <PublicEmailField
                    hasProfileEmail={Boolean(selectedAgent?.hasProfileEmail)}
                    value={request.requesterEmail}
                    onChange={(value) => updateField("requesterEmail", value)}
                  />
                  {emailError && (
                    <p className="-mt-3 text-xs font-semibold text-destructive">
                      Ingresá un correo electrónico válido.
                    </p>
                  )}

                  <div className="space-y-1.5">
                    <label
                      htmlFor="public-requester-mobile"
                      className="block text-xs font-bold uppercase tracking-[0.06em] text-foreground"
                    >
                      Móvil <span aria-hidden="true">*</span>
                    </label>
                    <select
                      id="public-requester-mobile"
                      required
                      value={request.requesterMobile}
                      onChange={(event) =>
                        updateField("requesterMobile", event.currentTarget.value)
                      }
                      className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Seleccioná un móvil</option>
                      {MOBILE_CHOICES.map((mobile) => (
                        <option key={mobile} value={mobile}>
                          {mobile}
                        </option>
                      ))}
                    </select>
                    {attemptedReview && !request.requesterMobile && (
                      <p className="text-xs font-semibold text-destructive">Seleccioná un móvil.</p>
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      id="public-compensatory-date"
                      label="Fecha del compensatorio"
                      type="date"
                      min={localDateString(new Date())}
                      value={request.compensatoryDate}
                      onChange={(value) => updateField("compensatoryDate", value)}
                    />
                    {dateError && (
                      <p className="-mt-3 text-xs font-semibold text-destructive sm:col-span-2">
                        {!isValidDate(request.compensatoryDate)
                          ? "Ingresá una fecha válida."
                          : "Elegí hoy o una fecha posterior."}
                      </p>
                    )}
                    <Field
                      id="public-compensatory-hours"
                      label="Cantidad de horas"
                      inputMode="decimal"
                      value={request.hours}
                      onChange={(value) => updateField("hours", value)}
                      help="Podés usar decimales, por ejemplo: 2,5 horas."
                    />
                    {hoursError && (
                      <p className="-mt-3 text-xs font-semibold text-destructive sm:col-span-2">
                        {!isValidHours(request.hours)
                          ? "Ingresá una cantidad de horas positiva."
                          : "La cantidad debe equivaler a un número entero de minutos; por ejemplo, 0,5 horas."}
                      </p>
                    )}
                  </div>
                  <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
                    No necesitás iniciar sesión. El nombre seleccionado vincula la solicitud al
                    agente registrado, pero no verifica la identidad de quien completa el
                    formulario.
                  </p>
                </fieldset>
                {submissionError && (
                  <p
                    className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
                    role="alert"
                  >
                    {submissionError}
                  </p>
                )}
                {attemptedReview && !isValid && !submissionError && (
                  <p
                    className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
                    role="alert"
                  >
                    Completá los campos requeridos antes de revisar la solicitud.
                  </p>
                )}
                <button
                  type="submit"
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Revisar solicitud <ClipboardCheck className="size-4" aria-hidden="true" />
                </button>
              </form>
            ) : (
              <section aria-labelledby="public-review-heading">
                <h3 id="public-review-heading" className="sr-only">
                  Revisión de la solicitud
                </h3>
                <dl className="divide-y divide-border rounded-lg border border-border bg-muted/35 px-3">
                  <SummaryRow
                    label="Agente"
                    value={selectedAgent?.name ?? ""}
                    icon={<UserRound aria-hidden="true" />}
                  />
                  <SummaryRow
                    label="Correo"
                    value={selectedAgent?.hasProfileEmail ? "Correo registrado en el perfil (oculto)" : request.requesterEmail}
                    icon={<Mail aria-hidden="true" />}
                  />
                  <SummaryRow
                    label="Móvil"
                    value={request.requesterMobile}
                    icon={<Phone aria-hidden="true" />}
                  />
                  <SummaryRow
                    label="Fecha"
                    value={request.compensatoryDate}
                    icon={<CalendarDays aria-hidden="true" />}
                  />
                  <SummaryRow
                    label="Horas"
                    value={request.hours}
                    icon={<Clock3 aria-hidden="true" />}
                  />
                </dl>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  La solicitud quedará pendiente de revisión por Coordinación. No se enviará una
                  resolución hasta que Coordinación la verifique.
                </p>
                {submissionError && (
                  <p
                    className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
                    role="alert"
                  >
                    {submissionError}
                  </p>
                )}
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      setStage("details");
                      setSubmissionError(null);
                    }}
                    className="min-h-11 rounded-lg border border-input bg-background px-4 text-sm font-bold text-foreground hover:bg-muted disabled:opacity-60"
                  >
                    Editar datos
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => void confirmRequest()}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:cursor-wait disabled:opacity-70"
                  >
                    {isSubmitting ? "Registrando…" : "Confirmar solicitud"}
                    <Send className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="grid grid-cols-[1.5rem_6rem_1fr] items-center gap-2 py-2.5">
      <span className="size-4 text-muted-foreground">{icon}</span>
      <dt className="text-xs font-bold uppercase text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}
