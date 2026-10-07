import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { currentAccessSession } from "./auth.functions";
import { requireActiveSession, requireEfa } from "./access";

export const communicationIdSchema = z.string().uuid();
export const communicationNoticeIdSchema = z.string().uuid();
const positiveVersion = z.number().int().positive();
const communicationTime = z.iso.datetime({ offset: true });
const direction = z.enum(["incoming", "outgoing"]);
const priority = z.enum(["red", "yellow", "green"]);
const optionalTime = communicationTime.nullable().optional();
const optionalPriority = priority.nullable().optional();

export const communicationCreateSchema = z
  .object({
    clientCreationKey: z.string().uuid(),
    episodeId: z.string().uuid(),
    direction,
    startedAt: optionalTime,
    endedAt: optionalTime,
    priority: optionalPriority,
  })
  .strict();

export const communicationUpdateSchema = z
  .object({
    communicationId: communicationIdSchema,
    expectedVersion: positiveVersion,
    operationId: z.string().uuid(),
    direction,
    startedAt: communicationTime.nullable(),
    endedAt: communicationTime.nullable(),
    priority: priority.nullable(),
  })
  .strict();

export const communicationFinalizeSchema = z
  .object({
    communicationId: communicationIdSchema,
    expectedVersion: positiveVersion,
    operationId: z.string().uuid(),
    priority,
  })
  .strict();

const getService = createServerOnlyFn(async () => {
  const { efaCommunications } = await import("./efa-communications.server");
  return efaCommunications;
});

export const listEfaCommunications = createServerFn({ method: "GET" }).handler(async () => {
  const access = requireActiveSession(await currentAccessSession());
  return getService().then((service) => service.list(access.userId));
});

export const getEfaCommunication = createServerFn({ method: "GET" })
  .validator((data: unknown) => communicationIdSchema.parse(data))
  .handler(async ({ data }) => {
    const access = requireActiveSession(await currentAccessSession());
    return getService().then((service) => service.get(access.userId, data));
  });

export const getEfaCommunicationHistory = createServerFn({ method: "GET" })
  .validator((data: unknown) => communicationIdSchema.parse(data))
  .handler(async ({ data }) => {
    const access = requireActiveSession(await currentAccessSession());
    return getService().then((service) => service.history(access.userId, data));
  });

export const listEfaCommunicationNotices = createServerFn({ method: "GET" }).handler(async () => {
  const access = requireActiveSession(await currentAccessSession());
  return getService().then((service) => service.listNotices(access.userId));
});

export const markEfaCommunicationNoticeRead = createServerFn({ method: "POST" })
  .validator((data: unknown) => communicationNoticeIdSchema.parse(data))
  .handler(async ({ data }) => {
    const access = requireActiveSession(await currentAccessSession());
    return getService().then((service) => service.markNoticeRead(access.userId, data));
  });

export const createEfaCommunication = createServerFn({ method: "POST" })
  .validator((data: unknown) => communicationCreateSchema.parse(data))
  .handler(async ({ data }) => {
    const access = requireEfa(await currentAccessSession());
    return getService().then((service) =>
      service.create(access.userId, {
        ...data,
        startedAt: data.startedAt ?? null,
        endedAt: data.endedAt ?? null,
        priority: data.priority ?? null,
      }),
    );
  });

export const updateEfaCommunication = createServerFn({ method: "POST" })
  .validator((data: unknown) => communicationUpdateSchema.parse(data))
  .handler(async ({ data }) => {
    const access = requireEfa(await currentAccessSession());
    return getService().then((service) => service.update(access.userId, data));
  });

export const finalizeEfaCommunication = createServerFn({ method: "POST" })
  .validator((data: unknown) => communicationFinalizeSchema.parse(data))
  .handler(async ({ data }) => {
    const access = requireEfa(await currentAccessSession());
    return getService().then((service) => service.finalize(access.userId, data));
  });
