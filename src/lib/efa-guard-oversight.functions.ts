import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { currentAccessSession } from "./auth.functions";
import { requireAdministrator } from "./access";

export type {
  EfaGuardOwner,
  EfaGuardServiceTotals,
  EfaOversightDispatchRecord,
  EfaOversightEpisodeView,
  EfaOversightGuardView,
} from "./efa-guard-oversight.server";

export const guardServicesSchema = z.object({ guardId: z.string().uuid() }).strict();

const getService = createServerOnlyFn(async () => {
  const { efaGuardOversight } = await import("./efa-guard-oversight.server");
  return efaGuardOversight;
});

export const listEfaGuardOversight = createServerFn({ method: "GET" }).handler(async () => {
  const access = requireAdministrator(await currentAccessSession());
  return getService().then((service) => service.listGuards(access.userId));
});

export const listEfaGuardServices = createServerFn({ method: "GET" })
  .validator((data: unknown) => guardServicesSchema.parse(data))
  .handler(async ({ data }) => {
    const access = requireAdministrator(await currentAccessSession());
    return getService().then((service) => service.listGuardServices(access.userId, data.guardId));
  });
