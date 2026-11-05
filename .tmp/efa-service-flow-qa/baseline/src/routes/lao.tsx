import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  Info,
  Mail,
  Send,
  UserRound,
} from "lucide-react";
import { useState } from "react";

import { WorkflowHeader } from "@/components/WorkflowHeader";
import { WorkflowIntro } from "@/components/WorkflowIntro";
import { WorkflowShell } from "@/components/WorkflowShell";
import { enviarSolicitudLao, type LaoRequestPayload } from "@/lib/lao.functions";

export const Route = createFileRoute("/lao")({
  head: () => ({
    meta: [
      { title: "Solicitud de LAO | SeLIAR" },
      {
        name: "description",
        content: "Solicitud de licencia anual ordinaria para el equipo de enfermería.",
      },
    ],
  }),
  component: Lao,
});

type Stage = "details" | "review" | "confirmed";

interface LaoDraft {
  emailRequested: boolean;
  requesterName: string;
  requesterEmail: string;
  startMonth: string;
  startDate: string;
  endDate: string;
}

const initialRequest: LaoDraft = {
  emailRequested: false,
  requesterName: "",
  requesterEmail: "",
  startMonth: "",
  startDate: "",
  endDate: "",
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

function isValidMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function isCompleteRequest(request: LaoDraft): request is LaoRequestPayload {
  return (
    request.requesterName.trim().length > 0 &&
    isValidEmail(request.requesterEmail) &&
    isValidMonth(request.startMonth) &&
    isValidDate(request.startDate) &&
    isValidDate(request.endDate) &&
    request.startDate <= request.endDate
  );
}

function Lao() {
  const [request, setRequest] = useState<LaoDraft>(initialRequest);
  const [stage, setStage] = useState<Stage>("details");
  const [attemptedReview, setAttemptedReview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [emailNotSent, setEmailNotSent] = useState(false);
  const submitRequest = useServerFn(enviarSolicitudLao);

  const updateField = <Field extends keyof LaoDraft>(field: Field, value: LaoDraft[Field]) => {
    setRequest((current) => ({ ...current, [field]: value }));
  };

  const isValid = isCompleteRequest(request);
  const dateRangeError =
    attemptedReview &&
    isValidDate(request.startDate) &&
    isValidDate(request.endDate) &&
    request.startDate > request.endDate;

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
          "El envío de LAO todavía no está configurado. Intentá nuevamente más tarde.",
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
          contentWidth="narrow"
          eyebrow="Gestiones de enfermería"
          title="Solicitud de LAO"
          description="Solicitud de licencia anual ordinaria."
        />
      }
    >
      <WorkflowIntro
        eyebrow="Solicitud de LAO"
        description="Completá los datos y revisalos antes de enviarlos."
      >
        <ProgressRail stage={stage} />
      </WorkflowIntro>

      {stage === "details" ? (
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
                id="lao-name"
                label="Nombre y apellido"
                autoComplete="name"
                value={request.requesterName}
                onChange={(value) => updateField("requesterName", value)}
                {...(attemptedReview && !request.requesterName.trim()
                  ? { error: "Este dato es obligatorio." }
                  : {})}
              />
              <Field
                id="lao-email"
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
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
            <SectionHeading
              icon={CalendarDays}
              title="Período de LAO"
              description="Indicá el mes de inicio y las fechas solicitadas."
            />
            <div className="mt-5 space-y-4">
              <Field
                id="lao-start-month"
                label="Mes de inicio de LAO"
                type="month"
                value={request.startMonth}
                onChange={(value) => updateField("startMonth", value)}
                {...(attemptedReview && !isValidMonth(request.startMonth)
                  ? { error: "Seleccioná un mes válido." }
                  : {})}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="lao-start-date"
                  label="Fecha de inicio LAO"
                  type="date"
                  value={request.startDate}
                  onChange={(value) => updateField("startDate", value)}
                  {...(attemptedReview && !isValidDate(request.startDate)
                    ? { error: "Ingresá una fecha válida." }
                    : {})}
                />
                <Field
                  id="lao-end-date"
                  label="Fecha fin de LAO"
                  type="date"
                  value={request.endDate}
                  onChange={(value) => updateField("endDate", value)}
                  {...(attemptedReview && !isValidDate(request.endDate)
                    ? { error: "Ingresá una fecha válida." }
                    : {})}
                />
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Seleccioná una única quincena: primera o segunda, según corresponda.
              </p>
              {dateRangeError && (
                <p className="text-xs font-semibold text-destructive" role="alert">
                  La fecha de inicio no puede ser posterior a la fecha de fin.
                </p>
              )}
            </div>
          </section>

          <PolicyInfo />

          {attemptedReview && !isValid && !dateRangeError && (
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
  autoComplete,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "date" | "email" | "month" | "text";
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

function PolicyInfo() {
  return (
    <aside className="flex items-start gap-3 rounded-2xl border border-secondary bg-secondary/50 p-4 text-sm text-secondary-foreground">
      <Info className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div>
        <h2 className="font-bold">Información de la solicitud</h2>
        <p className="mt-1 leading-5">
          La solicitud corresponde a un único mes de inicio. La Coordinación evalúa la
          disponibilidad y el período solicitado según la normativa vigente.
        </p>
        <p className="mt-2 leading-5">
          La descripción del formulario contempla hasta 12 licencias simultáneas y hasta 15 días
          para personal con más de 10 años de antigüedad o hasta 10 días para el resto. Estos
          criterios se revisan externamente porque el formulario no recopila esos datos.
        </p>
      </div>
    </aside>
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
  request: LaoDraft;
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
        <SummaryRow label="Mes de inicio de LAO" value={request.startMonth} />
        <SummaryRow label="Fecha de inicio LAO" value={request.startDate} />
        <SummaryRow label="Fecha fin de LAO" value={request.endDate} />
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
          LAO registrada
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          La solicitud fue recibida y queda pendiente de evaluación por parte de la organización.
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
