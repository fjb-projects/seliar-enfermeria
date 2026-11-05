import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { currentAccessSession } from "./auth.functions";
import { requireActiveSession } from "./access";

const getService = createServerOnlyFn(async () => {
  const { efaPanel } = await import("./efa-panel.server");
  return efaPanel;
});

export function getEfaPanelAccess(roles: readonly string[]) {
  const isAdmin = roles.includes("admin");
  return { canWrite: isAdmin || roles.includes("efa"), isAdmin };
}

export const getEfaPanelSummary = createServerFn({ method: "GET" }).handler(async () => {
  const access = requireActiveSession(await currentAccessSession());
  return getService().then((service) => service.summary(access.userId));
});
