import { describe, expect, it } from "vitest";
import { observationCreateSchema, observationUpdateSchema } from "./efa-observations.functions";

const id = "11111111-1111-4111-8111-111111111111";
const base = {
  guardId: id,
  contextType: "guard" as const,
  clientCreationKey: id,
  operationId: id,
  catalogItemKey: "phone.early_location",
  classification: "adequate" as const,
};

describe("EFA observation server inputs", () => {
  it("accepts nullable actual observations and rejects ambiguous or incomplete typed contexts", () => {
    expect(
      observationCreateSchema.safeParse({ ...base, observedAt: "2026-10-07T10:11:12.345Z" })
        .success,
    ).toBe(true);
    expect(observationCreateSchema.safeParse({ ...base, observedAt: null }).success).toBe(true);
    expect(
      observationCreateSchema.safeParse({ ...base, observedAt: "2026-10-07 10:11" }).success,
    ).toBe(false);
    expect(
      observationCreateSchema.safeParse({ ...base, contextType: "episode", episodeId: id }).success,
    ).toBe(true);
    expect(observationCreateSchema.safeParse({ ...base, episodeId: id }).success).toBe(false);
    expect(
      observationCreateSchema.safeParse({ ...base, contextType: "communication", episodeId: id })
        .success,
    ).toBe(false);
  });

  it("preserves omitted correction fields as distinct from explicit nulls", () => {
    const identity = { observationId: id, expectedVersion: 1, operationId: id };
    expect(observationUpdateSchema.safeParse(identity).success).toBe(true);
    expect(
      observationUpdateSchema.safeParse({ ...identity, observedAt: null, comment: null }).success,
    ).toBe(true);
    expect(observationUpdateSchema.safeParse({ ...identity, observedAt: "invalid" }).success).toBe(
      false,
    );
    expect(
      observationUpdateSchema.safeParse({ ...identity, classification: "absent" }).success,
    ).toBe(false);
  });
});
