import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const scheduleResponseSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("available"), fileName: z.string(), viewerUrl: z.string().url() }),
  z.object({ state: z.literal("empty") }),
  z.object({ state: z.literal("multiple") }),
  z.object({ state: z.literal("invalid_file") }),
  z.object({ state: z.literal("error") }),
]);

export type PublishedScheduleResult =
  | { state: "available"; fileName: string; viewerUrl: string }
  | { state: "empty" | "multiple" | "invalid_file" | "not_configured" | "error" };

export const getPublishedSchedule = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublishedScheduleResult> => {
    const url = process.env["GOOGLE_APPS_SCRIPT_SCHEDULE_URL"];
    const secret = process.env["GOOGLE_APPS_SCRIPT_SCHEDULE_SECRET"];

    if (!url || !secret) return { state: "not_configured" };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
        redirect: "follow",
      });

      if (!response.ok) return { state: "error" };

      const parsed = scheduleResponseSchema.safeParse(await response.json());
      if (!parsed.success) return { state: "error" };

      return parsed.data;
    } catch {
      return { state: "error" };
    }
  },
);
