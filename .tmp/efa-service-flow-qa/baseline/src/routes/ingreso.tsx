import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Mail,
  MapPin,
  Navigation,
  Send,
  UserRound,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { WorkflowHeader } from "@/components/WorkflowHeader";
import { WorkflowIntro } from "@/components/WorkflowIntro";
import { WorkflowShell } from "@/components/WorkflowShell";
import { enviarRegistroIngreso } from "@/lib/ingreso.functions";

export const Route = createFileRoute("/ingreso")({
  head: () => ({
    meta: [
      { title: "Registro de ingreso | SeLIAR" },
      {
        name: "description",
        content: "Registrá tu ingreso con la ubicación actual del dispositivo.",
      },
    ],
  }),
  component: Ingreso,
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

type MobileChoice = (typeof MOBILE_CHOICES)[number];
type Stage = "details" | "review" | "confirmed";
type LocationStatus = "idle" | "loading" | "captured" | "denied" | "unavailable" | "insecure";

type LocationCapture = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
};

type CheckInDraft = {
  emailRequested: boolean;
  fullName: string;
  email: string;
  mobile: MobileChoice | "";
  location: LocationCapture | null;
};

const initialCheckIn: CheckInDraft = {
  emailRequested: false,
  fullName: "",
  email: "",
  mobile: "",
  location: null,
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidDraft(draft: CheckInDraft): boolean {
  return Boolean(
    draft.fullName.trim() && isValidEmail(draft.email) && draft.mobile && draft.location,
  );
}

function Ingreso() {
  const [draft, setDraft] = useState<CheckInDraft>(initialCheckIn);
  const [stage, setStage] = useState<Stage>("details");
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [attemptedReview, setAttemptedReview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [emailNotSent, setEmailNotSent] = useState(false);
  const submitCheckIn = useServerFn(enviarRegistroIngreso);

  const updateDraft = <Key extends keyof CheckInDraft>(key: Key, value: CheckInDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const requestLocation = () => {
    setLocationMessage(null);
    if (!window.isSecureContext) {
      setLocationStatus("insecure");
      setLocationMessage(
        "La ubicación requiere una conexión segura HTTPS. Abrí esta página desde su dirección segura e intentá nuevamente.",
      );
      return;
    }
    if (!navigator.geolocation) {
      setLocationStatus("unavailable");
      setLocationMessage(
        "Este navegador no permite obtener la ubicación. Probá con otro navegador o dispositivo.",
      );
      return;
    }

    setDraft((current) => ({ ...current, location: null }));
    setLocationStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location: LocationCapture = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          capturedAt: new Date(position.timestamp).toISOString(),
        };
        setDraft((current) => ({ ...current, location }));
        setLocationStatus("captured");
        setLocationMessage(null);
      },
      (error) => {
        setDraft((current) => ({ ...current, location: null }));
        if (error.code === error.PERMISSION_DENIED) {
          setLocationStatus("denied");
          setLocationMessage(
            "No se autorizó la ubicación. Habilitala para este sitio en los ajustes del navegador y volvé a intentarlo.",
          );
        } else if (error.code === error.TIMEOUT) {
          setLocationStatus("unavailable");
          setLocationMessage(
            "No se obtuvo la ubicación a tiempo. Revisá la señal y volvé a intentarlo.",
          );
        } else {
          setLocationStatus("unavailable");
          setLocationMessage(
            "La ubicación no está disponible en este momento. Revisá los ajustes de ubicación del dispositivo e intentá nuevamente.",
          );
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  };

  const continueToReview = () => {
    setAttemptedReview(true);
    if (isValidDraft(draft)) {
      setSubmissionError(null);
      setStage("review");
    }
  };

  const confirmSubmission = async () => {
    if (!isValidDraft(draft) || !draft.location) {
      setAttemptedReview(true);
      setSubmissionError(
        "Completá tus datos y obtené la ubicación actual antes de confirmar el ingreso.",
      );
      return;
    }

    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      const result = await submitCheckIn({
        data: {
          emailRequested: draft.emailRequested,
          fullName: draft.fullName.trim(),
          email: draft.email.trim(),
          mobile: draft.mobile as MobileChoice,
          ...draft.location,
        },
      });
      if (result.state === "submitted") {
        setEmailNotSent(result.emailRequested && !result.emailSent);
        setStage("confirmed");
      } else if (result.state === "not_configured") {
        setSubmissionError(
          "El envío de Ingreso todavía no está configurado. No se registró el marcaje; intentá nuevamente más adelante.",
        );
      } else {
        setSubmissionError(
          result.message || "No se pudo registrar el ingreso. Intentá nuevamente.",
        );
      }
    } catch {
      setSubmissionError(
        "No se pudo registrar el ingreso. Revisá tu conexión e intentá nuevamente.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (stage === "confirmed") {
    return (
      <WorkflowShell
        contentWidth="narrow"
        header={
          <WorkflowHeader
            eyebrow="Registro de ingreso"
            title="Ingreso registrado"
            description="El marcaje quedó guardado correctamente."
            contentWidth="narrow"
          />
        }
      >
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <h2 className="font-display text-xl font-bold">Listo, registramos tu ingreso</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                La fecha y hora del registro quedan asociadas al envío. La ubicación es una captura
                puntual y no verifica tu identidad.
              </p>
            </div>
          </div>
          {emailNotSent && (
            <p className="mt-4 rounded-xl border border-border bg-muted px-4 py-3 text-sm">
              El ingreso se guardó, pero no pudimos enviar la copia por correo.
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setDraft(initialCheckIn);
                setLocationStatus("idle");
                setLocationMessage(null);
                setAttemptedReview(false);
                setSubmissionError(null);
                setEmailNotSent(false);
                setStage("details");
              }}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Registrar otro ingreso
            </button>
            <Link
              to="/"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-input bg-background px-4 text-sm font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Volver al inicio
            </Link>
          </div>
        </section>
      </WorkflowShell>
    );
  }

  return (
    <WorkflowShell
      contentWidth="narrow"
      header={
        <WorkflowHeader
          eyebrow="Registro de ingreso"
          title="Marcá tu ingreso"
          description="Completá tus datos y compartí tu ubicación actual para registrar el ingreso."
          contentWidth="narrow"
        />
      }
    >
      <WorkflowIntro
        eyebrow="Ubicación puntual"
        description="La ubicación se solicita una sola vez cuando la pedís. Se necesita para registrar el ingreso y no se usa para seguimiento continuo ni para verificar tu identidad."
      />
      {stage === "details" ? (
        <form
          className="mt-5 space-y-5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            continueToReview();
          }}
        >
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
            <SectionHeading
              icon={<UserRound className="size-5" aria-hidden="true" />}
              title="Tus datos"
              description="El correo es obligatorio; la copia del marcaje es opcional."
            />
            <div className="mt-5 space-y-4">
              <label className="block space-y-1.5" htmlFor="checkin-full-name">
                <span className="block text-xs font-bold uppercase tracking-[0.06em] text-foreground">
                  Nombre y apellido <span aria-hidden="true">*</span>
                </span>
                <input
                  id="checkin-full-name"
                  autoComplete="name"
                  maxLength={120}
                  value={draft.fullName}
                  onChange={(event) => updateDraft("fullName", event.target.value)}
                  aria-invalid={attemptedReview && !draft.fullName.trim()}
                  className={fieldClassName}
                />
                {attemptedReview && !draft.fullName.trim() && (
                  <FieldError>Ingresá tu nombre y apellido.</FieldError>
                )}
              </label>
              <label className="block space-y-1.5" htmlFor="checkin-email">
                <span className="block text-xs font-bold uppercase tracking-[0.06em] text-foreground">
                  Correo electrónico <span aria-hidden="true">*</span>
                </span>
                <input
                  id="checkin-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  maxLength={255}
                  value={draft.email}
                  onChange={(event) => updateDraft("email", event.target.value)}
                  aria-invalid={attemptedReview && !isValidEmail(draft.email)}
                  className={fieldClassName}
                />
                {attemptedReview && !isValidEmail(draft.email) && (
                  <FieldError>Ingresá un correo electrónico válido.</FieldError>
                )}
              </label>
              <label className="block space-y-1.5" htmlFor="checkin-mobile">
                <span className="block text-xs font-bold uppercase tracking-[0.06em] text-foreground">
                  Móvil <span aria-hidden="true">*</span>
                </span>
                <select
                  id="checkin-mobile"
                  value={draft.mobile}
                  onChange={(event) =>
                    updateDraft("mobile", event.target.value as MobileChoice | "")
                  }
                  aria-required="true"
                  aria-invalid={attemptedReview && !draft.mobile}
                  className={fieldClassName}
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
                {attemptedReview && !draft.mobile && <FieldError>Seleccioná un móvil.</FieldError>}
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
            <SectionHeading
              icon={<MapPin className="size-5" aria-hidden="true" />}
              title="Ubicación actual"
              description="Tu navegador va a pedir permiso cuando toques el botón. Se requiere una ubicación válida para continuar."
            />
            <button
              type="button"
              onClick={requestLocation}
              disabled={locationStatus === "loading"}
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary bg-background px-4 text-sm font-bold text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
            >
              <Navigation className="size-4" aria-hidden="true" />
              {locationStatus === "loading"
                ? "Obteniendo ubicación…"
                : draft.location
                  ? "Actualizar ubicación"
                  : "Compartir ubicación actual"}
            </button>
            {draft.location && locationStatus === "captured" && (
              <div
                className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm"
                role="status"
              >
                <p className="font-bold text-foreground">Ubicación capturada</p>
                <p className="mt-1 text-muted-foreground">
                  Precisión estimada: ±{Math.round(draft.location.accuracyMeters)} m
                </p>
                <p className="mt-1 text-muted-foreground">
                  Capturada: {formatDateTime(draft.location.capturedAt)}
                </p>
              </div>
            )}
            {locationMessage && (
              <div
                className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/35 bg-destructive/5 p-4 text-sm"
                role="alert"
              >
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0 text-destructive"
                  aria-hidden="true"
                />
                <p>{locationMessage}</p>
              </div>
            )}
            {attemptedReview && !draft.location && !locationMessage && (
              <FieldError>Obtené la ubicación actual para continuar.</FieldError>
            )}
          </section>

          <button
            type="submit"
            disabled={!isValidDraft(draft)}
            className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-[0_4px_0_oklch(0.23_0.04_202)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none motion-reduce:transition-none"
          >
            Revisar ingreso <ChevronLeft className="size-5 rotate-180" aria-hidden="true" />
          </button>
        </form>
      ) : (
        <Review
          draft={draft}
          isSubmitting={isSubmitting}
          submissionError={submissionError}
          onBack={() => setStage("details")}
          onEmailRequestedChange={(value) => updateDraft("emailRequested", value)}
          onConfirm={() => void confirmSubmission()}
        />
      )}
    </WorkflowShell>
  );
}

const fieldClassName =
  "min-h-12 w-full border border-input bg-background px-3 py-2.5 text-sm text-foreground shadow-inner outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/35 aria-invalid:border-destructive motion-reduce:transition-none";

function SectionHeading({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
        {icon}
      </span>
      <div>
        <h2 className="font-display text-lg font-bold">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold text-destructive" role="alert">
      {children}
    </p>
  );
}

function Review({
  draft,
  isSubmitting,
  submissionError,
  onBack,
  onEmailRequestedChange,
  onConfirm,
}: {
  draft: CheckInDraft;
  isSubmitting: boolean;
  submissionError: string | null;
  onBack: () => void;
  onEmailRequestedChange: (value: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <h2 className="font-display text-xl font-bold">Revisá el ingreso</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirmá los datos antes de registrar el marcaje.
          </p>
        </div>
      </div>
      <dl className="mt-5 divide-y divide-border rounded-xl border border-border bg-muted/35 px-4">
        <SummaryRow label="Nombre y apellido" value={draft.fullName.trim()} />
        <SummaryRow label="Correo electrónico" value={draft.email.trim()} />
        <SummaryRow label="Móvil" value={draft.mobile} />
        <SummaryRow
          label="Captura de ubicación"
          value={
            draft.location
              ? `${formatDateTime(draft.location.capturedAt)} · precisión ±${Math.round(draft.location.accuracyMeters)} m`
              : "No disponible"
          }
        />
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        El sistema de registro asignará la fecha y hora al guardar. La ubicación es una captura
        puntual y no acredita identidad.
      </p>
      {submissionError && (
        <div
          className="mt-4 rounded-xl border border-destructive/45 bg-destructive/10 px-4 py-3 text-sm"
          role="alert"
        >
          {submissionError}
        </div>
      )}
      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground focus-within:ring-2 focus-within:ring-ring">
        <input
          type="checkbox"
          checked={draft.emailRequested}
          onChange={(event) => onEmailRequestedChange(event.target.checked)}
          disabled={isSubmitting}
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
        <Mail className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>Quiero recibir una copia del marcaje por correo electrónico</span>
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl border border-input bg-background px-4 text-sm font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-70 motion-reduce:transition-none"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
          Editar datos
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isSubmitting || !draft.location}
          className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-[0_4px_0_oklch(0.23_0.04_202)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 motion-reduce:transform-none motion-reduce:transition-none"
        >
          {isSubmitting ? "Registrando ingreso…" : "Confirmar ingreso"}
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

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(value));
}
