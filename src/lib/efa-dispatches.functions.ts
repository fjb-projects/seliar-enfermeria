import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { currentAccessSession } from "./auth.functions";
import { requireActiveSession, requireEfa } from "./access";

export const dispatchIdSchema = z.string().uuid();
export const dispatchEpisodeIdSchema = z.string().uuid();
export const dispatchNoticeIdSchema = z.string().uuid();
export const supportRequestIdSchema = z.string().uuid();
export const firstResponseRoleValues = [
  "driver",
  "nurse",
  "doctor",
  "other",
  "not_observed",
] as const;
const uuid = z.string().uuid();
const version = z.number().int().positive();
const time = z.iso.datetime({ offset: true }).nullable();
const priority = z.enum(["red", "yellow", "green"]);
const result = z.enum([
  "transported",
  "treated_at_home",
  "refused",
  "not_located",
  "cancelled",
  "death",
  "not_informed",
]);
const timeStatus = z.enum(["observed", "not_observed", "not_informed", "not_applicable"]);
const timingFields = {
  t0At: time.optional(),
  t0Status: timeStatus.optional(),
  t1At: time.optional(),
  t1Status: timeStatus.optional(),
  t2At: time.optional(),
  t2Status: timeStatus.optional(),
  t3At: time.optional(),
  t3Status: timeStatus.optional(),
  t4At: time.optional(),
  t4Status: timeStatus.optional(),
  t5At: time.optional(),
  t5Status: timeStatus.optional(),
  t6At: time.optional(),
  t6Status: timeStatus.optional(),
};
const dispatchFields = {
  baseId: uuid,
  institutionId: uuid.nullable().optional(),
  communicationId: uuid.nullable().optional(),
  priority: priority.nullable().optional(),
  ...timingFields,
  firstResponseRole: z.enum(firstResponseRoleValues).nullable().optional(),
  firstResponseAt: time.optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  result: result.nullable().optional(),
  resultClarification: z.string().trim().max(1000).nullable().optional(),
};
const dispatchCreateFields = {
  ...dispatchFields,
  t0Status: timeStatus.default("not_observed"),
  t1Status: timeStatus.default("not_observed"),
  t2Status: timeStatus.default("not_observed"),
  t3Status: timeStatus.default("not_observed"),
  t4Status: timeStatus.default("not_observed"),
  t5Status: timeStatus.default("not_observed"),
  t6Status: timeStatus.default("not_observed"),
};

const getService = createServerOnlyFn(async () => {
  const { efaDispatches } = await import("./efa-dispatches.server");
  return efaDispatches;
});

export const dispatchCreateSchema = z
  .object({ clientCreationKey: uuid, episodeId: uuid, ...dispatchCreateFields })
  .strict();
export const dispatchUpdateSchema = z
  .object({ dispatchId: uuid, expectedVersion: version, operationId: uuid, ...dispatchFields })
  .strict();
export const dispatchFinalizeSchema = z
  .object({
    dispatchId: uuid,
    expectedVersion: version,
    operationId: uuid,
    priority,
    result,
    resultClarification: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();
export const dispatchContactAttemptSchema = z
  .object({
    dispatchId: uuid,
    clientEventId: uuid,
    occurredAt: z.iso.datetime({ offset: true }),
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();
export const supportRequestCreateSchema = z
  .object({
    clientCreationKey: uuid,
    sourceDispatchId: uuid,
    requestedAt: z.iso.datetime({ offset: true }),
    reason: z.string().trim().min(1).max(1000),
    responseDispatchId: uuid.nullable().optional(),
  })
  .strict();
export const supportRequestUpdateSchema = z
  .object({
    supportRequestId: uuid,
    expectedVersion: version,
    operationId: uuid,
    requestedAt: z.iso.datetime({ offset: true }),
    reason: z.string().trim().min(1).max(1000),
    responseDispatchId: uuid.nullable(),
  })
  .strict();

async function runRead<T>(
  work: (service: Awaited<ReturnType<typeof getService>>, userId: string) => T | Promise<T>,
) {
  const access = requireActiveSession(await currentAccessSession());
  return work(await getService(), access.userId);
}
async function runWrite<T>(
  work: (service: Awaited<ReturnType<typeof getService>>, userId: string) => T | Promise<T>,
) {
  const access = requireEfa(await currentAccessSession());
  return work(await getService(), access.userId);
}

export const listEfaDispatchesForEpisode = createServerFn({ method: "GET" })
  .validator((data: unknown) => dispatchEpisodeIdSchema.parse(data))
  .handler(({ data }) => runRead((service, userId) => service.listForEpisode(userId, data)));
export const getEfaDispatch = createServerFn({ method: "GET" })
  .validator((data: unknown) => dispatchIdSchema.parse(data))
  .handler(({ data }) => runRead((service, userId) => service.get(userId, data)));
export const getEfaDispatchHistory = createServerFn({ method: "GET" })
  .validator((data: unknown) => dispatchIdSchema.parse(data))
  .handler(({ data }) => runRead((service, userId) => service.history(userId, data)));
export const listEfaDispatchNotices = createServerFn({ method: "GET" }).handler(() =>
  runRead((service, userId) => service.listNotices(userId)),
);
export const markEfaDispatchNoticeRead = createServerFn({ method: "POST" })
  .validator((data: unknown) => dispatchNoticeIdSchema.parse(data))
  .handler(({ data }) => runRead((service, userId) => service.markNoticeRead(userId, data)));
export const createEfaDispatch = createServerFn({ method: "POST" })
  .validator((data: unknown) => dispatchCreateSchema.parse(data))
  .handler(({ data }) => runWrite((service, userId) => service.create(userId, data)));
export const updateEfaDispatch = createServerFn({ method: "POST" })
  .validator((data: unknown) => dispatchUpdateSchema.parse(data))
  .handler(({ data }) => runWrite((service, userId) => service.update(userId, data)));
export const finalizeEfaDispatch = createServerFn({ method: "POST" })
  .validator((data: unknown) => dispatchFinalizeSchema.parse(data))
  .handler(({ data }) => runWrite((service, userId) => service.finalize(userId, data)));
export const addEfaDispatchContactAttempt = createServerFn({ method: "POST" })
  .validator((data: unknown) => dispatchContactAttemptSchema.parse(data))
  .handler(({ data }) => runWrite((service, userId) => service.addContactAttempt(userId, data)));
export const createEfaSupportRequest = createServerFn({ method: "POST" })
  .validator((data: unknown) => supportRequestCreateSchema.parse(data))
  .handler(({ data }) => runWrite((service, userId) => service.createSupportRequest(userId, data)));
export const updateEfaSupportRequest = createServerFn({ method: "POST" })
  .validator((data: unknown) => supportRequestUpdateSchema.parse(data))
  .handler(({ data }) => runWrite((service, userId) => service.updateSupportRequest(userId, data)));
export const getEfaSupportRequestHistory = createServerFn({ method: "GET" })
  .validator((data: unknown) => supportRequestIdSchema.parse(data))
  .handler(({ data }) => runRead((service, userId) => service.supportHistory(userId, data)));
