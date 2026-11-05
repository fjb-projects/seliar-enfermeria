import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  Clock3,
  Send,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { WorkflowHeader } from "@/components/WorkflowHeader";
import { WorkflowIntro } from "@/components/WorkflowIntro";
import { WorkflowShell } from "@/components/WorkflowShell";
import { enviarSolicitudCambio } from "@/lib/cambio-guardia.functions";

export const Route = createFileRoute("/cambio-guardia")({
  head: () => ({
    meta: [
      { title: "Cambio de guardia | SeLIAR" },
      {
        name: "description",
        content: "Solicitud de cambio de guardia de común acuerdo, pendiente de aprobación.",
      },
    ],
  }),
  component: CambioGuardia,
});

type Coverage = "complete" | "partial";
type Stage = "details" | "review" | "confirmed";

interface ChangeRequest {
  emailRequested: boolean;
  coverage: Coverage;
  requesterName: string;
  requesterMobile: string;
  requesterEmail: string;
  guardDate: string;
  counterpartName: string;
  counterpartMobile: string;
  returnDate: string;
  partialStart: string;
  partialEnd: string;
  note: string;
}

type PersonFieldName =
  | "requesterName"
  | "requesterMobile"
  | "requesterEmail"
  | "guardDate"
  | "counterpartName"
  | "counterpartMobile"
  | "returnDate";

interface PersonField {
  id: string;
  label: string;
  field: PersonFieldName;
  type?: "date" | "email";
  inputMode?: "numeric";
  autoComplete?: string;
}

const initialRequest: ChangeRequest = {
  emailRequested: false,
  coverage: "complete",
  requesterName: "",
  requesterMobile: "",
  requesterEmail: "",
  guardDate: "",
  counterpartName: "",
  counterpartMobile: "",
  returnDate: "",
  partialStart: "",
  partialEnd: "",
  note: "",
};

const requiredFields: PersonFieldName[] = [
  "requesterName",
  "requesterMobile",
  "requesterEmail",
  "guardDate",
  "counterpartName",
  "counterpartMobile",
  "returnDate",
];

const requesterFields: PersonField[] = [
  {
    id: "requester-name",
    label: "Nombre de quien solicita",
    field: "requesterName",
    autoComplete: "name",
  },
  {
    id: "requester-mobile",
    label: "Móvil de quien solicita",
    field: "requesterMobile",
    inputMode: "numeric",
  },
  {
    id: "requester-email",
    label: "Correo electrónico de confirmación",
    field: "requesterEmail",
    type: "email",
    autoComplete: "email",
  },
  { id: "guard-date", label: "Fecha de la guardia", field: "guardDate", type: "date" },
];

