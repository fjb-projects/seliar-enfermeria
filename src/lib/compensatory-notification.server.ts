import { createHash, randomUUID } from "node:crypto";
import type { ResolutionEmailOutcome } from "./compensatory-resend.server";

export type CompensatoryNotificationStatus = "pending_review" | "pending_recipient" | "pending_configuration" | "sending" | "uncertain" | "failed" | "accepted" | "delivered";
export type CompensatoryNotification = {
  id: string; requestId: string; decisionVersion: number; decision: "approved" | "rejected";
  recipientKind: "requester" | "admin"; recipient: string | null; status: CompensatoryNotificationStatus;
  reason: string; subject: string; text: string; createdAt: Date; reviewedByUserId: string | null;
  reviewedAt: Date | null; idempotencyKey: string | null; providerId: string | null; lastAttemptAt: Date | null;
};
export type CompensatoryNotificationActor = { isActive: boolean; isAdmin: boolean; name: string };
export type NotificationAttempt = {
  id: string; notificationId: string; actorUserId: string; clientOperationId: string;
  payloadHash: string; recipient: string; status: CompensatoryNotificationStatus;
  requestedAt: Date; completedAt: Date | null; providerId: string | null;
};
export interface CompensatoryNotificationTransaction {
  findActor(id: string): Promise<CompensatoryNotificationActor | null>;
  listNotifications(requestId: string): Promise<CompensatoryNotification[]>;
  lockNotification(id: string): Promise<CompensatoryNotification | null>;
  lockOperation(actorId: string, operationId: string): Promise<void>;
  findOperation(actorId: string, operationId: string): Promise<{ payloadHash: string; status: string } | null>;
  updateNotification(id: string, changes: Partial<CompensatoryNotification>): Promise<void>;
  insertAttempt(attempt: NotificationAttempt): Promise<void>;
  updateAttempt(actorId: string, operationId: string, changes: Partial<NotificationAttempt>): Promise<void>;
  markStaleSending(notificationId: string, uncertainAt: Date): Promise<void>;
  databaseNow(): Promise<Date>;
}
export interface CompensatoryNotificationStore {
  transaction<T>(work: (tx: CompensatoryNotificationTransaction) => Promise<T>): Promise<T>;
}
export type DispatchConfiguration = { apiKey: string; from: string };
export type NotificationSender = (input: {
  apiKey: string; from: string; to: string; content: { subject: string; text: string }; idempotencyKey: string;
}) => Promise<ResolutionEmailOutcome>;
export const notificationDatabaseTimestampDecoder = {
  mapFromDriverValue(value: Date | string): Date {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error("La base devolvió una fecha de envío no válida.");
    return date;
  },
};
const emailPattern = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const uncertainWindowMs = 24 * 60 * 60 * 1000;
function validRecipient(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 320 || /[\r\n]/.test(value) || !emailPattern.test(normalized))
    throw new Error("El correo revisado no es válido.");
  return normalized;
}
function hashPayload(input: { notificationId: string; recipient: string; subject: string; text: string; decisionVersion: number }) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
function requireAdmin(actor: CompensatoryNotificationActor | null): asserts actor is CompensatoryNotificationActor {
  if (!actor?.isActive || !actor.isAdmin) throw new Error("Se requiere administración vigente.");
}

