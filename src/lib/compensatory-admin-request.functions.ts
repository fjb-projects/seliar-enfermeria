import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { currentAccessSession } from "./auth.functions";
import { requireAdministrator } from "./access";

export const administrativeCompensatoryRequestSchema = z
  .object({
    clientOperationId: z.string().uuid(),
    staffId: z.string().uuid(),
    requesterEmail: z.string().trim().email().max(255),
    requesterMobile: z.string().trim().min(1).max(300),
    compensatoryDate: z.iso.date(),
    hours: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^\d+(?::[0-5]\d|(?:[.,]\d+))?$/),
    reason: z.string().trim().min(1).max(1000),
    confirmDuplicate: z.boolean().optional(),
  })
  .strict();

export const createAdministrativeCompensatoryRequest = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => administrativeCompensatoryRequestSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = requireAdministrator(await currentAccessSession());
    const { administrativeCompensatoryRequests } =
      await import("./compensatory-admin-request.server.db");
    return administrativeCompensatoryRequests.createAdministrativeCompensatoryRequest(
      actor.userId,
      data,
    );
  });
