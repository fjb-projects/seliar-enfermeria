import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { currentAccessSession } from "./auth.functions";
import { requireAdministrator, requireEfa } from "./access";

export const institutionNameSchema = z.string().trim().min(1).max(120);
export const institutionIdSchema = z.string().uuid();
const expectedVersion = z.number().int().positive();
export const institutionMutationSchema = z
  .object({ institutionId: institutionIdSchema, expectedVersion, name: institutionNameSchema })
  .strict();
export const institutionActiveSchema = z
  .object({ institutionId: institutionIdSchema, expectedVersion, isActive: z.boolean() })
  .strict();

const getService = createServerOnlyFn(async () => {
  const { efaInstitutions } = await import("./efa-institutions.server");
  return efaInstitutions;
});

export const listEfaInstitutions = createServerFn({ method: "GET" }).handler(async () => {
  const access = requireEfa(await currentAccessSession());
  return getService().then((service) => service.listActive(access.userId));
});

export const createEfaInstitutionInline = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ name: institutionNameSchema }).strict().parse(data))
  .handler(async ({ data }) => {
    const access = requireEfa(await currentAccessSession());
    return getService().then((service) => service.createInline(access.userId, data.name));
  });

export const listAdminInstitutions = createServerFn({ method: "GET" }).handler(async () => {
  const access = requireAdministrator(await currentAccessSession());
  return getService().then((service) => service.listCatalog(access.userId));
});

export const listEfaInstitutionHistory = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ institutionId: institutionIdSchema }).strict().parse(data),
  )
  .handler(async ({ data }) => {
    const access = requireAdministrator(await currentAccessSession());
    return getService().then((service) => service.listHistory(access.userId, data.institutionId));
  });

export const createAdminInstitution = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ name: institutionNameSchema }).strict().parse(data))
  .handler(async ({ data }) => {
    const access = requireAdministrator(await currentAccessSession());
    return getService().then((service) => service.createAdmin(access.userId, data.name));
  });

export const renameEfaInstitution = createServerFn({ method: "POST" })
  .validator((data: unknown) => institutionMutationSchema.parse(data))
  .handler(async ({ data }) => {
    const access = requireAdministrator(await currentAccessSession());
    return getService().then((service) => service.rename(access.userId, data));
  });

export const setEfaInstitutionActive = createServerFn({ method: "POST" })
  .validator((data: unknown) => institutionActiveSchema.parse(data))
  .handler(async ({ data }) => {
    const access = requireAdministrator(await currentAccessSession());
    return getService().then((service) => service.setActive(access.userId, data));
  });
