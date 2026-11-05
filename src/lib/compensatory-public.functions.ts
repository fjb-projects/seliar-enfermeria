import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const publicCompensatoryRequestSchema = z.object({
  clientOperationId: z.string().uuid(),
  staffId: z.string().uuid(),
  requesterEmail: z.string().trim().max(255).default(""),
  requesterMobile: z.string().trim().min(1).max(300),
  compensatoryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.string().trim().min(1).max(100).regex(/^\d+(?:[.,]\d+)?$/),
});

async function getPublicService() {
  const { publicCompensatoryRequests } = await import("./compensatory-public.server.db");
  return publicCompensatoryRequests;
}

export const listPublicCompensatoryAgents = createServerFn({ method: "GET" }).handler(async () => {
  return (await getPublicService()).listPublicCompensatoryAgents();
});

export const submitPublicCompensatoryRequest = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => publicCompensatoryRequestSchema.parse(data))
  .handler(async ({ data }) => {
    return (await getPublicService()).submitPublicCompensatoryRequest(data);
  });
