import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { currentAccessSession } from "./auth.functions";
import { requireActiveSession, requireEfa } from "./access";

export const episodeIdSchema = z.string().uuid();
export const noticeIdSchema = z.string().uuid();
const positiveVersion = z.number().int().positive();
const eventAt = z.iso.datetime({ offset: true });
const motive = z.string().trim().max(2000).nullable().optional();
const address = z.string().max(1000).nullable().optional();
const interventionNumber = z.string().trim().max(100).nullable().optional();
export const episodeCreateSchema = z
  .object({
    clientCreationKey: z.string().uuid(),
    guardId: z.string().uuid(),
    eventAt,
    motive,
    address,
    interventionNumber,
  })
  .strict();
export const episodeUpdateSchema = z
  .object({
    episodeId: episodeIdSchema,
    expectedVersion: positiveVersion,
    operationId: z.string().uuid(),
    eventAt,
    motive: z.string().trim().max(2000).nullable(),
    address: z.string().max(1000).nullable(),
    interventionNumber: z.string().trim().max(100).nullable(),
  })
  .strict();
export const episodeCloseSchema = z
  .object({
    episodeId: episodeIdSchema,
    expectedVersion: positiveVersion,
    operationId: z.string().uuid(),
  })
  .strict();

const getService = createServerOnlyFn(async () => {
  const { efaEpisodes } = await import("./efa-episodes.server");
  return efaEpisodes;
});

export const listEfaEpisodes = createServerFn({ method: "GET" }).handler(async () => {
  const access = requireActiveSession(await currentAccessSession());
  return getService().then((service) => service.list(access.userId));
});

export const getEfaEpisode = createServerFn({ method: "GET" })
  .validator((data: unknown) => episodeIdSchema.parse(data))
  .handler(async ({ data }) => {
    const access = requireActiveSession(await currentAccessSession());
    return getService().then((service) => service.get(access.userId, data));
  });

export const getEfaEpisodeHistory = createServerFn({ method: "GET" })
  .validator((data: unknown) => episodeIdSchema.parse(data))
  .handler(async ({ data }) => {
    const access = requireActiveSession(await currentAccessSession());
    return getService().then((service) => service.history(access.userId, data));
  });

export const listEfaEpisodeNotices = createServerFn({ method: "GET" }).handler(async () => {
  const access = requireActiveSession(await currentAccessSession());
  return getService().then((service) => service.listNotices(access.userId));
});

export const markEfaEpisodeNoticeRead = createServerFn({ method: "POST" })
  .validator((data: unknown) => noticeIdSchema.parse(data))
  .handler(async ({ data }) => {
    const access = requireActiveSession(await currentAccessSession());
    return getService().then((service) => service.markNoticeRead(access.userId, data));
  });

export const createEfaEpisode = createServerFn({ method: "POST" })
  .validator((data: unknown) => episodeCreateSchema.parse(data))
  .handler(async ({ data }) => {
    const access = requireEfa(await currentAccessSession());
    return getService().then((service) =>
      service.create(access.userId, {
        ...data,
        motive: data.motive ?? null,
        address: data.address?.trim() ?? null,
        interventionNumber: data.interventionNumber ?? null,
      }),
    );
  });

export const updateEfaEpisode = createServerFn({ method: "POST" })
  .validator((data: unknown) => episodeUpdateSchema.parse(data))
  .handler(async ({ data }) => {
    const access = requireEfa(await currentAccessSession());
    return getService().then((service) => service.update(access.userId, data));
  });

export const closeEfaEpisode = createServerFn({ method: "POST" })
  .validator((data: unknown) => episodeCloseSchema.parse(data))
  .handler(async ({ data }) => {
    const access = requireEfa(await currentAccessSession());
    return getService().then((service) => service.close(access.userId, data));
  });