export function createCompensatoryNotificationService(store: CompensatoryNotificationStore, newId = randomUUID) {
  return {
    async listCompensatoryNotifications(actorId: string, requestId: string) {
      return store.transaction(async (tx) => {
        requireAdmin(await tx.findActor(actorId));
        return (await tx.listNotifications(requestId)).map(({ id, recipientKind, recipient, status, subject, text, decisionVersion }) =>
          ({ id, recipientKind, recipient, status, subject, text, decisionVersion }));
      });
    },
    async reviewAndSendCompensatoryNotification(actorId: string, input: {
      notificationId: string; recipient: string; confirmed: boolean; clientOperationId: string;
    }, options: { send: NotificationSender; configuration: DispatchConfiguration | null }) {
      if (input.confirmed !== true) throw new Error("Se requiere confirmar la revisión del destinatario.");
      if (!input.clientOperationId || input.clientOperationId.length > 100) throw new Error("La clave de operación no es válida.");
      const recipient = validRecipient(input.recipient);
      const idempotencyKey = `compensatory-${input.notificationId}-${input.clientOperationId}`.slice(0, 256);
      const reservation = await store.transaction(async (tx) => {
        requireAdmin(await tx.findActor(actorId));
        await tx.lockOperation(actorId, input.clientOperationId);
        const notification = await tx.lockNotification(input.notificationId);
        if (!notification) throw new Error("No se encontró la notificación.");
        const payloadHash = hashPayload({
          notificationId: input.notificationId, recipient,
          subject: notification.subject, text: notification.text,
          decisionVersion: notification.decisionVersion,
        });
        const prior = await tx.findOperation(actorId, input.clientOperationId);
        if (prior) {
          if (prior.payloadHash !== payloadHash) throw new Error("La clave de operación ya fue usada con otros datos.");
          return { kind: "prior" as const, status: prior.status };
        }
        const now = await tx.databaseNow();
        if (notification.status === "sending") {
          if (notification.lastAttemptAt && now.getTime() - notification.lastAttemptAt.getTime() >= uncertainWindowMs) {
            await tx.updateNotification(notification.id, { status: "uncertain" });
            await tx.markStaleSending(notification.id, now);
            return { kind: "pending" as const, status: "uncertain" };
          }
          throw new Error("Ya hay un intento de envío en curso.");
        }
        if (!["pending_review", "pending_recipient", "pending_configuration", "failed"].includes(notification.status))
          throw new Error("Esta notificación ya tiene un envío aceptado o incierto y no se reenviará automáticamente.");
        const nextStatus = options.configuration ? "sending" : "pending_configuration";
        const attempt: NotificationAttempt = {
          id: newId(), notificationId: notification.id, actorUserId: actorId,
          clientOperationId: input.clientOperationId, payloadHash, recipient, status: nextStatus,
          requestedAt: now, completedAt: options.configuration ? null : now, providerId: null,
        };
        await tx.updateNotification(notification.id, {
          recipient, status: nextStatus, reviewedByUserId: actorId, reviewedAt: now,
          idempotencyKey, lastAttemptAt: now,
        });
        await tx.insertAttempt(attempt);
        return options.configuration
          ? { kind: "send" as const, notification, recipient, idempotencyKey }
          : { kind: "pending" as const, status: nextStatus };
      });
      if (reservation.kind === "prior") return { status: reservation.status };
      if (reservation.kind === "pending") return { status: reservation.status };

      let outcome: ResolutionEmailOutcome;
      try {
        outcome = await options.send({
          apiKey: options.configuration!.apiKey, from: options.configuration!.from,
          to: reservation.recipient,
          content: { subject: reservation.notification.subject, text: reservation.notification.text },
          idempotencyKey: reservation.idempotencyKey,
        });
      } catch {
        outcome = { kind: "uncertain", reason: "network_error" };
      }
      const status: CompensatoryNotificationStatus = outcome.kind === "accepted" ? "accepted"
        : outcome.kind === "uncertain" ? "uncertain" : "failed";
      await store.transaction(async (tx) => {
        requireAdmin(await tx.findActor(actorId));
        await tx.updateNotification(input.notificationId, {
          status, providerId: outcome.kind === "accepted" ? outcome.providerId : null,
        });
        await tx.updateAttempt(actorId, input.clientOperationId, {
          status, completedAt: await tx.databaseNow(), providerId: outcome.kind === "accepted" ? outcome.providerId : null,
        });
      });
      return { status };
    },
  };
}
