import { describe, expect, it } from "vitest";
import {
  dispatchCreateSchema,
  dispatchFinalizeSchema,
  dispatchLifecycleSchema,
  dispatchUpdateSchema,
  supportRequestCreateSchema,
} from "./efa-dispatches.functions";

const dispatchId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const institutionId = "55555555-5555-4555-8555-555555555555";
const validCreate = {
  clientCreationKey: dispatchId,
  episodeId: "33333333-3333-4333-8333-333333333333",
  baseId: "44444444-4444-4444-8444-444444444444",
};

describe("EFA dispatch function inputs", () => {
  it("validates lifecycle operation IDs and positive expected versions", () => {
    const base = { dispatchId, expectedVersion: 2, operationId };
    expect(dispatchLifecycleSchema.safeParse(base).success).toBe(true);
    expect(dispatchLifecycleSchema.safeParse({ ...base, expectedVersion: 0 }).success).toBe(false);
    expect(dispatchLifecycleSchema.safeParse({ ...base, operationId: "not-a-uuid" }).success).toBe(
      false,
    );
    expect(dispatchLifecycleSchema.safeParse({ ...base, extra: true }).success).toBe(false);
  });

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

  it("accepts only nullable UUID institution references on dispatch edits", () => {
    expect(dispatchCreateSchema.safeParse({ ...validCreate, institutionId }).success).toBe(true);
    expect(dispatchCreateSchema.safeParse({ ...validCreate, institutionId: null }).success).toBe(
      true,
    );
    expect(
      dispatchCreateSchema.safeParse({ ...validCreate, institutionId: "Hospital" }).success,
    ).toBe(false);
    expect(
      dispatchUpdateSchema.safeParse({
        dispatchId,
        expectedVersion: 1,
        operationId,
        baseId: validCreate.baseId,
        institutionId,
      }).success,
    ).toBe(true);
  });

  it("restricts the optional anonymous first-response role to its approved values", () => {
    const values = ["driver", "nurse", "doctor", "other", "not_observed"];
    for (const firstResponseRole of values)
      expect(dispatchCreateSchema.safeParse({ ...validCreate, firstResponseRole }).success).toBe(
        true,
      );
    expect(
      dispatchCreateSchema.safeParse({ ...validCreate, firstResponseRole: null }).success,
    ).toBe(true);
    expect(
      dispatchCreateSchema.safeParse({ ...validCreate, firstResponseRole: "Named operator" })
        .success,
    ).toBe(false);
    expect(
      dispatchUpdateSchema.safeParse({
        dispatchId,
        expectedVersion: 1,
        operationId,
        baseId: validCreate.baseId,
        firstResponseRole: "Named operator",
      }).success,
    ).toBe(false);
    expect(
      dispatchUpdateSchema.safeParse({
        dispatchId,
        expectedVersion: 1,
        operationId,
        baseId: validCreate.baseId,
      }).success,
    ).toBe(true);
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
