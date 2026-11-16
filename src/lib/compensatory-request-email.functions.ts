import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { currentAccessSession } from "./auth.functions";
import { requireAdministrator } from "./access";

const id = z.string().uuid();
export const addCompensatoryRequestEmailSchema = z.object({
  requestId: id,
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(1).max(1000),
  clientOperationId: id,
}).strict();
const getService = createServerOnlyFn(async () => {
  const { compensatoryRequestEmail } = await import("./compensatory-request-email.server.db");
  return compensatoryRequestEmail;
});
export const addCompensatoryRequestEmailToProfile = createServerFn({ method: "POST" })
  .validator((data: unknown) => addCompensatoryRequestEmailSchema.parse(data))
  .handler(async ({ data }) => {
    const actorId = requireAdministrator(await currentAccessSession()).userId;
    return (await getService()).addRequestEmailToProfile(actorId, data);
  });
