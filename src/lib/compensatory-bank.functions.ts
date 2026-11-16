import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { currentAccessSession } from "./auth.functions";
import { requireAdministrator } from "./access";

export type { LedgerView, StaffAuditView, StaffView } from "./compensatory-bank.server";

const id = z.string().uuid();
const date = z.iso.date();
const operationId = id;
const name = z.string().trim().min(1).max(160);
const reason = z.string().trim().min(1).max(1000);
const email = z
  .string()
  .trim()
  .max(320)
  .refine((value) => !value || z.email().safeParse(value).success)
  .optional();
const monthlyLimitMinutes = z.number().int().positive().max(2_147_483_647);
const directoryText = z
  .string()
  .trim()
  .max(300)
  .transform((value) => value || null)
  .nullable()
  .optional();

export const compensatoryBankSchemas = {
  list: z.object({}).strict(),
  history: z.object({ staffId: id }).strict(),
  create: z
    .object({
      dni: z.string().min(1).max(40),
      name,
      email,
      monthlyLimitMinutes: monthlyLimitMinutes.optional(),
      registrationNumber: directoryText,
      employmentStatus: directoryText,
      jobRole: directoryText,
      region: directoryText,
      contactPhone: directoryText,
      workplace: directoryText,
      operationalStatus: directoryText,
      operationalRole: directoryText,
      clientOperationId: operationId,
    })
    .strict(),
  update: z
    .object({
      staffId: id,
      name,
      email,
      isActive: z.boolean(),
      monthlyLimitMinutes,
      registrationNumber: directoryText,
      employmentStatus: directoryText,
      jobRole: directoryText,
      region: directoryText,
      contactPhone: directoryText,
      workplace: directoryText,
      operationalStatus: directoryText,
      operationalRole: directoryText,
      expectedVersion: z.number().int().positive(),
      reason,
      clientOperationId: operationId,
    })
    .strict(),
  movement: z
    .object({
      staffId: id,
      kind: z.enum(["opening", "credit", "debit"]),
      minutes: z.number().int().min(0).max(2_147_483_647),
      reason,
      effectiveDate: date,
      clientOperationId: operationId,
    })
    .strict()
    .superRefine((value, context) => {
      if (value.kind !== "opening" && value.minutes < 1) {
        context.addIssue({
          code: "custom",
          path: ["minutes"],
          message: "La cantidad de minutos debe ser positiva.",
        });
      }
    }),
  reversal: z
    .object({
      staffId: id,
      entryId: id,
      reason,
      effectiveDate: date,
      clientOperationId: operationId,
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

export const listCompensatoryStaff = createServerFn({ method: "GET" })
  .validator((data: unknown) => compensatoryBankSchemas.list.parse(data ?? {}))
  .handler(async () => (await getService()).listStaff(await adminId()));

export const getCompensatoryHistory = createServerFn({ method: "GET" })
  .validator((data: unknown) => compensatoryBankSchemas.history.parse(data))
  .handler(async ({ data }) => (await getService()).getHistory(await adminId(), data.staffId));

export const createCompensatoryStaff = createServerFn({ method: "POST" })
  .validator((data: unknown) => compensatoryBankSchemas.create.parse(data))
  .handler(async ({ data }) => (await getService()).createStaff(await adminId(), data));

export const updateCompensatoryStaff = createServerFn({ method: "POST" })
  .validator((data: unknown) => compensatoryBankSchemas.update.parse(data))
  .handler(async ({ data }) => (await getService()).updateStaff(await adminId(), data));

export const recordCompensatoryMovement = createServerFn({ method: "POST" })
  .validator((data: unknown) => compensatoryBankSchemas.movement.parse(data))
  .handler(async ({ data }) => (await getService()).recordMovement(await adminId(), data));

export const reverseCompensatoryMovement = createServerFn({ method: "POST" })
  .validator((data: unknown) => compensatoryBankSchemas.reversal.parse(data))
  .handler(async ({ data }) => (await getService()).reverseMovement(await adminId(), data));
