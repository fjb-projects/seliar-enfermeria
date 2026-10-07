import { describe, expect, it } from "vitest";
import {
  dispatchCreateSchema,
  dispatchFinalizeSchema,
  dispatchUpdateSchema,
  supportRequestCreateSchema,
} from "./efa-dispatches.functions";

const dispatchId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const validCreate = {
  clientCreationKey: dispatchId,
  episodeId: "33333333-3333-4333-8333-333333333333",
  baseId: "44444444-4444-4444-8444-444444444444",
};

describe("EFA dispatch function inputs", () => {
  it("accepts nullable real times without coercing observation states to zero", () => {
    expect(dispatchCreateSchema.safeParse(validCreate).success).toBe(true);
    expect(
      dispatchCreateSchema.safeParse({
        ...validCreate,
        t0At: "2026-10-06T12:30:12.345Z",
        t0Status: "observed",
      }).success,
    ).toBe(true);
    expect(dispatchCreateSchema.safeParse({ ...validCreate, t0At: "bad" }).success).toBe(false);
  });

  it("requires priority and a named result for finalization", () => {
    const base = { dispatchId, expectedVersion: 1, operationId };
    expect(dispatchFinalizeSchema.safeParse(base).success).toBe(false);
    expect(
      dispatchFinalizeSchema.safeParse({
        ...base,
        priority: "red",
        result: "transported",
      }).success,
    ).toBe(true);
  });

  it("validates support request identity and same-episode response references", () => {
    expect(
      supportRequestCreateSchema.safeParse({
        clientCreationKey: dispatchId,
        sourceDispatchId: dispatchId,
        requestedAt: "2026-10-06T12:00:00.000Z",
        reason: "Necesita refuerzo",
        responseDispatchId: null,
      }).success,
    ).toBe(true);
    expect(
      dispatchUpdateSchema.safeParse({
        dispatchId,
        expectedVersion: 1,
        operationId,
        baseId: validCreate.baseId,
        priority: null,
      }).success,
    ).toBe(true);
    const partial = dispatchUpdateSchema.parse({
      dispatchId,
      expectedVersion: 1,
      operationId,
      baseId: validCreate.baseId,
      note: "Corregir nota",
    });
    expect(partial).not.toHaveProperty("t0Status");
  });
});
