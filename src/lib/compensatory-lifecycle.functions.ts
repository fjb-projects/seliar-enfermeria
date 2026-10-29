import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { currentAccessSession } from "./auth.functions";
import { requireAdministrator } from "./access";

const id = z.string().uuid();
const reason = z.string().trim().min(1).max(1000);
const operationId = id;
export const compensatoryLifecycleSchemas = {
  workspace: z.object({ staffId: id.optional() }).strict(),
  classify: z
    .object({
      requestId: id,
      expectedVersion: z.number().int().positive(),
      requestedDate: z.iso.date(),
      minutes: z.number().int().positive().max(2_147_483_647),
      reason,
      clientOperationId: operationId,
    })
    .strict(),
  decide: z
    .object({
      requestId: id,
      expectedVersion: z.number().int().positive(),
      decision: z.enum(["approve", "reject"]),
      reason,
      clientOperationId: operationId,
    })
    .strict(),
  cancel: z
    .object({
      requestId: id,
      expectedVersion: z.number().int().positive(),
      reason,
      clientOperationId: operationId,
    })
    .strict(),
};

const getService = createServerOnlyFn(async () => {
  const { compensatoryLifecycle } = await import("./compensatory-lifecycle.server.db");
  return compensatoryLifecycle;
});
async function adminId() {
  return requireAdministrator(await currentAccessSession()).userId;
}

export const getCompensatoryOperationalWorkspace = createServerFn({ method: "GET" })
  .validator((data: unknown) => compensatoryLifecycleSchemas.workspace.parse(data ?? {}))
  .handler(async ({ data }) => (await getService()).getWorkspace(await adminId(), data.staffId));

export const classifyCompensatoryRequest = createServerFn({ method: "POST" })
  .validator((data: unknown) => compensatoryLifecycleSchemas.classify.parse(data))
  .handler(async ({ data }) => (await getService()).classify(await adminId(), data));

export const decideCompensatoryRequest = createServerFn({ method: "POST" })
  .validator((data: unknown) => compensatoryLifecycleSchemas.decide.parse(data))
  .handler(async ({ data }) => (await getService()).decide(await adminId(), data));

export const cancelCompensatoryRequest = createServerFn({ method: "POST" })
  .validator((data: unknown) => compensatoryLifecycleSchemas.cancel.parse(data))
  .handler(async ({ data }) => (await getService()).cancel(await adminId(), data));
