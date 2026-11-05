import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type DecisionNotification = {
  id: string;
  recipientKind: "requester" | "admin";
  recipient: string | null;
  status: string;
  subject: string;
  text: string;
  decisionVersion: number;
};

export type NotificationSendAttempt = {
  data: {
    notificationId: string;
    recipient: string;
    confirmed: true;
    clientOperationId: string;
  };
};

export type CompensatoryNotificationApi = {
  /** Inject authenticated server-function bindings from the coordination workspace. */
  listCompensatoryNotifications: (input: {
    data: { requestId: string };
  }) => Promise<DecisionNotification[]>;
  reviewAndSendCompensatoryNotification: (
    input: NotificationSendAttempt,
  ) => Promise<{ status: string }>;
};

type FrozenAttempt = NotificationSendAttempt;

// eslint-disable-next-line react-refresh/only-export-components -- exported for deterministic UI contract tests.
export function createNotificationSendAttempt(input: {
  notificationId: string;
  recipient: string;
  clientOperationId: string;
}): NotificationSendAttempt {
  return {
    data: {
      notificationId: input.notificationId,
      recipient: input.recipient.trim(),
      confirmed: true,
      clientOperationId: input.clientOperationId,
    },
  };
}

// eslint-disable-next-line react-refresh/only-export-components -- exported for deterministic UI contract tests.
export function freezeNotificationSendAttempt(
  current: NotificationSendAttempt | null,
  input: { notificationId: string; recipient: string; clientOperationId: string },
) {
  return current ?? createNotificationSendAttempt(input);
}

// eslint-disable-next-line react-refresh/only-export-components -- exported for deterministic UI contract tests.
export function notificationOutcomeMayBeUncertain(status: string) {
  return status === "uncertain" || status === "sending";
}

