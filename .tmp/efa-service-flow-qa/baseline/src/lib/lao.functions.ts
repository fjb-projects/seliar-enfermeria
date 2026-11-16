import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

function isValidMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

const dateSchema = z.string().refine(isValidIsoDate, "Invalid calendar date");
const monthSchema = z.string().refine(isValidMonth, "Invalid start month");

export const laoRequestSchema = z
  .object({
    emailRequested: z.boolean(),
    requesterName: z.string().trim().min(1).max(120),
    requesterEmail: z.string().trim().email("Invalid requester email").max(255),
    startMonth: monthSchema,
    startDate: dateSchema,
    endDate: dateSchema,
  })
  .refine((request) => request.startDate <= request.endDate, "Start date cannot be after end date");

export type LaoRequestPayload = z.infer<typeof laoRequestSchema>;

export type LaoSubmissionResult =
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

export const enviarSolicitudLao = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => laoRequestSchema.parse(data))
  .handler(async ({ data }): Promise<LaoSubmissionResult> => {
    const url = process.env["GOOGLE_APPS_SCRIPT_LAO_URL"];
    const secret = process.env["GOOGLE_APPS_SCRIPT_LAO_SECRET"];

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
