import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { currentAccessSession } from "./auth.functions";
import { requireAdministrator, type AccountRole } from "./access";
import { accounts } from "./accounts.server";

const userId = z.string().min(1).max(128);
const expectedVersion = z.number().int().positive();
const roles = z.array(z.enum(["efa", "admin"])).max(2);
const credentialPassword = z.string().min(12).max(128);
export const accountMutationSchema = z.object({ userId, expectedVersion, roles }).strict();
const activeSchema = z.object({ userId, expectedVersion, isActive: z.boolean() }).strict();
export const resetSchema = z
  .object({ userId, expectedVersion, password: credentialPassword })
  .strict();
const createSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(255),
    password: credentialPassword,
    roles,
  })
  .strict();

async function actor() {
  const current = requireAdministrator(await currentAccessSession());
  return { userId: current.userId, isActive: current.isActive, roles: current.roles };
}

export const createAccount = createServerFn({ method: "POST" })
  .validator((data: unknown) => createSchema.parse(data))
  .handler(async ({ data }) => accounts.create(await actor(), data));
export const listAccounts = createServerFn({ method: "GET" }).handler(async () =>
  accounts.list(await actor()),
);
export const setAccountRoles = createServerFn({ method: "POST" })
  .validator((data: unknown) => accountMutationSchema.parse(data))
  .handler(async ({ data }) =>
    accounts.setRoles(await actor(), { ...data, roles: data.roles as AccountRole[] }),
  );
export const setAccountActive = createServerFn({ method: "POST" })
  .validator((data: unknown) => activeSchema.parse(data))
  .handler(async ({ data }) => accounts.setActive(await actor(), data));
export const resetAccountPassword = createServerFn({ method: "POST" })
  .validator((data: unknown) => resetSchema.parse(data))
  .handler(async ({ data }) => accounts.resetPassword(await actor(), data));
