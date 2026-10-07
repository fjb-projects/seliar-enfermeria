import { describe, expect, it } from "vitest";
import {
  communicationFormToPayloadTimes,
  communicationToFormTimes,
  captureCommunicationTime,
  loadCurrentConflictVersion,
  restoreCommunicationOperationForm,
} from "./efa-communications.client";
import type { CommunicationQueueEntry } from "./efa-communications.queue";

describe("EFA communication client timestamps", () => {
  it("preserves the original instant when another field is edited", () => {
    const original = "2026-10-06T09:30:12.345Z";
    const form = communicationToFormTimes({ startedAt: original, endedAt: null });
    expect(communicationFormToPayloadTimes(form, { startedAt: original, endedAt: null })).toEqual({
      startedAt: original,
      endedAt: null,
    });
  });

  it("converts a manually cleared optional time to null and keeps millisecond precision", () => {
    expect(
      communicationFormToPayloadTimes(
        { startedAt: "2026-10-06T06:30:12.345", endedAt: "" },
        { startedAt: null, endedAt: "2026-10-06T12:30:00.987Z" },
      ),
    ).toEqual({ startedAt: "2026-10-06T09:30:12.345Z", endedAt: null });
  });

  it("captures a quick time at invocation, not after unrelated asynchronous work", () => {
    const now = new Date("2026-10-06T12:30:12.345Z");
    expect(captureCommunicationTime(now)).toBe("2026-10-06T09:30:12.345");
  });
});

describe("EFA communication conflict refresh", () => {
  it("does not return a stale server version after the selected operation changes", async () => {
    let resolveRows!: (rows: Array<{ id: string }>) => void;
    let selected = true;
    const fetchRows = () =>
      new Promise<Array<{ id: string }>>((resolve) => {
        resolveRows = resolve;
      });
    const loading = loadCurrentConflictVersion(fetchRows, "call-a", () => selected);
    selected = false;
    resolveRows([{ id: "call-a" }]);
    await expect(loading).resolves.toEqual({ status: "cancelled" });
  });

  it("restores a paused finalize from the current call and preserves real times for the next edit", () => {
    const current = {
      direction: "outgoing" as const,
      priority: "yellow" as const,
      startedAt: "2026-10-06T12:30:12.345Z",
      endedAt: "2026-10-06T12:41:59.987Z",
    };
    const finalize = {
      ownerUserId: "owner-a",
      episodeId: "episode-a",
      operationId: "operation-finalize",
      kind: "finalize",
      payload: {
        communicationId: "call-a",
        expectedVersion: 4,
        operationId: "operation-finalize",
        priority: "red",
      },
      status: "paused-conflict",
      createdAt: "2026-10-06T12:45:00.000Z",
    } satisfies CommunicationQueueEntry;

    const restored = restoreCommunicationOperationForm(finalize, current);
    expect(restored).not.toBeNull();
    if (!restored) throw new Error("The current call is required to restore a finalize operation.");
    expect(restored).toMatchObject({ direction: "outgoing", priority: "red" });
    expect(
      communicationFormToPayloadTimes(restored.times, {
        startedAt: current.startedAt,
        endedAt: current.endedAt,
      }),
    ).toEqual({ startedAt: current.startedAt, endedAt: current.endedAt });
  });
});
