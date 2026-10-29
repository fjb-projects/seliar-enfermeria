import { describe, expect, it } from "vitest";
import {
  runCompensatorySettlementPass,
  watchCompensatorySettlements,
} from "./compensatory-settlements.server";

describe("compensatory settlement runner", () => {
  it("runs one pass and propagates failures for a nonzero CLI exit", async () => {
    await expect(
      runCompensatorySettlementPass({ processDue: async () => ({ consumed: 2 }) }),
    ).resolves.toEqual({ consumed: 2 });
    const failure = new Error("database unavailable");
    await expect(
      runCompensatorySettlementPass({
        processDue: async () => {
          throw failure;
        },
      }),
    ).rejects.toBe(failure);
  });

  it("aligns watch passes to the next minute and propagates failed passes", async () => {
    const failure = new Error("stop after first pass");
    let calls = 0;
    let wait = 0;
    await expect(
      watchCompensatorySettlements(
        {
          processDue: async () => {
            calls++;
            throw failure;
          },
        },
        {
          clock: {
            now: () => new Date("2026-10-27T14:00:15.250Z"),
            sleep: async (milliseconds) => {
              wait = milliseconds;
            },
          },
        },
      ),
    ).rejects.toBe(failure);
    expect(calls).toBe(1);
    expect(wait).toBe(0);

    const abort = new AbortController();
    let successfulCalls = 0;
    await watchCompensatorySettlements(
      {
        processDue: async () => {
          successfulCalls++;
          return { consumed: 0 };
        },
      },
      {
        signal: abort.signal,
        clock: {
          now: () => new Date("2026-10-27T14:00:15.250Z"),
          sleep: async (milliseconds) => {
            wait = milliseconds;
            abort.abort();
          },
        },
      },
    ).catch(() => undefined);
    expect(successfulCalls).toBe(1);
    expect(wait).toBe(44_775);
  });
});
