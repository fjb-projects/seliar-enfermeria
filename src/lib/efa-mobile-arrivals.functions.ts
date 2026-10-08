import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { currentAccessSession } from "./auth.functions";
import { requireActiveSession, requireEfa } from "./access";

const uuid = z.string().uuid();
const expectedVersion = z.number().int().positive();
const arrivedAt = z.iso.datetime({ offset: true });
const serviceLoader = createServerOnlyFn(async () => {
  const { efaMobileArrivals } = await import("./efa-mobile-arrivals.server.db");
  return efaMobileArrivals;
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

export const mobileArrivalCreateSchema = z
  .object({
    guardId: uuid,
    baseId: uuid,
    role: z.enum(["nurse", "driver", "doctor"]),
    clientCreationKey: uuid,
    operationId: uuid,
    arrivedAt: arrivedAt.optional(),
  })
  .strict();
export const mobileArrivalUpdateSchema = z
  .object({
    arrivalId: uuid,
    expectedVersion,
    operationId: uuid,
    arrivedAt,
  })
  .strict();
export const mobileArrivalDeleteSchema = z
  .object({ arrivalId: uuid, expectedVersion, operationId: uuid })
  .strict();

export const listEfaMobileArrivalsForGuard = createServerFn({ method: "GET" })
  .validator((data: unknown) => uuid.parse(data))
  .handler(({ data }) => read((service, userId) => service.listForGuard(userId, data)));
export const getEfaMobileArrivalHistory = createServerFn({ method: "GET" })
  .validator((data: unknown) => uuid.parse(data))
  .handler(({ data }) => read((service, userId) => service.history(userId, data)));
export const createEfaMobileArrival = createServerFn({ method: "POST" })
  .validator((data: unknown) => mobileArrivalCreateSchema.parse(data))
  .handler(({ data }) => write((service, userId) => service.create(userId, data)));
export const updateEfaMobileArrival = createServerFn({ method: "POST" })
  .validator((data: unknown) => mobileArrivalUpdateSchema.parse(data))
  .handler(({ data }) => write((service, userId) => service.update(userId, data)));
export const deleteEfaMobileArrival = createServerFn({ method: "POST" })
  .validator((data: unknown) => mobileArrivalDeleteSchema.parse(data))
  .handler(({ data }) => write((service, userId) => service.delete(userId, data)));
