import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { currentAccessSession } from "./auth.functions";
import { requireAdministrator } from "./access";

const id = z.string().uuid();
const sourceString = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => value.trim().length > 0, "El valor es obligatorio.");

export const compensatoryRequestSchemas = {
  list: z.object({ staffId: id.optional() }).strict(),
  insert: z
    .object({
      clientOperationId: id,
      staffId: id,
      submittedAt: sourceString(500),
      requesterName: sourceString(300),
      requesterMobile: sourceString(300),
      compensatoryDate: sourceString(300),
      hours: sourceString(100),
      confirmDuplicate: z.boolean().optional(),
    })
    .strict(),
};

const getService = createServerOnlyFn(async () => {
  const { compensatoryRequests } = await import("./compensatory-requests.server.db");
  return compensatoryRequests;
});

async function adminId() {
  return requireAdministrator(await currentAccessSession()).userId;
}

export const listCompensatoryRequests = createServerFn({ method: "GET" })
  .validator((data: unknown) => compensatoryRequestSchemas.list.parse(data ?? {}))
  .handler(async ({ data }) => (await getService()).listRequests(await adminId(), data.staffId));

export const insertCompensatoryRequest = createServerFn({ method: "POST" })
  .validator((data: unknown) => compensatoryRequestSchemas.insert.parse(data))
  .handler(async ({ data }) => (await getService()).insertRequests(await adminId(), data));
