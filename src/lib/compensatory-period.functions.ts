import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { currentAccessSession } from "./auth.functions";
import { requireAdministrator } from "./access";
import type { CompensatoryPeriod } from "./compensatory-bank.server";

export type { CompensatoryPeriod };

const id = z.string().uuid();
const reason = z.string().trim().min(1).max(1000);
const year = z.number().int().min(2000).max(9999);
const minutes = z.number().int().min(0).max(2_147_483_647);

export const compensatoryPeriodSchemas = {
  list: z.object({ staffId: id, year }).strict(),
  record: z
    .object({
      operationId: id,
      staffId: id,
      year,
      month: z.number().int().min(1).max(12).nullable(),
      generatedMinutes: minutes.nullable(),
      externalTakenMinutes: minutes.nullable(),
      annualNetMinutes: minutes.nullable(),
      reason,
    })
    .strict()
    .superRefine((value, context) => {
      const annual = value.month === null;
      if (
        annual &&
        (value.generatedMinutes !== null ||
          value.externalTakenMinutes !== null ||
          value.annualNetMinutes === null ||
          ![2024, 2025].includes(value.year))
      ) {
        context.addIssue({
          code: "custom",
          path: ["annualNetMinutes"],
          message: "Annual periods require a net amount without monthly breakdown and allow only 2024 or 2025.",
        });
      }
      if (
        !annual &&
        (value.generatedMinutes === null ||
          value.externalTakenMinutes === null ||
          value.annualNetMinutes !== null)
      ) {
        context.addIssue({
          code: "custom",
          path: ["generatedMinutes"],
          message: "Monthly periods require generated and external amounts without an annual net amount.",
        });
      }
    }),
  reverse: z
    .object({
      operationId: id,
      staffId: id,
      periodId: id,
      reason,
    })
    .strict(),
};

const getService = createServerOnlyFn(async () => {
  const { compensatoryBank } = await import("./compensatory-bank.server.db");
  return compensatoryBank;
});

async function adminId() {
  return requireAdministrator(await currentAccessSession()).userId;
}

export const listCompensatoryPeriods = createServerFn({ method: "GET" })
  .validator((data: unknown) => compensatoryPeriodSchemas.list.parse(data))
  .handler(async ({ data }) =>
    (await getService()).listCompensatoryPeriods(await adminId(), data),
  );

export const recordCompensatoryPeriod = createServerFn({ method: "POST" })
  .validator((data: unknown) => compensatoryPeriodSchemas.record.parse(data))
  .handler(async ({ data }) =>
    (await getService()).recordCompensatoryPeriod(await adminId(), data),
  );

export const reverseCompensatoryPeriod = createServerFn({ method: "POST" })
  .validator((data: unknown) => compensatoryPeriodSchemas.reverse.parse(data))
  .handler(async ({ data }) =>
    (await getService()).reverseCompensatoryPeriod(await adminId(), data),
  );
