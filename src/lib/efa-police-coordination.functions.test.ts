import { describe, expect, it } from "vitest";
import {
  policeCoordinationAddEventSchema,
  policeCoordinationCreateSchema,
  policeCoordinationSetDispatchesSchema,
  policeCoordinationUpdateEventSchema,
} from "./efa-police-coordination.functions";

const coord = "11111111-1111-4111-8111-111111111111";
const op = "22222222-2222-4222-8222-222222222222";
const dispatch = "33333333-3333-4333-8333-333333333333";

describe("EFA police coordination inputs", () => {
  it("accepts a draft coordination with an optional same-episode dispatch association", () => {
    expect(
      policeCoordinationCreateSchema.safeParse({
        episodeId: coord,
        clientCreationKey: op,
        operationId: dispatch,
        initiator: "central",
        placeType: "incident",
        dispatchIds: [dispatch],
      }).success,
    ).toBe(true);
    expect(
      policeCoordinationCreateSchema.safeParse({
        episodeId: coord,
        clientCreationKey: op,
        operationId: dispatch,
        initiator: "unknown",
        placeType: "incident",
      }).success,
    ).toBe(false);
  });

  it("keeps missing time distinct from explicit observed time on shared and per-dispatch events", () => {
    const base = {
      coordinationId: coord,
      expectedVersion: 1,
      operationId: op,
      clientEventId: dispatch,
    };
    expect(
      policeCoordinationAddEventSchema.safeParse({ ...base, kind: "reiteration" }).success,
    ).toBe(true);
    expect(
      policeCoordinationAddEventSchema.safeParse({
        ...base,
        kind: "actual_meeting",
        dispatchId: dispatch,
        occurredAt: "2026-10-07T10:12:13.456Z",
        timeStatus: "observed",
      }).success,
    ).toBe(true);
    expect(
      policeCoordinationUpdateEventSchema.safeParse({
        coordinationId: coord,
        eventId: dispatch,
        expectedVersion: 1,
        expectedCoordinationVersion: 2,
        operationId: op,
        kind: "actual_meeting",
        dispatchId: dispatch,
        timeStatus: "not_observed",
      }).success,
    ).toBe(true);
  });

  it("bounds association requests and rejects duplicate dispatch selections at service boundary", () => {
    expect(
      policeCoordinationSetDispatchesSchema.safeParse({
        coordinationId: coord,
        expectedVersion: 1,
        operationId: op,
        dispatchIds: [dispatch],
      }).success,
    ).toBe(true);
    expect(
      policeCoordinationSetDispatchesSchema.safeParse({
        coordinationId: coord,
        expectedVersion: 1,
        operationId: op,
        dispatchIds: Array(51).fill(dispatch),
      }).success,
    ).toBe(false);
  });

  it("accepts partial event corrections while validating supplied timestamps", () => {
    expect(
      policeCoordinationUpdateEventSchema.safeParse({
        coordinationId: coord,
        eventId: dispatch,
        expectedVersion: 1,
        expectedCoordinationVersion: 2,
        operationId: op,
        kind: "waiting",
        note: "Corrected note",
      }).success,
    ).toBe(true);
    expect(
      policeCoordinationUpdateEventSchema.safeParse({
        coordinationId: coord,
        eventId: dispatch,
        expectedVersion: 1,
        expectedCoordinationVersion: 2,
        operationId: op,
        kind: "waiting",
        occurredAt: "not-a-time",
      }).success,
    ).toBe(false);
  });
});
