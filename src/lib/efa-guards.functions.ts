import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { currentAccessSession } from "./auth.functions";
import { requireAdministrator, requireEfa } from "./access";

export const guardIdSchema = z.string().uuid();
const expectedVersion = z.number().int().positive();
export const guardStartSchema = z.object({ declaredAtCentral: z.literal(true) }).strict();
export const guardEndSchema = z.object({ guardId: guardIdSchema, expectedVersion }).strict();
export const guardBasesSchema = z
  .object({
    guardId: guardIdSchema,
    expectedVersion,
    baseIds: z.array(z.string().uuid()).min(1).max(100),
  })
  .strict();
export const guardCorrectionSchema = z
  .object({ guardId: guardIdSchema, expectedVersion, endedAt: z.iso.datetime({ offset: true }) })
  .strict();

const getService = createServerOnlyFn(async () => {
  const { efaGuards } = await import("./efa-guards.server");
  return efaGuards;
});

export const listActiveEfaGuardBases = createServerFn({ method: "GET" }).handler(async () => {
  const access = requireEfa(await currentAccessSession());
  return getService().then((service) => service.listActiveBases(access.userId));
});

export const listEfaGuards = createServerFn({ method: "GET" }).handler(async () => {
  const access = requireEfa(await currentAccessSession());
  return getService().then((service) => service.list(access.userId));
});

export const startEfaGuard = createServerFn({ method: "POST" })
  .validator((data: unknown) => guardStartSchema.parse(data))
  .handler(async ({ data }) => {
    const access = requireEfa(await currentAccessSession());
    return getService().then((service) => service.start(access.userId, data));
  });

export const setEfaGuardBases = createServerFn({ method: "POST" })
  .validator((data: unknown) => guardBasesSchema.parse(data))
  .handler(async ({ data }) => {
    const access = requireEfa(await currentAccessSession());
    return getService().then((service) => service.setBases(access.userId, data));
  });

export const endEfaGuard = createServerFn({ method: "POST" })
  .validator((data: unknown) => guardEndSchema.parse(data))
  .handler(async ({ data }) => {
    const access = requireEfa(await currentAccessSession());
    return getService().then((service) => service.end(access.userId, data));
  });

export const correctEfaGuardEnd = createServerFn({ method: "POST" })
  .validator((data: unknown) => guardCorrectionSchema.parse(data))
  .handler(async ({ data }) => {
    const access = requireAdministrator(await currentAccessSession());
    return getService().then((service) =>
      service.correctEnd(access.userId, { ...data, endedAt: new Date(data.endedAt) }),
    );
  });
