import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { currentAccessSession } from "./auth.functions";
import { requireActiveSession, requireEfa } from "./access";

const uuid = z.string().uuid();
const version = z.number().int().positive();
const observedAt = z.iso.datetime({ offset: true }).nullable().optional();
const observationGroup = z.enum(["phone", "radio", "coordination", "duty", "record"]);
const context = z.discriminatedUnion("contextType", [
  z.object({ contextType: z.literal("guard"), guardId: uuid }).strict(),
  z.object({ contextType: z.literal("episode"), guardId: uuid, episodeId: uuid }).strict(),
  z
    .object({
      contextType: z.literal("communication"),
      guardId: uuid,
      episodeId: uuid,
      communicationId: uuid,
    })
    .strict(),
  z
    .object({
      contextType: z.literal("dispatch"),
      guardId: uuid,
      episodeId: uuid,
      dispatchId: uuid,
    })
    .strict(),
  z
    .object({
      contextType: z.literal("coordination"),
      guardId: uuid,
      episodeId: uuid,
      coordinationId: uuid,
    })
    .strict(),
  z
    .object({
      contextType: z.literal("police_event"),
      guardId: uuid,
      episodeId: uuid,
      coordinationId: uuid,
      policeEventId: uuid,
    })
    .strict(),
]);
const serviceLoader = createServerOnlyFn(async () => {
  const { efaObservationService } = await import("./efa-observations.server");
  return efaObservationService;
});
async function read<T>(
  work: (service: Awaited<ReturnType<typeof serviceLoader>>, userId: string) => T | Promise<T>,
) {
  const access = requireActiveSession(await currentAccessSession());
  return work(await serviceLoader(), access.userId);
}
async function write<T>(
  work: (service: Awaited<ReturnType<typeof serviceLoader>>, userId: string) => T | Promise<T>,
) {
  const access = requireEfa(await currentAccessSession());
  return work(await serviceLoader(), access.userId);
}

export const observationGuardIdSchema = uuid;
export const observationEpisodeIdSchema = uuid;
export const observationIdSchema = uuid;
export const observationNoticeIdSchema = uuid;
export const observationCatalogKeySchema = z.string().min(1).max(100);
export const observationContextSchema = context;
export const observationCreateSchema = context.and(
  z
    .object({
      clientCreationKey: uuid,
      operationId: uuid,
      catalogItemKey: observationCatalogKeySchema,
      classification: z.enum(["adequate", "needs_improvement"]),
      otherDescription: z.string().max(1000).nullable().optional(),
      otherGroup: observationGroup.optional(),
      comment: z.string().max(1000).nullable().optional(),
      observedAt,
    })
    .strict(),
);
export const observationUpdateSchema = z
  .object({
    observationId: uuid,
    expectedVersion: version,
    operationId: uuid,
    catalogItemKey: observationCatalogKeySchema.optional(),
    classification: z.enum(["adequate", "needs_improvement"]).optional(),
    otherDescription: z.string().max(1000).nullable().optional(),
    otherGroup: observationGroup.optional(),
    comment: z.string().max(1000).nullable().optional(),
    observedAt,
  })
  .strict();

export const getEfaObservationCatalog = createServerFn({ method: "GET" }).handler(() =>
  read((service, userId) => service.catalog(userId)),
);
export const listEfaObservationsForGuard = createServerFn({ method: "GET" })
  .validator((data: unknown) => observationGuardIdSchema.parse(data))
  .handler(({ data }) => read((service, userId) => service.listForGuard(userId, data)));
export const listEfaObservationsForEpisode = createServerFn({ method: "GET" })
  .validator((data: unknown) => observationEpisodeIdSchema.parse(data))
  .handler(({ data }) => read((service, userId) => service.listForEpisode(userId, data)));
export const getEfaObservation = createServerFn({ method: "GET" })
  .validator((data: unknown) => observationIdSchema.parse(data))
  .handler(({ data }) => read((service, userId) => service.get(userId, data)));
export const getEfaObservationHistory = createServerFn({ method: "GET" })
  .validator((data: unknown) => observationIdSchema.parse(data))
  .handler(({ data }) => read((service, userId) => service.history(userId, data)));
export const listEfaObservationNotices = createServerFn({ method: "GET" }).handler(() =>
  read((service, userId) => service.listNotices(userId)),
);
export const markEfaObservationNoticeRead = createServerFn({ method: "POST" })
  .validator((data: unknown) => observationNoticeIdSchema.parse(data))
  .handler(({ data }) => read((service, userId) => service.markNoticeRead(userId, data)));
export const createEfaObservation = createServerFn({ method: "POST" })
  .validator((data: unknown) => observationCreateSchema.parse(data))
  .handler(({ data }) => write((service, userId) => service.create(userId, data)));
export const updateEfaObservation = createServerFn({ method: "POST" })
  .validator((data: unknown) => observationUpdateSchema.parse(data))
  .handler(({ data }) => write((service, userId) => service.update(userId, data)));
