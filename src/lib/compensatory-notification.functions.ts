import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { currentAccessSession } from "./auth.functions";
import { requireAdministrator } from "./access";

const uuid = z.string().uuid();
export const compensatoryNotificationSchemas = {
  list: z.object({ requestId: uuid }).strict(),
  reviewAndSend: z.object({
    notificationId: uuid,
    recipient: z.string().trim().min(3).max(320).email(),
    confirmed: z.literal(true),
    clientOperationId: uuid,
  }).strict(),
};
const getService = createServerOnlyFn(async () => import("./compensatory-notification.server.db"));
async function adminId() {
  return requireAdministrator(await currentAccessSession()).userId;
}

export const listCompensatoryNotifications = createServerFn({ method: "GET" })
  .validator((data: unknown) => compensatoryNotificationSchemas.list.parse(data))
  .handler(async ({ data }) => (await getService()).compensatoryNotification
    .listCompensatoryNotifications(await adminId(), data.requestId));

export const reviewAndSendCompensatoryNotification = createServerFn({ method: "POST" })
  .validator((data: unknown) => compensatoryNotificationSchemas.reviewAndSend.parse(data))
  .handler(async ({ data }) => {
    const actorId = await adminId();
    const server = await getService();
    return server.compensatoryNotification.reviewAndSendCompensatoryNotification(actorId, data, {
      configuration: server.dispatchConfiguration(),
      send: server.sendReviewedCompensatoryEmail,
    });
  });
