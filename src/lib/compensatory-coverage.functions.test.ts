import { describe, expect, it } from "vitest";
import { compensatoryCoverageSchemas } from "./compensatory-coverage.functions";

const requestId = "10000000-0000-4000-8000-000000000001";
const staffId = "10000000-0000-4000-8000-000000000002";

describe("compensatory coverage server function contract", () => {
  it("accepts a strict save payload while keeping staff names server-derived", () => {
    const input = {
      requestId,
      clientOperationId: "10000000-0000-4000-8000-000000000003",
      expectedVersion: 0,
      plannedStart: "2025-01-01T08:00-03:00",
      plannedEnd: "2025-01-01T12:00-03:00",
      assignments: [{ staffId, start: "2025-01-01T08:00-03:00", end: "2025-01-01T12:00-03:00", confirmed: false, verificationMethod: null }],
      reason: "Manual coordination",
    };
    expect(compensatoryCoverageSchemas.save.parse(input)).toEqual(input);
    expect(compensatoryCoverageSchemas.save.safeParse({ ...input, assignments: [{ ...input.assignments[0], staffName: "Client provided name" }] }).success).toBe(false);
    expect(compensatoryCoverageSchemas.get.parse({ requestId })).toEqual({ requestId });
  });
});
