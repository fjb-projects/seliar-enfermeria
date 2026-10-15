import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { currentAccessSession } from "./auth.functions";
import { requireActiveSession, requireEfa } from "./access";

const uuid = z.string().uuid();
const expectedVersion = z.number().int().positive();
const timestamp = z.iso.datetime({ offset: true });
const note = z.string().max(300).nullable().optional();
const serviceLoader = createServerOnlyFn(async () => {
  const { efaMobileHygiene } = await import("./efa-mobile-hygiene.server.db");
  return efaMobileHygiene;
});
async function read<T>(
  work: (service: Awaited<ReturnType<typeof serviceLoader>>, userId: string) => T,
) {
  const access = requireActiveSession(await currentAccessSession());
  return work(await serviceLoader(), access.userId);
}
async function write<T>(
  work: (service: Awaited<ReturnType<typeof serviceLoader>>, userId: string) => T,
) {
  const access = requireEfa(await currentAccessSession());
  return work(await serviceLoader(), access.userId);
}

export const mobileHygieneRequestSchema = z
  .object({
    guardId: uuid,
    baseId: uuid,
    clientCreationKey: uuid,
    operationId: uuid,
    requestedAt: timestamp.optional(),
  })
  .strict();
export const mobileHygieneAvailableSchema = z
  .object({
    periodId: uuid,
    expectedVersion,
    operationId: uuid,
    availableAt: timestamp.optional(),
  })
  .strict();
export const mobileHygieneUpdateSchema = z
  .object({
    periodId: uuid,
    expectedVersion,
    operationId: uuid,
    requestedAt: timestamp,
    availableAt: timestamp.nullable(),
    note,
  })
  .strict();
export const mobileHygieneDeleteSchema = z
  .object({ periodId: uuid, expectedVersion, operationId: uuid })
  .strict();

export const listEfaMobileHygieneForGuard = createServerFn({ method: "GET" })
  .validator((data: unknown) => uuid.parse(data))
  .handler(({ data }) => read((service, userId) => service.listForGuard(userId, data)));
export const requestEfaMobileHygiene = createServerFn({ method: "POST" })
  .validator((data: unknown) => mobileHygieneRequestSchema.parse(data))
  .handler(({ data }) => write((service, userId) => service.request(userId, data)));
export const markEfaMobileHygieneAvailable = createServerFn({ method: "POST" })
  .validator((data: unknown) => mobileHygieneAvailableSchema.parse(data))
  .handler(({ data }) => write((service, userId) => service.markAvailable(userId, data)));
export const updateEfaMobileHygiene = createServerFn({ method: "POST" })
  .validator((data: unknown) => mobileHygieneUpdateSchema.parse(data))
  .handler(({ data }) => write((service, userId) => service.update(userId, data)));
export const deleteEfaMobileHygiene = createServerFn({ method: "POST" })
  .validator((data: unknown) => mobileHygieneDeleteSchema.parse(data))
  .handler(({ data }) => write((service, userId) => service.delete(userId, data)));
