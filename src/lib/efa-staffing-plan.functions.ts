import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { currentAccessSession } from "./auth.functions";
import { requireAdministrator, requireEfa } from "./access";

const target = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("base"),
      baseId: z.string().uuid(),
      name: z.string().trim().min(1).max(120),
    })
    .strict(),
  z.object({ kind: z.literal("mobile"), name: z.string().trim().min(1).max(120) }).strict(),
]);
const role = z.enum(["nurse", "driver", "doctor"]);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const slot = z
  .object({
    role,
    start: time,
    end: time,
    endDayOffset: z.union([z.literal(0), z.literal(1)]),
    label: z.string().trim().max(40).nullable().default(null),
  })
  .strict();
const cycleSlot = slot.extend({ dayOffset: z.number().int().min(0).max(365) }).strict();
const operationId = z.string().uuid();
const planInput = z
  .object({
    target,
    effectiveFrom: date,
    cycleAnchor: date,
    cycleLengthDays: z.number().int().min(1).max(366),
    slots: z.array(cycleSlot).max(1000),
    clientOperationId: operationId,
  })
  .strict();
const exceptionInput = z
  .object({ target, date, slots: z.array(slot).max(1000), clientOperationId: operationId })
  .strict();
const previewInput = z.object({ target, from: date, to: date }).strict();
const getService = createServerOnlyFn(
  async () => (await import("./efa-staffing-plan.server.db")).efaStaffingPlanService,
);

export const listEfaStaffingPlan = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ target }).strict().parse(data))
  .handler(async ({ data }) => {
    const access = requireEfa(await currentAccessSession());
    return getService().then((service) => service.list(access.userId, data.target));
  });

export const saveEfaStaffingPlan = createServerFn({ method: "POST" })
  .validator((data: unknown) => planInput.parse(data))
  .handler(async ({ data }) => {
    const access = requireAdministrator(await currentAccessSession());
    return getService().then((service) => service.savePlan(access.userId, data));
  });

export const saveEfaStaffingPlanException = createServerFn({ method: "POST" })
  .validator((data: unknown) => exceptionInput.parse(data))
  .handler(async ({ data }) => {
    const access = requireAdministrator(await currentAccessSession());
    return getService().then((service) => service.saveException(access.userId, data));
  });

export const previewEfaStaffingPlan = createServerFn({ method: "GET" })
  .validator((data: unknown) => previewInput.parse(data))
  .handler(async ({ data }) => {
    const access = requireEfa(await currentAccessSession());
    return getService().then((service) => service.preview(access.userId, data));
  });
