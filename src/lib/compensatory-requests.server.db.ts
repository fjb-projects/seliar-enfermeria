import { and, asc, desc, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getDatabase } from "../db/index.server";
import {
  accountAccess,
  accountRoleGrant,
  compensatoryRequest,
  compensatoryStaff,
} from "../db/schema";
import {
  createCompensatoryRequestsService,
  type CompensatoryRequestInput,
  type CompensatoryRequestRecord,
  type CompensatoryRequestsTransaction,
  type CompensatoryRequestsStore,
} from "./compensatory-requests.server";

const store: CompensatoryRequestsStore = {
  async transaction(work) {
    return getDatabase().transaction(async (db) => {
      const tx: CompensatoryRequestsTransaction = {
        async findActor(userId) {
          const rows = await db
            .select({ isActive: accountAccess.isActive, role: accountRoleGrant.role })
            .from(accountAccess)
            .leftJoin(accountRoleGrant, eq(accountRoleGrant.userId, accountAccess.userId))
            .where(eq(accountAccess.userId, userId));
          return rows.length
            ? { isActive: rows[0]!.isActive, isAdmin: rows.some((row) => row.role === "admin") }
            : null;
        },
        async hasStaff(staffId) {
          const rows = await db
            .select({ id: compensatoryStaff.id })
            .from(compensatoryStaff)
            .where(eq(compensatoryStaff.id, staffId))
            .limit(1);
          return rows.length > 0;
        },
        async listRequests(staffId) {
          const query = db
            .select({
              id: compensatoryRequest.id,
              clientOperationId: compensatoryRequest.clientOperationId,
              staffId: compensatoryRequest.staffId,
              submittedAt: compensatoryRequest.submittedAt,
              requesterName: compensatoryRequest.requesterName,
              requesterMobile: compensatoryRequest.requesterMobile,
              compensatoryDate: compensatoryRequest.compensatoryDate,
              hours: compensatoryRequest.hours,
              createdAt: compensatoryRequest.createdAt,
            })
            .from(compensatoryRequest)
            .orderBy(desc(compensatoryRequest.createdAt), asc(compensatoryRequest.id));
          const rows = staffId
            ? await query.where(eq(compensatoryRequest.staffId, staffId))
            : await query;
          return rows as CompensatoryRequestRecord[];
        },
        async lockOperation(actorUserId, operationId) {
          await db.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${`compensatory-request-operation:${actorUserId}:${operationId}`}, 0))`,
          );
        },
        async findOperation(actorUserId, operationId) {
          const rows = await db
            .select({
              createdByUserId: compensatoryRequest.createdByUserId,
              request: {
                id: compensatoryRequest.id,
                clientOperationId: compensatoryRequest.clientOperationId,
                staffId: compensatoryRequest.staffId,
                submittedAt: compensatoryRequest.submittedAt,
                requesterName: compensatoryRequest.requesterName,
                requesterMobile: compensatoryRequest.requesterMobile,
                compensatoryDate: compensatoryRequest.compensatoryDate,
                hours: compensatoryRequest.hours,
                createdAt: compensatoryRequest.createdAt,
              },
            })
            .from(compensatoryRequest)
            .where(
              and(
                eq(compensatoryRequest.createdByUserId, actorUserId),
                eq(compensatoryRequest.clientOperationId, operationId),
              ),
            )
            .limit(1);
          return (
            (rows[0] as
              { createdByUserId: string; request: CompensatoryRequestRecord } | undefined) ?? null
          );
        },
        async lockDuplicateKey(input) {
          const key = JSON.stringify([
            input.staffId,
            input.submittedAt,
            input.requesterName,
            input.requesterMobile,
            input.compensatoryDate,
            input.hours,
          ]);
          await db.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${`compensatory-request:${key}`}, 0))`,
          );
        },
        async listDuplicates(input) {
          const rows = await db
            .select()
            .from(compensatoryRequest)
            .where(
              and(
                eq(compensatoryRequest.staffId, input.staffId),
                eq(compensatoryRequest.submittedAt, input.submittedAt),
                eq(compensatoryRequest.requesterName, input.requesterName),
                eq(compensatoryRequest.requesterMobile, input.requesterMobile),
                eq(compensatoryRequest.compensatoryDate, input.compensatoryDate),
                eq(compensatoryRequest.hours, input.hours),
              ),
            )
            .orderBy(asc(compensatoryRequest.createdAt), asc(compensatoryRequest.id));
          return rows as CompensatoryRequestRecord[];
        },
        async insertRequest(actorUserId: string, input: CompensatoryRequestInput) {
          const rows = await db
            .insert(compensatoryRequest)
            .values({ ...input, createdByUserId: actorUserId })
            .returning({
              id: compensatoryRequest.id,
              clientOperationId: compensatoryRequest.clientOperationId,
              staffId: compensatoryRequest.staffId,
              submittedAt: compensatoryRequest.submittedAt,
              requesterName: compensatoryRequest.requesterName,
              requesterMobile: compensatoryRequest.requesterMobile,
              compensatoryDate: compensatoryRequest.compensatoryDate,
              hours: compensatoryRequest.hours,
              createdAt: compensatoryRequest.createdAt,
            });
          return rows[0] as CompensatoryRequestRecord;
        },
      };
      return work(tx);
    });
  },
};

export const compensatoryRequests = createCompensatoryRequestsService(store);
