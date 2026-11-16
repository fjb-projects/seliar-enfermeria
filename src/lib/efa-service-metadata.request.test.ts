import { describe, expect, it } from "vitest";
import { communicationEpisodeIdSchema } from "./efa-communications.functions";
import { dispatchEpisodeIdSchema } from "./efa-dispatches.functions";
import { selectorListRequest } from "./efa-service-metadata";

const episodeId = "33333333-3333-4333-8333-333333333333";

describe("selector list requests", () => {
  it("send the episode id exactly as the call and dispatch list validators expect it", () => {
    const { data } = selectorListRequest(episodeId);
    expect(communicationEpisodeIdSchema.safeParse(data).success).toBe(true);
    expect(dispatchEpisodeIdSchema.safeParse(data).success).toBe(true);
  });

  it("would be rejected if wrapped in an object (the shape that left every service without metadata)", () => {
    expect(communicationEpisodeIdSchema.safeParse({ episodeId }).success).toBe(false);
    expect(dispatchEpisodeIdSchema.safeParse({ episodeId }).success).toBe(false);
  });
});
