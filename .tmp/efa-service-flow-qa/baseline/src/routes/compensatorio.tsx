import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Info,
  Mail,
  Send,
  UserRound,
  FileWarningIcon,
} from "lucide-react";
import { useState } from "react";

import { WorkflowHeader } from "@/components/WorkflowHeader";
import { WorkflowIntro } from "@/components/WorkflowIntro";
import { WorkflowShell } from "@/components/WorkflowShell";
import {
  enviarSolicitudCompensatorio,
  type CompensatoryRequestPayload,
} from "@/lib/compensatorio.functions";

export const Route = createFileRoute("/compensatorio")({
  head: () => ({
    meta: [
      { title: "Compensatorio | SeLIAR" },
      {
        name: "description",
        content: "Solicitud de horas compensatorias para el equipo de enfermería.",
      },
    ],
  }),
  component: Compensatorio,
});

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

type Stage = "details" | "review" | "confirmed";

type MobileChoice = (typeof MOBILE_CHOICES)[number];

interface CompensatoryDraft {
  emailRequested: boolean;
  requesterName: string;
  requesterEmail: string;
  requesterMobile: MobileChoice | "";
  compensatoryDate: string;
  hours: string;
}

const initialRequest: CompensatoryDraft = {
  emailRequested: false,
  requesterName: "",
  requesterEmail: "",
  requesterMobile: "",
  compensatoryDate: "",
  hours: "",
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearText, monthText, dayText] = value.split("-");
  if (yearText === undefined || monthText === undefined || dayText === undefined) return false;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function isValidHours(value: string): boolean {
  if (!/^\d+(?:[.,]\d+)?$/.test(value.trim())) return false;
  const hours = Number(value.trim().replace(",", "."));
  return Number.isFinite(hours) && hours > 0;
}

function isCompleteRequest(request: CompensatoryDraft): request is CompensatoryRequestPayload {
  return (
    request.requesterName.trim().length > 0 &&
    isValidEmail(request.requesterEmail) &&
    request.requesterMobile !== "" &&
    MOBILE_CHOICES.includes(request.requesterMobile) &&
    isValidDate(request.compensatoryDate) &&
    isValidHours(request.hours)
  );
}

