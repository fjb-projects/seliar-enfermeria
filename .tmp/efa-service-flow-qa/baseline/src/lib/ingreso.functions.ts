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

const locationTimestampSchema = z.string().datetime({ offset: true });

export const checkInSchema = z.object({
  emailRequested: z.boolean(),
  fullName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  mobile: z.enum(MOBILE_CHOICES),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracyMeters: z.number().finite().positive().max(100_000),
  capturedAt: locationTimestampSchema,
});

export type CheckInPayload = z.infer<typeof checkInSchema>;

export type CheckInSubmissionResult =
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

export const enviarRegistroIngreso = createServerFn({ method: "POST" })
  .validator((data: unknown) => checkInSchema.parse(data))
  .handler(async ({ data }): Promise<CheckInSubmissionResult> => {
    const url = process.env["GOOGLE_APPS_SCRIPT_INGRESO_URL"];
    const secret = process.env["GOOGLE_APPS_SCRIPT_INGRESO_SECRET"];

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
            typeof body.error === "string" ? body.error : "Apps Script rejected the check-in.",
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
          error instanceof Error ? error.message : "Network error while registering check-in.",
      };
    }
  });
