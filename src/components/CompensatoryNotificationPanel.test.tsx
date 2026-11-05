import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  CompensatoryNotificationPanel,
  createNotificationSendAttempt,
  freezeNotificationSendAttempt,
  notificationOutcomeMayBeUncertain,
  notificationStatusPresentation,
  NotificationRow,
  type CompensatoryNotificationApi,
  type DecisionNotification,
} from "./CompensatoryNotificationPanel";

const notification: DecisionNotification = {
  id: "notification-private-id",
  recipientKind: "requester",
  recipient: "ana@example.org",
  status: "pending_review",
  subject: "Resolución de solicitud",
  text: "Tu solicitud fue aprobada.\n\nFundamento: Se verificó el saldo.",
  decisionVersion: 2,
};

function apiStub(): CompensatoryNotificationApi {
  return {
    listCompensatoryNotifications: vi.fn().mockResolvedValue([notification]),
    reviewAndSendCompensatoryNotification: vi.fn().mockResolvedValue({ status: "accepted" }),
  };
}

describe("CompensatoryNotificationPanel", () => {
  it("does not load or send mail during server rendering", () => {
    const api = apiStub();
    const html = renderToStaticMarkup(
      <CompensatoryNotificationPanel requestId="request-1" api={api} />,
    );

    expect(html).toContain("Cargando correos pendientes");
    expect(api.listCompensatoryNotifications).not.toHaveBeenCalled();
    expect(api.reviewAndSendCompensatoryNotification).not.toHaveBeenCalled();
    expect(html).not.toContain("notification-private-id");
  });

  it("freezes the reviewed recipient and idempotency key for the explicit send", () => {
    const attempt = createNotificationSendAttempt({
      notificationId: notification.id,
      recipient: " ana@example.org ",
      clientOperationId: "operation-1",
    });

    expect(attempt).toEqual({
      data: {
        notificationId: notification.id,
        recipient: "ana@example.org",
        confirmed: true,
        clientOperationId: "operation-1",
      },
    });
  });

  it("reuses the exact frozen payload and key after an uncertain result", () => {
    const first = freezeNotificationSendAttempt(null, {
      notificationId: notification.id,
      recipient: "ana@example.org",
      clientOperationId: "operation-uncertain",
    });
    const retried = freezeNotificationSendAttempt(first, {
      notificationId: notification.id,
      recipient: "new-address@example.org",
      clientOperationId: "operation-must-not-be-used",
    });

    expect(retried).toBe(first);
    expect(retried.data.recipient).toBe("ana@example.org");
    expect(retried.data.clientOperationId).toBe("operation-uncertain");
  });

  it("keeps uncertain and in-progress outcomes on the same attempt", () => {
    expect(notificationOutcomeMayBeUncertain("uncertain")).toBe(true);
    expect(notificationOutcomeMayBeUncertain("sending")).toBe(true);
    expect(notificationOutcomeMayBeUncertain("accepted")).toBe(false);
    expect(notificationOutcomeMayBeUncertain("failed")).toBe(false);
  });

  it.each([
    ["pending_review", "Correo pendiente de revisión", true, false],
    ["pending_recipient", "Correo pendiente: falta destinatario", true, false],
    ["pending_configuration", "Envío pendiente por configuración", true, false],
    ["failed", "Envío fallido; requiere revisión antes de intentar de nuevo", true, false],
    ["sending", "Envío en curso; no iniciar otro envío", false, true],
    ["uncertain", "Resultado incierto; no iniciar otro envío automáticamente", false, true],
    ["accepted", "Proveedor aceptó el correo; recepción no confirmada", false, false],
    ["delivered", "Proveedor informó entrega; agente no confirmó recepción", false, false],
  ] as const)(
    "shows a truthful, safe action for status %s",
    (status, label, canReview, canQuery) => {
      expect(notificationStatusPresentation(status)).toEqual({ label, canReview, canQuery });
    },
  );

  it.each([
    ["accepted", "Proveedor aceptó el correo; recepción no confirmada"],
    ["sending", "Envío en curso; no iniciar otro envío"],
    ["uncertain", "Resultado incierto; no iniciar otro envío automáticamente"],
  ] as const)("does not offer a new send for loaded %s notifications", (status, label) => {
    const html = renderToStaticMarkup(
      <NotificationRow notification={{ ...notification, status }} api={apiStub()} />,
    );

    expect(html).toContain(label);
    expect(html).not.toContain("Revisar correo");
    expect(html).not.toContain("Confirmar y enviar correo");
    expect(html).not.toContain("Consultar estado");
  });

  it("keeps the review action for a pending notification", () => {
    const html = renderToStaticMarkup(
      <NotificationRow notification={notification} api={apiStub()} />,
    );

    expect(html).toContain("Correo pendiente de revisión");
    expect(html).toContain("Revisar correo");
  });
  it("presents the unaddressed administrative notice as an optional copy", () => {
    const api = apiStub();
    const html = renderToStaticMarkup(
      <NotificationRow notification={{ ...notification, recipientKind: "admin", recipient: null, status: "pending_recipient" }} api={api} />,
    );
    expect(html).toContain("Enviar una copia");
    expect(html).toContain("Opcional");
    expect(html).not.toContain("Administración");
    expect(html).not.toContain("falta destinatario");
    expect(html).not.toContain("Falta revisar el destinatario");
    expect(api.reviewAndSendCompensatoryNotification).not.toHaveBeenCalled();
  });
  it("does not offer another copy after provider acceptance", () => {
    const html = renderToStaticMarkup(
      <NotificationRow notification={{ ...notification, recipientKind: "admin", status: "accepted" }} api={apiStub()} />,
    );
    expect(html).toContain("Proveedor aceptó");
    expect(html).not.toContain(">Enviar una copia</button>");
  });
});
