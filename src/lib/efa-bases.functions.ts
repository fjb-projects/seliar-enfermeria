import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { currentAccessSession } from "./auth.functions";
import { requireAdministrator, requireEfa } from "./access";

export const baseNameSchema = z.string().trim().min(1).max(120);
export const baseIdSchema = z.string().uuid();
const expectedVersion = z.number().int().positive();
export const baseMutationSchema = z
  .object({ baseId: baseIdSchema, expectedVersion, name: baseNameSchema })
  .strict();
const activeSchema = z
  .object({ baseId: baseIdSchema, expectedVersion, isActive: z.boolean() })
  .strict();

const getService = createServerOnlyFn(async () => {
  const { efaBases } = await import("./efa-bases.server");
  return efaBases;
});

export const listEfaBases = createServerFn({ method: "GET" }).handler(async () => {
  const access = requireEfa(await currentAccessSession());
  return getService().then((service) => service.listActive(access.userId));
});

export const listAdminBases = createServerFn({ method: "GET" }).handler(async () => {
  const access = requireAdministrator(await currentAccessSession());
  return getService().then((service) => service.listCatalog(access.userId));
});

export const createEfaBase = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ name: baseNameSchema }).strict().parse(data))
  .handler(async ({ data }) => {
    const access = requireAdministrator(await currentAccessSession());
    return getService().then((service) => service.create(access.userId, data.name));
  });

export const renameEfaBase = createServerFn({ method: "POST" })
  .validator((data: unknown) => baseMutationSchema.parse(data))
  .handler(async ({ data }) => {
    const access = requireAdministrator(await currentAccessSession());
    return getService().then((service) => service.rename(access.userId, data));
  });

export const setEfaBaseActive = createServerFn({ method: "POST" })
  .validator((data: unknown) => activeSchema.parse(data))
  .handler(async ({ data }) => {
    const access = requireAdministrator(await currentAccessSession());
    return getService().then((service) => service.setActive(access.userId, data));
  });