function Compensatorio() {
  const [request, setRequest] = useState<CompensatoryDraft>(initialRequest);
  const [stage, setStage] = useState<Stage>("details");
  const [attemptedReview, setAttemptedReview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [emailNotSent, setEmailNotSent] = useState(false);
  const submitRequest = useServerFn(enviarSolicitudCompensatorio);

  const updateField = <Field extends keyof CompensatoryDraft>(
    field: Field,
    value: CompensatoryDraft[Field],
  ) => setRequest((current) => ({ ...current, [field]: value }));

  const isValid = isCompleteRequest(request);

  const continueToReview = () => {
    setAttemptedReview(true);
    if (isValid) setStage("review");
  };

  const confirmSubmission = async () => {
    if (!isCompleteRequest(request)) {
      setAttemptedReview(true);
      setSubmissionError("Revisá los datos requeridos antes de confirmar la solicitud.");
      return;
    }
    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      const result = await submitRequest({ data: request });
      if (result.state === "submitted") {
        setEmailNotSent(result.emailRequested && !result.emailSent);
        setStage("confirmed");
      } else if (result.state === "not_configured") {
        setSubmissionError(
          "El envío de Compensatorio todavía no está configurado. Intentá nuevamente más tarde.",
        );
      } else {
        setSubmissionError(result.message || "No se pudo enviar la solicitud. Intentá nuevamente.");
      }
    } catch {
      setSubmissionError(
        "No se pudo enviar la solicitud. Revisá tu conexión e intentá nuevamente.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (stage === "confirmed") {
    return (
      <Confirmation
        emailNotSent={emailNotSent}
        onStartAnother={() => {
          setRequest(initialRequest);
          setAttemptedReview(false);
          setSubmissionError(null);
          setEmailNotSent(false);
          setStage("details");
        }}
      />
    );
  }

  return (
    <WorkflowShell
      contentWidth="narrow"
      header={
        <WorkflowHeader
          eyebrow="Gestiones de enfermería"
          title="Solicitud de compensatorio"
          description="Registrá horas compensatorias para su evaluación."
          contentWidth="narrow"
        />
      }
    >
      <WorkflowIntro
        eyebrow="Solicitud de compensatorio"
        description="Completá los datos y revisalos antes de enviarlos."
      >
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-warning-soft px-3 py-1.5 text-xs mb-4  font-bold text-warning-foreground">
          <Clock3 className="size-4" aria-hidden="true" />
          Solicitud pendiente de confirmación
        </span>
        <ProgressRail stage={stage} />
      </WorkflowIntro>

      {stage === "details" ? (
        <>
          <CompensatoryPolicyInfo />
          <form
            className="mt-6 space-y-5"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              continueToReview();
            }}
          >
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
              <SectionHeading
                icon={UserRound}
                title="Datos de quien solicita"
                description="Usaremos el correo para enviarte una copia de la solicitud."
              />
              <div className="mt-5 space-y-4">
                <Field
                  id="compensatory-name"
                  label="Nombre y apellido"
                  autoComplete="name"
                  value={request.requesterName}
                  onChange={(value) => updateField("requesterName", value)}
                  {...(attemptedReview && !request.requesterName.trim()
                    ? { error: "Este dato es obligatorio." }
                    : {})}
                />
                <Field
                  id="compensatory-email"
                  label="Correo electrónico de confirmación"
                  type="email"
                  autoComplete="email"
                  value={request.requesterEmail}
                  onChange={(value) => updateField("requesterEmail", value)}
                  {...(attemptedReview && !request.requesterEmail.trim()
                    ? { error: "Este dato es obligatorio." }
                    : attemptedReview && !isValidEmail(request.requesterEmail)
                      ? { error: "Ingresá un correo electrónico válido." }
                      : {})}
                />
                <div className="space-y-1.5">
                  <label
                    htmlFor="compensatory-mobile"
                    className="block text-xs font-bold uppercase tracking-[0.06em] text-foreground"
                  >
                    Móvil <span aria-hidden="true">*</span>
                  </label>
                  <select
                    id="compensatory-mobile"
                    value={request.requesterMobile}
                    onChange={(event) =>
                      updateField(
                        "requesterMobile",
                        event.target.value as CompensatoryDraft["requesterMobile"],
                      )
                    }
                    aria-required="true"
                    aria-invalid={attemptedReview && !request.requesterMobile}
                    aria-describedby={
                      attemptedReview && !request.requesterMobile
                        ? "compensatory-mobile-error"
                        : undefined
                    }
                    className="min-h-12 w-full border border-input bg-background px-3 py-2.5 text-sm text-foreground shadow-inner outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/35 motion-reduce:transition-none"
                  >
                    <option value="" disabled>
                      Seleccioná un móvil
                    </option>
                    {MOBILE_CHOICES.map((mobile) => (
                      <option key={mobile} value={mobile}>
                        {mobile}
                      </option>
                    ))}
                  </select>
                  {attemptedReview && !request.requesterMobile && (
                    <p
                      id="compensatory-mobile-error"
                      className="text-xs font-semibold text-destructive"
                    >
                      Seleccioná un móvil.
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
              <SectionHeading
                icon={CalendarDays}
                title="Detalle del compensatorio"
                description="Indicá la fecha y la cantidad de horas solicitadas."
              />
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field
                  id="compensatory-date"
                  label="Fecha del compensatorio"
                  type="date"
                  value={request.compensatoryDate}
                  onChange={(value) => updateField("compensatoryDate", value)}
                  {...(attemptedReview && !isValidDate(request.compensatoryDate)
                    ? { error: "Ingresá una fecha válida." }
                    : {})}
                />
                <Field
                  id="compensatory-hours"
                  label="Cantidad de horas"
                  inputMode="decimal"
                  value={request.hours}
                  onChange={(value) => updateField("hours", value)}
                  {...(attemptedReview && !isValidHours(request.hours)
                    ? { error: "Ingresá una cantidad de horas positiva." }
                    : {})}
                />
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                Podés usar decimales, por ejemplo: 2,5 horas.
              </p>
            </section>

            {attemptedReview && !isValid && (
              <div
                className="rounded-xl border border-destructive/45 bg-destructive/10 px-4 py-3 text-sm text-foreground"
                role="alert"
              >
                Completá los campos requeridos antes de revisar la solicitud.
              </div>
            )}

            <button
              type="submit"
              className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-bold text-primary-foreground shadow-[0_4px_0_oklch(0.23_0.04_202)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none"
            >
              Revisar solicitud
              <ClipboardCheck className="size-5" aria-hidden="true" />
            </button>
          </form>
        </>
      ) : (
        <Review
          request={request}
          onBack={() => setStage("details")}
          onEmailRequestedChange={(emailRequested) => updateField("emailRequested", emailRequested)}
          onConfirm={confirmSubmission}
          isSubmitting={isSubmitting}
          submissionError={submissionError}
        />
      )}
    </WorkflowShell>
  );
}

function CompensatoryPolicyInfo() {
  const [expanded, setExpanded] = useState(false);

  return (
    <section
      className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm sm:p-5"
      aria-labelledby="compensatory-policy-heading"
    >
      <div className="flex items-start gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-800">
          <FileWarningIcon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="compensatory-policy-heading" className="font-display text-base font-bold">
            Información sobre compensatorios
          </h2>
          <div
            id="compensatory-policy-content"
            className={`relative mt-1 overflow-hidden text-sm leading-5 text-muted-foreground transition-[max-height] duration-150 motion-reduce:transition-none ${expanded ? "max-h-[120rem]" : "max-h-16"}`}
          >
            <div className="space-y-4 pr-1">
              <p>
                <strong className="text-foreground">ARTÍCULO 68°. a.</strong> Cuando el servicio lo
                permita, el Jefe de la Unidad de Organización podrá autorizar franquicias de hasta 3
                jornadas laborables por mes calendario (en forma total o fraccionada), compensables
                en días o turnos complementarios, de trabajo, de igual duración que la franquicia
                otorgada.
              </p>
              <p>
                Estas franquicias deben compensarse dentro de los 30 días posteriores a su
                otorgamiento, pudiendo prolongarse este término hasta 90 días cuando fundadas
                razones de servicio, así lo justifiquen.
              </p>
              <p>
                <strong className="text-foreground">b.</strong> Cuando por razones de servicio
                excepcionales, el agente deba desempeñarse fuera del horario habitual de trabajo, y
                las horas trabajadas en ampliación horaria no hayan sido autorizadas como “horas
                extraordinarias”, deberán computársele como “horas compensatorias”, valorándose cada
                hora trabajada en exceso, del mismo modo que se efectúa el cálculo para el pago de
                las extras, teniendo en cuenta el día (laborable o no) y el horario en que efectuó
                la ampliación horaria.
              </p>
              <p>
                Las horas compensatorias registradas a favor del agente deberán otorgarse cuando
                éste lo solicite y siempre que el servicio lo permita. No obstante, no podrá
                prorrogarse su autorización por más de 48 horas a partir de la fecha en que se
                solicitara.
              </p>
            </div>
            {!expanded && (
              <span
                className="pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-indigo-50 via-indigo-50/90 to-transparent"
                aria-hidden="true"
              />
            )}
          </div>
        </div>
      </div>
      <button
        type="button"
        className=" inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-bold text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:brightness-95 motion-safe:duration-150 motion-reduce:transition-none"
        aria-controls="compensatory-policy-content"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        {expanded ? "Ocultar información" : "Leer información completa"}
        <ChevronDown
          className={`size-4 transition-transform motion-safe:duration-150 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
    </section>
  );
}

function ProgressRail({ stage }: { stage: Stage }) {
  const steps = ["Datos", "Revisión", "Confirmación"];
  const currentIndex = stage === "details" ? 0 : stage === "review" ? 1 : 2;
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Progreso de la solicitud">
      {steps.map((step, index) => {
        const complete = index < currentIndex;
        const current = index === currentIndex;
        return (
          <li key={step} aria-current={current ? "step" : undefined} className="min-w-0">
            <div
              className={`h-1 rounded-full ${complete || current ? "bg-[var(--brand-orange)]" : "bg-border"}`}
              aria-hidden="true"
            />
            <p
              className={`mt-2 text-xs font-bold ${current ? "text-foreground" : "text-muted-foreground"}`}
            >
              <span className="mr-1" aria-hidden="true">
                {complete ? "✓" : `${index + 1}.`}
              </span>
              {step}
              {current && <span className="sr-only"> (etapa actual)</span>}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof UserRound;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div>
        <h2 className="font-display text-xl font-bold text-foreground">{title}</h2>
        {description && (
          <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  autoComplete,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "date" | "email" | "text";
  inputMode?: "decimal";
  autoComplete?: string;
  error?: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-xs font-bold uppercase tracking-[0.06em] text-foreground"
      >
        {label} <span aria-hidden="true">*</span>
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-required="true"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        maxLength={type === "text" ? 255 : undefined}
        className={`min-h-12 w-full border bg-background px-3 py-2.5 text-sm text-foreground shadow-inner outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/35 motion-reduce:transition-none ${error ? "border-destructive" : "border-input"}`}
      />
      {error && (
        <p id={errorId} className="text-xs font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function Review({
  request,
  onBack,
  onEmailRequestedChange,
  onConfirm,
  isSubmitting,
  submissionError,
}: {
  request: CompensatoryDraft;
  onBack: () => void;
  onEmailRequestedChange: (requested: boolean) => void;
  onConfirm: () => Promise<void>;
  isSubmitting: boolean;
  submissionError: string | null;
}) {
  return (
    <section
      className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 sm:p-7"
      aria-labelledby="review-heading"
    >
      <SectionHeading
        icon={ClipboardCheck}
        title="Revisá antes de confirmar"
        description="Verificá los datos. Podés volver a editarlos si hace falta."
      />
      <h2 id="review-heading" className="sr-only">
        Revisión de la solicitud
      </h2>
      <dl className="mt-6 divide-y divide-border rounded-xl border border-border bg-muted/35 px-4">
        <SummaryRow label="Solicita" value={request.requesterName} />
        <SummaryRow label="Correo de confirmación" value={request.requesterEmail} />
        <SummaryRow label="Móvil" value={request.requesterMobile} />
        <SummaryRow label="Fecha del compensatorio" value={request.compensatoryDate} />
        <SummaryRow label="Cantidad de horas" value={request.hours} />
      </dl>
      {submissionError && (
        <div
          className="mt-3 rounded-xl border border-destructive/45 bg-destructive/10 px-4 py-3 text-sm text-foreground"
          role="alert"
        >
          {submissionError}
        </div>
      )}
      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground focus-within:ring-2 focus-within:ring-ring">
        <input
          type="checkbox"
          checked={request.emailRequested}
          onChange={(event) => onEmailRequestedChange(event.target.checked)}
          disabled={isSubmitting}
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
        <Mail className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>Quiero recibir una copia de la solicitud por correo electrónico</span>
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl border border-input bg-background px-4 text-sm font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
          Editar datos
        </button>
        <button
          type="button"
          onClick={() => void onConfirm()}
          disabled={isSubmitting}
          className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-[0_4px_0_oklch(0.23_0.04_202)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 motion-reduce:transform-none motion-reduce:transition-none"
        >
          {isSubmitting ? "Enviando solicitud…" : "Confirmar solicitud"}
          <Send className="size-5" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </dt>
      <dd className="break-words text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function Confirmation({
  emailNotSent,
  onStartAnother,
}: {
  emailNotSent: boolean;
  onStartAnother: () => void;
}) {
  return (
    <main className="workflow-background min-h-screen px-4 pb-28 pt-12 sm:pt-20">
      <section
        className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-7 text-center shadow-sm sm:p-10"
        aria-labelledby="confirmation-heading"
      >
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-secondary text-primary">
          <CheckCircle2 className="size-9" aria-hidden="true" />
        </span>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-primary">
          Solicitud recibida
        </p>
        <h1
          id="confirmation-heading"
          className="mt-2 font-display text-3xl font-bold text-foreground"
        >
          Compensatorio registrado
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          La solicitud fue recibida y queda pendiente de confirmación por parte de la Coordinación
          de Enfermería.
        </p>
        {emailNotSent && (
          <p className="mt-3 rounded-xl border border-warning/35 bg-warning-soft px-4 py-3 text-left text-sm text-warning-foreground">
            La solicitud se guardó, pero no se pudo enviar la copia por correo. Conservá los datos
            ingresados.
          </p>
        )}
        <button
          type="button"
          onClick={onStartAnother}
          className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl border border-input bg-background px-5 text-sm font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
        >
          Iniciar otra solicitud
        </button>
      </section>
    </main>
  );
}
