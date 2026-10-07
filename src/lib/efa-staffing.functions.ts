import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { currentAccessSession } from "./auth.functions";
import { requireEfa } from "./access";

const id = z.string().uuid();
const timestamp = z.iso.datetime({ offset: true }).optional();
const cause = z
  .enum(["medical_request", "coordination", "temporary", "other"])
  .nullable()
  .optional();
const description = z.string().trim().max(500).nullable().optional();
const operationId = id;
const listSchema = z.object({ guardId: id }).strict();
const enterSchema = z
  .object({
    guardId: id,
    role: z.enum(["nurse", "driver", "doctor"]),
    enteredAt: timestamp,
    clientOperationId: operationId,
  })
  .strict();
const exitSchema = z
  .object({
    periodId: id,
    expectedVersion: z.number().int().positive(),
    exitedAt: timestamp,
    cause,
    description,
  })
  .strict();
const departSchema = z
  .object({
    periodId: id,
    kind: z.enum(["transfer", "temporary"]),
    departedAt: timestamp,
    cause,
    description,
    clientOperationId: operationId,
  })
  .strict();
const arriveSchema = z.object({ movementId: id, arrivedAt: timestamp }).strict();

const getService = createServerOnlyFn(async () => {
  const { efaStaffing } = await import("./efa-staffing.server.db");
  return efaStaffing;
});

export const listEfaStaffing = createServerFn({ method: "GET" })
  .validator((data: unknown) => listSchema.parse(data))
  .handler(async ({ data }) => {
    const access = requireEfa(await currentAccessSession());
    return getService().then((service) => service.list(access.userId, data.guardId));
  });

export const enterEfaStaffing = createServerFn({ method: "POST" })
  .validator((data: unknown) => enterSchema.parse(data))
  .handler(async ({ data }) => {
    const access = requireEfa(await currentAccessSession());
    return getService().then((service) => service.enter(access.userId, data));
  });

export const exitEfaStaffing = createServerFn({ method: "POST" })
  .validator((data: unknown) => exitSchema.parse(data))
  .handler(async ({ data }) => {
    const access = requireEfa(await currentAccessSession());
    return getService().then((service) => service.exit(access.userId, data));
  });

export const departEfaStaffing = createServerFn({ method: "POST" })
  .validator((data: unknown) => departSchema.parse(data))
  .handler(async ({ data }) => {
    const access = requireEfa(await currentAccessSession());
    return getService().then((service) => service.depart(access.userId, data));
  });

export const arriveEfaStaffing = createServerFn({ method: "POST" })
  .validator((data: unknown) => arriveSchema.parse(data))
  .handler(async ({ data }) => {
    const access = requireEfa(await currentAccessSession());
    return getService().then((service) => service.arrive(access.userId, data));
  });
