import { describe, expect, it } from "vitest";
import {
  communicationCreateSchema,
  communicationFinalizeSchema,
  communicationUpdateSchema,
} from "./efa-communications.functions";

const communicationId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const createInput = {
  clientCreationKey: communicationId,
  episodeId: "33333333-3333-4333-8333-333333333333",
  direction: "incoming" as const,
};

describe("EFA phone communication function inputs", () => {
  it("allows missing actual times without coercing or inventing timestamps", () => {
    expect(communicationCreateSchema.safeParse(createInput).success).toBe(true);
    expect(
      communicationCreateSchema.safeParse({
        ...createInput,
        startedAt: "2026-10-06T09:30:12.345Z",
        endedAt: null,
      }).success,
    ).toBe(true);
    expect(
      communicationCreateSchema.safeParse({ ...createInput, startedAt: "not-a-time" }).success,
    ).toBe(false);
    expect(
      communicationCreateSchema.safeParse({ ...createInput, callerName: "Invented" }).success,
    ).toBe(false);
  });

  it("validates optimistic edits and requires an allowed priority to finalize", () => {
    const updateInput = {
      communicationId,
      expectedVersion: 1,
      operationId,
      direction: "outgoing",
      startedAt: null,
      endedAt: null,
      priority: null,
    };
    expect(communicationUpdateSchema.safeParse(updateInput).success).toBe(true);
    expect(
      communicationUpdateSchema.safeParse({ ...updateInput, expectedVersion: 0 }).success,
    ).toBe(false);
    expect(
      communicationFinalizeSchema.safeParse({ communicationId, expectedVersion: 1, operationId })
        .success,
    ).toBe(false);
    expect(
      communicationFinalizeSchema.safeParse({
        communicationId,
        expectedVersion: 1,
        operationId,
        priority: "yellow",
      }).success,
    ).toBe(true);
    expect(
      communicationFinalizeSchema.safeParse({
        communicationId,
        expectedVersion: 1,
        operationId,
        priority: "not-observed",
      }).success,
    ).toBe(false);
  });
});
