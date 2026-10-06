import { describe, expect, it } from "vitest";
import {
  episodeCreateSchema,
  episodeIdSchema,
  episodeUpdateSchema,
} from "./efa-episodes.functions";

const episodeId = "11111111-1111-4111-8111-111111111111";
const validCreate = {
  clientCreationKey: episodeId,
  guardId: "22222222-2222-4222-8222-222222222222",
  eventAt: "2026-10-06T09:30:00.000Z",
  motive: " traslado ",
  address: " Calle 12 ",
  interventionNumber: "00012",
};

describe("EFA episode server function inputs", () => {
  it("accepts bounded event data without coercing intervention numbers", () => {
    expect(episodeCreateSchema.safeParse(validCreate).success).toBe(true);
    expect(
      episodeCreateSchema.safeParse({ ...validCreate, unexpectedOwner: "other" }).success,
    ).toBe(false);
    expect(episodeCreateSchema.safeParse({ ...validCreate, eventAt: "tomorrow" }).success).toBe(
      false,
    );
    expect(
      episodeCreateSchema.safeParse({ ...validCreate, address: "x".repeat(1001) }).success,
    ).toBe(false);
    expect(
      episodeCreateSchema.safeParse({ ...validCreate, interventionNumber: "00012" }).data,
    ).toMatchObject({
      interventionNumber: "00012",
    });
  });

  it("requires stable UUIDs and an expected version for updates", () => {
    const input = {
      episodeId,
      expectedVersion: 1,
      operationId: "33333333-3333-4333-8333-333333333333",
      eventAt: validCreate.eventAt,
      motive: null,
      address: null,
      interventionNumber: null,
    };
    expect(episodeIdSchema.safeParse(episodeId).success).toBe(true);
    expect(episodeUpdateSchema.safeParse(input).success).toBe(true);
    expect(episodeUpdateSchema.safeParse({ ...input, expectedVersion: 0 }).success).toBe(false);
    expect(episodeUpdateSchema.safeParse({ ...input, actorUserId: "attacker" }).success).toBe(
      false,
    );
  });
});
