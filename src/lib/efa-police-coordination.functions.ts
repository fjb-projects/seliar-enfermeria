import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { currentAccessSession } from "./auth.functions";
import { requireActiveSession, requireEfa } from "./access";

const uuid = z.string().uuid();
const version = z.number().int().positive();
const time = z.iso.datetime({ offset: true }).nullable().optional();
const kind = z.enum([
  "request",
  "response",
  "reiteration",
  "arrival_meeting_point",
  "waiting",
  "actual_meeting",
]);
const timeStatus = z.enum(["observed", "not_observed", "not_informed", "not_applicable"]);
const getService = createServerOnlyFn(async () => {
  const { efaPoliceCoordinationService } = await import("./efa-police-coordination.server");
  return efaPoliceCoordinationService;
});
async function read<T>(
  work: (service: Awaited<ReturnType<typeof getService>>, userId: string) => T | Promise<T>,
) {
  const access = requireActiveSession(await currentAccessSession());
  return work(await getService(), access.userId);
}
async function write<T>(
  work: (service: Awaited<ReturnType<typeof getService>>, userId: string) => T | Promise<T>,
) {
  const access = requireEfa(await currentAccessSession());
  return work(await getService(), access.userId);
}
export const policeEpisodeIdSchema = uuid;
export const policeCoordinationIdSchema = uuid;
export const policeNoticeIdSchema = uuid;
export const policeCoordinationCreateSchema = z
  .object({
    episodeId: uuid,
    clientCreationKey: uuid,
    operationId: uuid,
    initiator: z.enum(["central", "ambulance"]),
    initiatingDispatchId: uuid.nullable().optional(),
    placeType: z.enum(["incident", "meeting_point"]),
    meetingReference: z.string().max(500).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    dispatchIds: z.array(uuid).max(50).optional(),
  })
  .strict();
export const policeCoordinationUpdateSchema = z
  .object({
    coordinationId: uuid,
    expectedVersion: version,
    operationId: uuid,
    initiator: z.enum(["central", "ambulance"]),
    initiatingDispatchId: uuid.nullable(),
    placeType: z.enum(["incident", "meeting_point"]),
    meetingReference: z.string().max(500).nullable(),
    notes: z.string().max(2000).nullable(),
  })
  .strict();
export const policeCoordinationSetDispatchesSchema = z
  .object({
    coordinationId: uuid,
    expectedVersion: version,
    operationId: uuid,
    dispatchIds: z.array(uuid).max(50),
  })
  .strict();
const eventFields = {
  kind,
  dispatchId: uuid.nullable().optional(),
  occurredAt: time,
  timeStatus: timeStatus.optional(),
  note: z.string().max(2000).nullable().optional(),
};
export const policeCoordinationAddEventSchema = z
  .object({
    coordinationId: uuid,
    expectedVersion: version,
    operationId: uuid,
    clientEventId: uuid,
    ...eventFields,
  })
  .strict();
export const policeCoordinationUpdateEventSchema = z
  .object({
    coordinationId: uuid,
    eventId: uuid,
    expectedVersion: version,
    expectedCoordinationVersion: version,
    operationId: uuid,
    ...eventFields,
  })
  .strict();

export const listEfaPoliceCoordinationsForEpisode = createServerFn({ method: "GET" })
  .validator((data: unknown) => policeEpisodeIdSchema.parse(data))
  .handler(({ data }) => read((service, userId) => service.listForEpisode(userId, data)));
export const getEfaPoliceCoordination = createServerFn({ method: "GET" })
  .validator((data: unknown) => policeCoordinationIdSchema.parse(data))
  .handler(({ data }) => read((service, userId) => service.get(userId, data)));
export const getEfaPoliceCoordinationHistory = createServerFn({ method: "GET" })
  .validator((data: unknown) => policeCoordinationIdSchema.parse(data))
  .handler(({ data }) => read((service, userId) => service.history(userId, data)));
export const listEfaPoliceCoordinationNotices = createServerFn({ method: "GET" }).handler(() =>
  read((service, userId) => service.listNotices(userId)),
);
export const markEfaPoliceCoordinationNoticeRead = createServerFn({ method: "POST" })
  .validator((data: unknown) => policeNoticeIdSchema.parse(data))
  .handler(({ data }) => read((service, userId) => service.markNoticeRead(userId, data)));
export const createEfaPoliceCoordination = createServerFn({ method: "POST" })
  .validator((data: unknown) => policeCoordinationCreateSchema.parse(data))
  .handler(({ data }) => write((service, userId) => service.create(userId, data)));
export const updateEfaPoliceCoordination = createServerFn({ method: "POST" })
  .validator((data: unknown) => policeCoordinationUpdateSchema.parse(data))
  .handler(({ data }) => write((service, userId) => service.update(userId, data)));
export const setEfaPoliceCoordinationDispatches = createServerFn({ method: "POST" })
  .validator((data: unknown) => policeCoordinationSetDispatchesSchema.parse(data))
  .handler(({ data }) => write((service, userId) => service.setDispatches(userId, data)));
export const addEfaPoliceCoordinationEvent = createServerFn({ method: "POST" })
  .validator((data: unknown) => policeCoordinationAddEventSchema.parse(data))
  .handler(({ data }) => write((service, userId) => service.addEvent(userId, data)));
export const updateEfaPoliceCoordinationEvent = createServerFn({ method: "POST" })
  .validator((data: unknown) => policeCoordinationUpdateEventSchema.parse(data))
  .handler(({ data }) => write((service, userId) => service.updateEvent(userId, data)));
