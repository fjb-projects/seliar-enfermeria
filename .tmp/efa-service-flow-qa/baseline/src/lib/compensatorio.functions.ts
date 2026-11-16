import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MOBILE_CHOICES = [
  "Móvil 1",
  "Móvil 2",
  "Móvil 3",
  "Móvil 4",
  "Móvil 5",
  "Móvil 6",
  "Móvil 7",
  "Móvil 9",
  "Móvil 11",
  "Móvil 12",
  "Móvil 15",
  "Móvil 26",
  "Móvil Flotante",
  "Otro Movil no Nomenclado",
] as const;

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [yearText, monthText, dayText] = value.split("-");
  if (yearText === undefined || monthText === undefined || dayText === undefined) return false;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const dateSchema = z.string().refine(isValidIsoDate, "Invalid calendar date");
const hoursSchema = z
  .string()
  .trim()
  .regex(/^\d+(?:[.,]\d+)?$/, "Invalid hours")
  .refine((value) => {
    const hours = Number(value.replace(",", "."));
    return Number.isFinite(hours) && hours > 0;
  }, "Hours must be positive");

export const compensatoryRequestSchema = z.object({
  emailRequested: z.boolean(),
  requesterName: z.string().trim().min(1).max(120),
  requesterEmail: z.string().trim().email("Invalid requester email").max(255),
  requesterMobile: z.enum(MOBILE_CHOICES),
  compensatoryDate: dateSchema,
  hours: hoursSchema,
});

export type CompensatoryRequestPayload = z.infer<typeof compensatoryRequestSchema>;

export type CompensatorySubmissionResult =
  | { state: "submitted"; emailRequested: boolean; emailSent: boolean; emailError?: string }
  | { state: "not_configured" }
  | { state: "error"; message: string };

function summarizeExternalError(content: string): string {
  return content
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export const enviarSolicitudCompensatorio = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => compensatoryRequestSchema.parse(data))
  .handler(async ({ data }): Promise<CompensatorySubmissionResult> => {
    const url = process.env["GOOGLE_APPS_SCRIPT_COMPENSATORIO_URL"];
    const secret = process.env["GOOGLE_APPS_SCRIPT_COMPENSATORIO_SECRET"];

    if (!url || !secret) return { state: "not_configured" };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, request: data }),
        redirect: "follow",
      });
      const responseText = await response.text();

      if (!response.ok) {
        const details = summarizeExternalError(responseText);
        return {
          state: "error",
          message: `Apps Script responded ${response.status}${details ? `: ${details}` : ""}`,
        };
      }

      let body: { ok?: unknown; error?: unknown; emailSent?: unknown; emailError?: unknown };
      try {
        body = JSON.parse(responseText) as {
          ok?: unknown;
          error?: unknown;
          emailSent?: unknown;
          emailError?: unknown;
        };
      } catch {
        const details = summarizeExternalError(responseText);
        return {
          state: "error",
          message: details
            ? `Apps Script returned an invalid response: ${details}`
            : "Apps Script returned an empty response.",
        };
      }

      if (body.ok !== true) {
        return {
          state: "error",
          message:
            typeof body.error === "string" ? body.error : "Apps Script rejected the request.",
        };
      }

      return {
        state: "submitted",
        emailRequested: data.emailRequested,
        emailSent: data.emailRequested && body.emailSent === true,
        ...(data.emailRequested && typeof body.emailError === "string" && body.emailError
          ? { emailError: body.emailError }
          : {}),
      };
    } catch (error) {
      return {
        state: "error",
        message:
          error instanceof Error ? error.message : "Network error while sending the request.",
      };
    }
  });
