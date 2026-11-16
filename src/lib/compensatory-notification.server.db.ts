import { and, asc, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getDatabase } from "../db/index.server";
import { accountAccess, accountRoleGrant, compensatoryDecisionNotification, compensatoryDecisionNotificationAttempt, user } from "../db/schema";
import { createCompensatoryNotificationService, notificationDatabaseTimestampDecoder, type CompensatoryNotification, type CompensatoryNotificationStore, type CompensatoryNotificationTransaction, type NotificationAttempt } from "./compensatory-notification.server";
import { sendResolutionEmail } from "./compensatory-resend.server";

// Neon exposes this raw clock expression as an ISO string unless a driver decoder is attached.
export const compensatoryDatabaseClock = sql<Date>`clock_timestamp()`
  .mapWith(notificationDatabaseTimestampDecoder);

const store: CompensatoryNotificationStore = {
  async transaction(work) {
    return getDatabase().transaction(async (db) => {
      const tx: CompensatoryNotificationTransaction = {
        async findActor(id) {
          const rows = await db.select({ isActive: accountAccess.isActive, role: accountRoleGrant.role, name: user.name })
            .from(accountAccess).innerJoin(user, eq(user.id, accountAccess.userId))
            .leftJoin(accountRoleGrant, eq(accountRoleGrant.userId, accountAccess.userId)).where(eq(accountAccess.userId, id));
          return rows.length ? { isActive: rows[0]!.isActive, isAdmin: rows.some((row) => row.role === "admin"), name: rows[0]!.name } : null;
        },
        async listNotifications(requestId) {
          return await db.select().from(compensatoryDecisionNotification)
            .where(eq(compensatoryDecisionNotification.requestId, requestId))
            .orderBy(asc(compensatoryDecisionNotification.createdAt), asc(compensatoryDecisionNotification.id)) as CompensatoryNotification[];
        },
        async lockNotification(id) {
          const rows = await db.select().from(compensatoryDecisionNotification)
            .where(eq(compensatoryDecisionNotification.id, id)).for("update").limit(1);
          return (rows[0] as CompensatoryNotification | undefined) ?? null;
        },
        async lockOperation(actorId, operationId) {
          await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`compensatory-notification:${actorId}:${operationId}`}, 0))`);
        },
        async findOperation(actorId, operationId) {
          const rows = await db.select({ payloadHash: compensatoryDecisionNotificationAttempt.payloadHash, status: compensatoryDecisionNotificationAttempt.status })
            .from(compensatoryDecisionNotificationAttempt)
            .where(and(eq(compensatoryDecisionNotificationAttempt.actorUserId, actorId), eq(compensatoryDecisionNotificationAttempt.clientOperationId, operationId))).limit(1);
          return rows[0] ?? null;
        },
        async updateNotification(id, changes) {
          await db.update(compensatoryDecisionNotification).set(changes).where(eq(compensatoryDecisionNotification.id, id));
        },
        async insertAttempt(attempt: NotificationAttempt) {
          await db.insert(compensatoryDecisionNotificationAttempt).values(attempt);
        },
        async updateAttempt(actorId, operationId, changes) {
          await db.update(compensatoryDecisionNotificationAttempt).set(changes)
            .where(and(eq(compensatoryDecisionNotificationAttempt.actorUserId, actorId), eq(compensatoryDecisionNotificationAttempt.clientOperationId, operationId)));
        },
        async markStaleSending(notificationId, uncertainAt) {
          await db.update(compensatoryDecisionNotificationAttempt).set({ status: "uncertain", completedAt: uncertainAt })
            .where(and(eq(compensatoryDecisionNotificationAttempt.notificationId, notificationId), eq(compensatoryDecisionNotificationAttempt.status, "sending")));
        },
        async databaseNow() {
          const rows = await db.select({ now: compensatoryDatabaseClock }).from(user).limit(1);
          if (!rows.length) throw new Error("No hay una cuenta disponible para leer el reloj de base de datos.");
          return rows[0]!.now;
        },
      };
      return work(tx);
    });
  },
};

export const compensatoryNotification = createCompensatoryNotificationService(store);
export function dispatchConfiguration() {
  const apiKey = process.env["EMAIL_API_KEY"]?.trim();
  const from = process.env["EMAIL_FROM"]?.trim();
  return apiKey && from ? { apiKey, from } : null;
}
export const sendReviewedCompensatoryEmail = (input: Omit<Parameters<typeof sendResolutionEmail>[0], "fetcher">) =>
  sendResolutionEmail({ ...input, fetcher: fetch });
