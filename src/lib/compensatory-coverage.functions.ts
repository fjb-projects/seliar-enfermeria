import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { currentAccessSession } from "./auth.functions";
import { requireAdministrator } from "./access";

const id = z.string().uuid();
const reason = z.string().trim().min(1).max(1000);
const minuteTimestamp = z.string().min(17).max(40);
const baseAssignment = z.object({
  staffId: id,
  start: minuteTimestamp,
  end: minuteTimestamp,
  confirmed: z.boolean(),
  verificationMethod: z.string().trim().max(500).nullable(),
}).strict();

export const compensatoryCoverageSchemas = {
  get: z.object({ requestId: id }).strict(),
  save: z.object({
    requestId: id,
    clientOperationId: id,
    expectedVersion: z.number().int().nonnegative(),
    plannedStart: minuteTimestamp,
    plannedEnd: minuteTimestamp,
    assignments: z.array(baseAssignment).max(100),
    reason,
  }).strict(),
};

const getService = createServerOnlyFn(async () => {
  const { compensatoryCoverageService } = await import("./compensatory-coverage.server.db");
  return compensatoryCoverageService;
});
async function adminId() {
  return requireAdministrator(await currentAccessSession()).userId;
}

export const getCompensatoryCoverage = createServerFn({ method: "GET" })
  .validator((data: unknown) => compensatoryCoverageSchemas.get.parse(data))
  .handler(async ({ data }) => (await getService()).getCompensatoryCoverage(await adminId(), data.requestId));

export const saveCompensatoryCoverage = createServerFn({ method: "POST" })
  .validator((data: unknown) => compensatoryCoverageSchemas.save.parse(data))
  .handler(async ({ data }) => (await getService()).saveCompensatoryCoverage(await adminId(), data));