// eslint-disable-next-line react-refresh/only-export-components -- exported for deterministic UI contract tests.
export function notificationStatusPresentation(status: string) {
  switch (status) {
    case "pending_recipient":
      return { label: "Correo pendiente: falta destinatario", canReview: true, canQuery: false };
    case "pending_review":
      return { label: "Correo pendiente de revisión", canReview: true, canQuery: false };
    case "pending_configuration":
      return { label: "Envío pendiente por configuración", canReview: true, canQuery: false };
    case "failed":
      return {
        label: "Envío fallido; requiere revisión antes de intentar de nuevo",
        canReview: true,
        canQuery: false,
      };
    case "sending":
      return { label: "Envío en curso; no iniciar otro envío", canReview: false, canQuery: true };
    case "uncertain":
      return {
        label: "Resultado incierto; no iniciar otro envío automáticamente",
        canReview: false,
        canQuery: true,
      };
    case "accepted":
      return {
        label: "Proveedor aceptó el correo; recepción no confirmada",
        canReview: false,
        canQuery: false,
      };
    case "delivered":
      return {
        label: "Proveedor informó entrega; agente no confirmó recepción",
        canReview: false,
        canQuery: false,
      };
    default:
      return {
        label: `Estado: ${status}. No se inicia otro envío automáticamente`,
        canReview: false,
        canQuery: false,
      };
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "No se pudo completar la solicitud.";
}

function recipientLabel(kind: DecisionNotification["recipientKind"]) {
  return kind === "requester" ? "Agente solicitante" : "Copia de la resolución";
}

export function NotificationRow({
  notification,
  api,
}: {
  notification: DecisionNotification;
  api: CompensatoryNotificationApi;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState(notification.recipient === null);
  const [recipient, setRecipient] = useState(notification.recipient ?? "");
  const [confirmedReview, setConfirmedReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [status, setStatus] = useState(notification.status);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const frozen = useRef<FrozenAttempt | null>(null);
  const recipientInputId = `notification-recipient-${useId().replaceAll(":", "")}`;

  function beginReview() {
    setReviewing(true);
    setEditingRecipient(recipient.trim().length === 0 && notification.recipient === null);
    setRecipient((current) => current || notification.recipient || "");
    setConfirmedReview(false);
    setError("");
  }

  async function send(attempt: FrozenAttempt | null = frozen.current) {
    if (!attempt || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await api.reviewAndSendCompensatoryNotification(attempt);
      setStatus(response.status);
      if (notificationOutcomeMayBeUncertain(response.status)) {
        frozen.current = attempt;
        setUncertain(true);
        setError(
          `El estado sigue siendo ${response.status}. No se confirma la recepción. Consultá el mismo intento; esta consulta no crea un reenvío nuevo.`,
        );
      } else {
        frozen.current = null;
        setUncertain(false);
        setReviewing(false);
        setConfirmedReview(false);
        setResult(
          `Estado registrado: ${response.status}. Esto no confirma que el destinatario haya recibido el correo.`,
        );
      }
    } catch (cause) {
      // The provider may have accepted the message before the connection failed.
      // Keep this exact payload and operation key; retries must never create a new one.
      frozen.current = attempt;
      setUncertain(true);
      setStatus("uncertain");
      setError(
        `No se pudo confirmar el resultado. El correo puede haberse enviado. Consultá el estado de la misma operación; esta consulta no crea un reenvío. ${errorMessage(cause)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  function confirmAndSend() {
    if (!confirmedReview || busy) return;
    frozen.current = freezeNotificationSendAttempt(frozen.current, {
      notificationId: notification.id,
      recipient: recipient.trim(),
      clientOperationId: globalThis.crypto.randomUUID(),
    });
    void send(frozen.current);
  }

  const presentation = notificationStatusPresentation(status);
  const optionalCopy = notification.recipientKind === "admin" && status === "pending_recipient" && !notification.recipient;

  return (
    <li className="space-y-3 border-b py-4 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{recipientLabel(notification.recipientKind)}</p>
          <p className="text-sm text-muted-foreground">
            {optionalCopy
              ? "Opcional. Podés enviar un correo adicional a otra dirección."
              : `${notification.recipient ?? "Falta revisar el destinatario"} · decisión versión ${notification.decisionVersion}`}
          </p>
        </div>
        {!optionalCopy && <span className="max-w-full rounded-md bg-muted px-2 py-1 text-sm sm:max-w-[22rem]">
          {presentation.label}
        </span>}
      </div>

      {!reviewing && !uncertain && presentation.canReview && (
        <Button type="button" variant="outline" className="min-h-11" onClick={beginReview}>
          {status === "failed" || status === "pending_configuration"
            ? "Revisar correo e intentar de nuevo"
            : notification.recipientKind === "admin" ? "Enviar una copia" : "Revisar correo"}
        </Button>
      )}

      {reviewing && !uncertain && (
        <div className="space-y-3">
          {editingRecipient ? (
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                setEditingRecipient(false);
                setError("");
              }}
            >
              <label htmlFor={recipientInputId} className="font-medium">
                Revisar destinatario
              </label>
              <Input
                id={recipientInputId}
                type="email"
                autoComplete="email"
                className="min-h-11"
                maxLength={320}
                value={recipient}
                onChange={(event) => setRecipient(event.currentTarget.value)}
                required
              />
              <Button type="submit" variant="outline" className="min-h-11">
                Revisar destinatario y contenido
              </Button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="break-all">Destinatario a revisar: {recipient}</p>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => {
                  setEditingRecipient(true);
                  setConfirmedReview(false);
                }}
              >
                Cambiar destinatario
              </Button>
            </div>
          )}

          {!editingRecipient && (
            <div className="space-y-2 border-l-2 pl-3">
              <p className="font-medium">{notification.subject}</p>
              <p className="whitespace-pre-wrap break-words">{notification.text}</p>
              <p className="text-sm text-muted-foreground">
                Revisá el destinatario y el texto de la decisión antes de confirmar. No se envía al
                abrir esta revisión.
              </p>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={confirmedReview}
                  onChange={(event) => setConfirmedReview(event.currentTarget.checked)}
                />
                Revisé el destinatario y el contenido de la decisión.
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={!confirmedReview || busy}
                  onClick={confirmAndSend}
                >
                  {busy ? "Enviando…" : "Confirmar y enviar correo"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => setReviewing(false)}
                >
                  Cancelar revisión
                </Button>
              </div>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      )}

      {presentation.canQuery && uncertain && frozen.current && (
        <div className="space-y-2" role="alert">
          <p>{error}</p>
          <p>La consulta conserva la misma operación y no crea un reenvío nuevo.</p>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={busy}
            onClick={() => void send(frozen.current)}
          >
            {busy ? "Consultando…" : "Consultar estado"}
          </Button>
        </div>
      )}

      {result && (
        <p role="status" className="text-sm text-muted-foreground">
          {result}
        </p>
      )}
    </li>
  );
}

/**
 * Render only inside the authenticated coordination workspace and pass its bound API.
 * Loading this review surface reads queued messages only; sending requires two explicit review actions.
 */
export function CompensatoryNotificationPanel({
  requestId,
  api,
}: {
  requestId: string;
  api: CompensatoryNotificationApi;
}) {
  const [notifications, setNotifications] = useState<DecisionNotification[] | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setNotifications(null);
    setError("");
    void api
      .listCompensatoryNotifications({ data: { requestId } })
      .then((loaded) => {
        if (active) setNotifications(loaded);
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause));
      });
    return () => {
      active = false;
    };
  }, [api, requestId, revision]);

  return (
    <section aria-label="Correos de resolución" className="space-y-3">
      <h3 className="font-semibold">Correos de resolución</h3>
      {notifications === null && !error && <p role="status">Cargando correos pendientes…</p>}
      {error && (
        <div className="space-y-2">
          <p role="alert">No se pudieron cargar los correos: {error}</p>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setRevision((value) => value + 1)}
          >
            Reintentar carga
          </Button>
        </div>
      )}
      {notifications?.length === 0 && <p>No hay correos pendientes de revisión.</p>}
      {notifications && notifications.length > 0 && (
        <ul aria-label="Correos pendientes" className="divide-y">
          {notifications.map((notification) => (
            <NotificationRow key={notification.id} notification={notification} api={api} />
          ))}
        </ul>
      )}
    </section>
  );
}
