import { beforeEach, describe, expect, it, vi } from "vitest";

type Effect = { setup: () => void | (() => void); cleanup?: void | (() => void) };
const hooks = vi.hoisted(() => ({
  slots: [] as unknown[],
  effects: [] as Effect[],
  pending: [] as Effect[],
  index: 0,
}));
// Node-only lifecycle harness, not a DOM or browser simulation.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const index = hooks.index++;
    if (!(index in hooks.slots))
      hooks.slots[index] = typeof initial === "function" ? initial() : initial;
    return [
      hooks.slots[index],
      (value: unknown) => {
        hooks.slots[index] = value;
      },
    ];
  },
  useRef(initial: unknown) {
    const index = hooks.index++;
    return hooks.slots[index] ?? (hooks.slots[index] = { current: initial });
  },
  useCallback(callback: unknown, dependencies: unknown[]) {
    const index = hooks.index++;
    const previous = hooks.slots[index] as
      { dependencies: unknown[]; callback: unknown } | undefined;
    if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i])))
      hooks.slots[index] = { dependencies, callback };
    return (hooks.slots[index] as { callback: unknown }).callback;
  },
  useSyncExternalStore(_subscribe: unknown, getSnapshot: () => unknown) {
    return getSnapshot();
  },
  useEffect(setup: Effect["setup"], dependencies: unknown[]) {
    const index = hooks.index++;
    const previous = hooks.slots[index] as { dependencies: unknown[]; effect: Effect } | undefined;
    if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
      previous?.effect.cleanup?.();
      if (previous) hooks.effects.splice(hooks.effects.indexOf(previous.effect), 1);
      const effect = { setup };
      hooks.slots[index] = { dependencies, effect };
      hooks.effects.push(effect);
      hooks.pending.push(effect);
    }
  },
}));

import { useEfaServiceMetadata } from "./use-efa-service-metadata";
const flush = async () => {
  for (let i = 0; i < 16; i++) await Promise.resolve();
};
function RenderMetadataHarness(props: Parameters<typeof useEfaServiceMetadata>[0]) {
  hooks.index = 0;
  const result = useEfaServiceMetadata(props);
  for (const effect of hooks.pending.splice(0)) effect.cleanup = effect.setup();
  return result;
}
beforeEach(() => {
  for (const effect of hooks.effects) effect.cleanup?.();
  hooks.slots = [];
  hooks.effects = [];
  hooks.pending = [];
  hooks.index = 0;
});

describe("EFA route metadata lifetime", () => {
  it("creates a fresh live store after StrictMode setup-cleanup-setup", async () => {
    const props = {
      ownerUserId: "owner",
      guardId: "guard",
      episodeIds: ["episode"],
      loadCalls: vi.fn(async () => []),
      loadDispatches: vi.fn(async () => []),
    };
    RenderMetadataHarness(props);
    const first = RenderMetadataHarness(props).store!;
    for (const effect of [...hooks.effects]) effect.cleanup?.();
    for (const effect of [...hooks.effects]) effect.cleanup = effect.setup();
    const next = RenderMetadataHarness(props).store!;
    await flush();
    expect(next).not.toBe(first);
    expect(next.get("episode").status).toBe("ready");
  });

  it("does not expose previous owner metadata during account transitions", async () => {
    const props = {
      ownerUserId: "owner",
      guardId: "guard",
      episodeIds: ["episode"],
      loadCalls: vi.fn(async () => []),
      loadDispatches: vi.fn(async () => []),
    };
    RenderMetadataHarness(props);
    RenderMetadataHarness(props);
    await flush();
    const previous = RenderMetadataHarness(props).store!;
    const changed = RenderMetadataHarness({ ...props, ownerUserId: "other" });
    expect(changed.store).toBeUndefined();
    expect(changed.snapshot.size).toBe(0);
    expect(previous.getSnapshot().size).toBe(0);
    const next = RenderMetadataHarness({ ...props, ownerUserId: "other" });
    expect(next.store).not.toBe(previous);
  });

  it("retries a failed service load automatically and stops once it succeeds", async () => {
    vi.useFakeTimers();
    try {
      const loadCalls = vi
        .fn<(episodeId: string) => Promise<never[]>>()
        .mockRejectedValueOnce(new Error("transient"))
        .mockResolvedValue([]);
      const props = {
        ownerUserId: "owner",
        guardId: "guard",
        episodeIds: ["episode"],
        loadCalls,
        loadDispatches: vi.fn(async () => []),
      };
      RenderMetadataHarness(props);
      const { store } = RenderMetadataHarness(props);
      await flush();
      expect(store!.get("episode").status).toBe("error");
      await vi.advanceTimersByTimeAsync(1500);
      await flush();
      expect(loadCalls).toHaveBeenCalledTimes(2);
      expect(store!.get("episode").status).toBe("ready");
      await vi.advanceTimersByTimeAsync(10_000);
      await flush();
      expect(loadCalls).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives up after the bounded retries when the service keeps failing", async () => {
    vi.useFakeTimers();
    try {
      const loadCalls = vi.fn(async () => {
        throw new Error("down");
      });
      const props = {
        ownerUserId: "owner",
        guardId: "guard",
        episodeIds: ["episode"],
        loadCalls: loadCalls as unknown as (episodeId: string) => Promise<never[]>,
        loadDispatches: vi.fn(async () => []),
      };
      RenderMetadataHarness(props);
      const { store } = RenderMetadataHarness(props);
      await flush();
      await vi.advanceTimersByTimeAsync(1500);
      await flush();
      await vi.advanceTimersByTimeAsync(5000);
      await flush();
      await vi.advanceTimersByTimeAsync(60_000);
      await flush();
      expect(loadCalls).toHaveBeenCalledTimes(3);
      expect(store!.get("episode").status).toBe("error");
    } finally {
      vi.useRealTimers();
    }
  });

  it("bounds service preloading and does not reload on selector snapshot renders", async () => {
    const pending: Array<() => void> = [];
    const loadCalls = vi.fn(
      () => new Promise<never[]>((resolve) => pending.push(() => resolve([]))),
    );
    const props = {
      ownerUserId: "owner",
      guardId: "guard",
      episodeIds: ["1", "2", "3", "4"],
      loadCalls,
      loadDispatches: vi.fn(async () => []),
    };
    RenderMetadataHarness(props);
    RenderMetadataHarness(props);
    expect(loadCalls).toHaveBeenCalledTimes(3);
    pending.splice(0).forEach((resolve) => resolve());
    await flush();
    expect(loadCalls).toHaveBeenCalledTimes(4);
    RenderMetadataHarness(props);
    expect(loadCalls).toHaveBeenCalledTimes(4);
    pending.splice(0).forEach((resolve) => resolve());
    await flush();
  });
});