const counterpartFields: PersonField[] = [
  {
    id: "counterpart-name",
    label: "Nombre de la contraparte",
    field: "counterpartName",
    autoComplete: "name",
  },
  {
    id: "counterpart-mobile",
    label: "Móvil de la contraparte",
    field: "counterpartMobile",
    inputMode: "numeric",
  },
  { id: "return-date", label: "Fecha de devolución", field: "returnDate", type: "date" },
];

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function CambioGuardia() {
  const [request, setRequest] = useState<ChangeRequest>(initialRequest);
  const [stage, setStage] = useState<Stage>("details");
  const [attemptedReview, setAttemptedReview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [emailNotSent, setEmailNotSent] = useState(false);
  const submitChangeRequest = useServerFn(enviarSolicitudCambio);

  const updateField = <Field extends keyof ChangeRequest>(
    field: Field,
    value: ChangeRequest[Field],
  ) => {
    setRequest((current) => ({ ...current, [field]: value }));
  };

  const missingFields = requiredFields.filter((field) => !request[field].trim());
  const hasInvalidRequesterEmail =
    Boolean(request.requesterEmail.trim()) && !isValidEmail(request.requesterEmail);
  const isValid = missingFields.length === 0 && !hasInvalidRequesterEmail;

  const continueToReview = () => {
    setAttemptedReview(true);
    if (isValid) setStage("review");
  };

  const confirmSubmission = async () => {
    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      const result = await submitChangeRequest({ data: request });
      if (result.state === "submitted") {
        setEmailNotSent(result.emailRequested && !result.emailSent);
        setStage("confirmed");
      } else if (result.state === "not_configured") {
        setSubmissionError(
          "El envío de Cambio de guardia todavía no está configurado. Intentá nuevamente más tarde.",
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
      header={
        <WorkflowHeader
          eyebrow="Gestiones de enfermería"
          title="Cambio de guardia"
          description="Formulario de solicitud entre colegas"
        />
      }
    >
      <WorkflowIntro
        eyebrow="Solicitud de cambio"
        description="Solicitá un cambio de común acuerdo. La solicitud queda pendiente de aprobación."
      >
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-warning-soft px-3 py-1.5 text-xs font-bold text-warning-foreground">
          <Clock3 className="size-4" aria-hidden="true" />
          Pendiente de aprobación
        </span>
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
          <section
            className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7"
            aria-labelledby="coverage-heading"
          >
            <SectionHeading
              icon={ClipboardCheck}
              title="Tipo de cobertura"
              description="Elegí cómo se cubrirá la guardia."
            />
            <fieldset className="mt-5">
              <legend id="coverage-heading" className="sr-only">
                Tipo de cobertura
              </legend>
              <div
                className="grid gap-2 rounded-xl bg-muted p-2 sm:grid-cols-2"
                role="radiogroup"
                aria-label="Tipo de cobertura"
              >
                <SegmentedOption
                  checked={request.coverage === "complete"}
                  description="Toda la guardia"
                  label="Cobertura completa"
                  onChange={() => updateField("coverage", "complete")}
                  value="complete"
                />
                <SegmentedOption
                  checked={request.coverage === "partial"}
                  description="Por una franja horaria"
                  label="Cobertura parcial"
                  onChange={() => updateField("coverage", "partial")}
                  value="partial"
                />
              </div>
            </fieldset>
            <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">
              {request.coverage === "complete"
                ? "Seleccionaste una cobertura de toda la guardia."
                : "Seleccionaste una cobertura por una franja horaria."}
            </p>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <PersonSection
              fields={requesterFields}
              icon={UsersRound}
              title="Quien solicita"
              request={request}
              updateField={updateField}
              showErrors={attemptedReview}
            />
            <PersonSection
              fields={counterpartFields}
              icon={UsersRound}
              title="Con quien cambiás"
              request={request}
              updateField={updateField}
              showErrors={attemptedReview}
            />
          </div>

          {request.coverage === "partial" && (
            <section
              className="overflow-hidden rounded-2xl border border-primary/35 bg-secondary/55 p-5 shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 sm:p-7"
              aria-labelledby="partial-heading"
            >
              <SectionHeading
                icon={Clock3}
                title="Detalle del reemplazo parcial"
                description="Indicá el horario exacto de inicio y finalización."
              />
              <h2 id="partial-heading" className="sr-only">
                Detalle del reemplazo parcial
              </h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field
                  id="partial-start"
                  label="Hora de inicio"
                  type="time"
                  required={false}
                  value={request.partialStart}
                  onChange={(value) => updateField("partialStart", value)}
                />
                <Field
                  id="partial-end"
                  label="Hora de finalización"
                  type="time"
                  required={false}
                  value={request.partialEnd}
                  onChange={(value) => updateField("partialEnd", value)}
                />
              </div>
            </section>
          )}

          <section
            className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7"
            aria-labelledby="note-heading"
          >
            <SectionHeading
              icon={ClipboardCheck}
              title="Aclaración"
              description="Opcional: agregá el motivo u otra información relevante."
            />
            <div className="mt-5">
              <label htmlFor="change-note" id="note-heading" className="sr-only">
                Aclaración
              </label>
              <textarea
                id="change-note"
                value={request.note}
                onChange={(event) => updateField("note", event.target.value)}
                rows={4}
                maxLength={1000}
                className="w-full resize-y border border-input bg-background px-3 py-3 text-sm text-foreground shadow-inner outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/35 motion-reduce:transition-none"
                placeholder="Motivo o aclaración del cambio"
              />
            </div>
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
                {complete ? "✓" : index + 1}.
              </span>
              {step}
              {current && <span className="sr-only"> (etapa actual)</span>}
              {complete && <span className="sr-only"> (completada)</span>}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function SegmentedOption({
  checked,
  description,
  label,
  onChange,
  value,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: () => void;
  value: Coverage;
}) {
  return (
    <label
      className={`cursor-pointer rounded-lg border px-4 py-3 transition-colors focus-within:ring-2 focus-within:ring-ring ${checked ? "border-primary bg-card text-foreground shadow-sm" : "border-transparent text-muted-foreground hover:bg-card/70"} motion-reduce:transition-none`}
    >
      <input
        className="sr-only"
        type="radio"
        name="coverage"
        value={value}
        checked={checked}
        onChange={onChange}
      />
      <span className="flex items-start justify-between gap-3">
        <span>
          <span className="block text-sm font-bold">{label}</span>
          <span className="mt-0.5 block text-xs font-medium">{description}</span>
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${checked ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
        >
          {checked ? "Elegida" : "Elegir"}
        </span>
      </span>
    </label>
  );
}

function PersonSection({
  fields,
  icon,
  title,
  request,
  updateField,
  showErrors,
}: {
  fields: PersonField[];
  icon: LucideIcon;
  title: string;
  request: ChangeRequest;
  updateField: <Field extends keyof ChangeRequest>(
    field: Field,
    value: ChangeRequest[Field],
  ) => void;
  showErrors: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
      <SectionHeading icon={icon} title={title} />
      <div className="mt-5 space-y-4">
        {fields.map(({ id, label, field, type, inputMode, autoComplete }) => {
          const error = showErrors
            ? !request[field].trim()
              ? "Este dato es obligatorio."
              : field === "requesterEmail" && !isValidEmail(request[field])
                ? "Ingresá un correo electrónico válido."
                : undefined
            : undefined;

          return (
            <Field
              key={id}
              id={id}
              label={label}
              {...(type ? { type } : {})}
              {...(inputMode ? { inputMode } : {})}
              {...(autoComplete ? { autoComplete } : {})}
              value={request[field]}
              onChange={(value) => updateField(field, value)}
              {...(error ? { error } : {})}
            />
          );
        })}
      </div>
    </section>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
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
  required = true,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "date" | "email" | "text" | "time";
  inputMode?: "numeric";
  autoComplete?: string;
  required?: boolean;
  error?: string;
}) {
  const errorId = `${id}-error`;
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
        autoComplete={autoComplete}
        aria-required={required || undefined}
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
  request: ChangeRequest;
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
        <SummaryRow
          label="Cobertura"
          value={
            request.coverage === "complete"
              ? "Completa — toda la guardia"
              : "Parcial — franja horaria"
          }
        />
        <SummaryRow
          label="Solicita"
          value={`${request.requesterName} · Móvil ${request.requesterMobile}`}
        />
        <SummaryRow label="Correo de confirmación" value={request.requesterEmail} />
        <SummaryRow label="Fecha de guardia" value={request.guardDate} />
        <SummaryRow
          label="Cambia con"
          value={`${request.counterpartName} · Móvil ${request.counterpartMobile}`}
        />
        <SummaryRow label="Fecha de devolución" value={request.returnDate} />
        {request.coverage === "partial" && (
          <SummaryRow
            label="Horario parcial"
            value={`${request.partialStart} a ${request.partialEnd}`}
          />
        )}
        {request.note.trim() && <SummaryRow label="Aclaración" value={request.note} />}
      </dl>
      <div className="mt-5 rounded-xl border border-warning/35 bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
        Al confirmar, la solicitud queda marcada como recibida y pendiente de aprobación.
      </div>
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
    <main className="min-h-screen px-4 pb-28 pt-12 sm:pt-20">
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
          Cambio de guardia registrado
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          La solicitud fue recibida y queda pendiente de aprobación. Te recomendamos conservar los
          datos del acuerdo hasta su confirmación.
        </p>
        <div className="mt-6 rounded-xl border border-warning/35 bg-warning-soft px-4 py-3 text-sm font-bold text-warning-foreground">
          Estado: pendiente de aprobación
        </div>
        {emailNotSent && (
          <p className="mt-3 rounded-xl border border-warning/35 bg-warning-soft px-4 py-3 text-left text-sm text-warning-foreground">
            La solicitud se guardó, pero no se pudo enviar la copia por correo. Conservá los datos
            del acuerdo.
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
