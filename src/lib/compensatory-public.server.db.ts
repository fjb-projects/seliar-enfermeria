import { and, asc, eq, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getDatabase } from "../db/index.server";
import { compensatoryRequest, compensatoryStaff, user } from "../db/schema";
import {
  createPublicCompensatoryService,
  type PublicCompensatoryRequest,
  type PublicCompensatoryStore,
  type PublicCompensatoryTransaction,
} from "./compensatory-public.server";

const store: PublicCompensatoryStore = {
  async transaction(work) {
    return getDatabase().transaction(async (db) => {
      const tx: PublicCompensatoryTransaction = {
        async listActiveStaff() {
          return db
            .select({ id: compensatoryStaff.id, name: compensatoryStaff.name, email: compensatoryStaff.email, isActive: compensatoryStaff.isActive })
            .from(compensatoryStaff)
            .where(eq(compensatoryStaff.isActive, true))
            .orderBy(asc(compensatoryStaff.name), asc(compensatoryStaff.id));
        },
        async lockStaff(staffId) {
          const rows = await db
            .select({ id: compensatoryStaff.id, name: compensatoryStaff.name, email: compensatoryStaff.email, isActive: compensatoryStaff.isActive })
            .from(compensatoryStaff)
            .where(eq(compensatoryStaff.id, staffId))
            .for("update")
            .limit(1);
          return rows[0] ?? null;
        },
        async serviceDay() {
          const rows = await db
            .select({
              day: sql<string>`to_char(clock_timestamp() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD')`,
            })
            .from(user)
            .limit(1);
          if (!rows.length) throw new Error("No se pudo validar el día de servicio.");
          return rows[0]!.day;
        },
        async lockOperation(operationId) {
          await db.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${`compensatory-public-operation:${operationId}`}, 0))`,
          );
        },
        async findOperation(operationId) {
          const rows = await db
            .select()
            .from(compensatoryRequest)
            .where(
              and(
                eq(compensatoryRequest.clientOperationId, operationId),
                eq(compensatoryRequest.submissionSource, "public"),
                isNull(compensatoryRequest.createdByUserId),
              ),
            )
            .limit(1);
          return (rows[0] as PublicCompensatoryRequest | undefined) ?? null;
        },
        async insertRequest(input) {
          const rows = await db
            .insert(compensatoryRequest)
            .values(input)
            .returning();
          return rows[0] as PublicCompensatoryRequest;
        },
      };
      return work(tx);
    });
  },
};

export const publicCompensatoryRequests = createPublicCompensatoryService(store);
