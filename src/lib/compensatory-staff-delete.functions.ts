import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { currentAccessSession } from "./auth.functions";
import { requireAdministrator } from "./access";

const id = z.string().uuid();
const reason = z
  .string()
  .max(1000)
  .refine((value) => value.trim().length > 0, "El motivo es obligatorio.");

export const compensatoryStaffDeleteSchema = z
  .object({
    staffId: id,
    expectedVersion: z.number().int().positive(),
    reason,
    clientOperationId: id,
  })
  .strict();

const getService = createServerOnlyFn(async () => {
  const { compensatoryStaffDelete } = await import("./compensatory-staff-delete.server.db");
  return compensatoryStaffDelete;
});

export const deleteCompensatoryStaff = createServerFn({ method: "POST" })
  .validator((data: unknown) => compensatoryStaffDeleteSchema.parse(data))
  .handler(async ({ data }) => {
    const actorUserId = requireAdministrator(await currentAccessSession()).userId;
    return (await getService()).deleteStaff(actorUserId, data);
  });
