import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EFA_AUTOSAVE_DELAY_MS,
  autosaveStatusLabel,
  createAutosaveController,
  createAutosaveScheduler,
  createSaveSnapshot,
  deepEqualJson,
  deriveAutosaveStatus,
  isDirtyAfterSave,
  liveAutosaveGate,
  shouldAutosave,
  type AutosaveInput,
} from "./efa-autosave";

const ready: AutosaveInput = {
  canWrite: true,
  recordExists: true,
  isDraft: true,
  editorIsOwner: true,
  dirty: true,
  pending: false,
  queueUsable: true,
  busy: false,
  online: true,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("shouldAutosave", () => {
  it("allows a dirty draft owned by the editor when nothing blocks it", () => {
    expect(shouldAutosave(ready)).toEqual({ ok: true });
  });

  it.each([
    [{ canWrite: false }, "cannot_write"],
    [{ recordExists: false }, "no_record"],
    [{ isDraft: false }, "not_draft"],
    [{ editorIsOwner: false }, "not_owner"],
    [{ dirty: false }, "not_dirty"],
    [{ online: false }, "offline"],
    [{ queueUsable: false }, "queue_unavailable"],
    [{ pending: true }, "pending"],
    [{ busy: true }, "busy"],
  ] as const)("blocks %o with %s", (patch, reason) => {
    expect(shouldAutosave({ ...ready, ...patch })).toEqual({ ok: false, reason });
  });

  it("reports static reasons before transient ones", () => {
    expect(shouldAutosave({ ...ready, editorIsOwner: false, online: false, busy: true })).toEqual({
      ok: false,
      reason: "not_owner",
    });
    expect(shouldAutosave({ ...ready, online: false, pending: true })).toEqual({
      ok: false,
      reason: "offline",
    });
  });
});

describe("createAutosaveScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults to a 4 second delay", () => {
    expect(EFA_AUTOSAVE_DELAY_MS).toBe(4000);
    const onFire = vi.fn();
    const scheduler = createAutosaveScheduler({ onFire });
    scheduler.touch();
    vi.advanceTimersByTime(3999);
    expect(onFire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("fires once after the delay and restarts the countdown on every touch", () => {
    const onFire = vi.fn();
    const scheduler = createAutosaveScheduler({ delayMs: 1000, onFire });
    scheduler.touch();
    vi.advanceTimersByTime(800);
    scheduler.touch();
    vi.advanceTimersByTime(800);
    expect(onFire).not.toHaveBeenCalled();
    expect(scheduler.armed).toBe(true);
    vi.advanceTimersByTime(200);
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(scheduler.armed).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("flushes immediately only when armed and never fires twice", () => {
    const onFire = vi.fn();
    const scheduler = createAutosaveScheduler({ delayMs: 1000, onFire });
    expect(scheduler.flush()).toBe(false);
    expect(onFire).not.toHaveBeenCalled();
    scheduler.touch();
    expect(scheduler.flush()).toBe(true);
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(scheduler.flush()).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("stops on cancel and on dispose", () => {
    const onFire = vi.fn();
    const scheduler = createAutosaveScheduler({ delayMs: 1000, onFire });
    scheduler.touch();
    scheduler.cancel();
    vi.advanceTimersByTime(5000);
    expect(onFire).not.toHaveBeenCalled();
    scheduler.touch();
    scheduler.dispose();
    vi.advanceTimersByTime(5000);
    scheduler.touch();
    vi.advanceTimersByTime(5000);
    expect(scheduler.flush()).toBe(false);
    expect(onFire).not.toHaveBeenCalled();
  });

  it("uses the injected clock and timers", () => {
    let time = 0;
    const timers: Array<{ fn: () => void; at: number; cleared: boolean }> = [];
    const onFire = vi.fn();
    const scheduler = createAutosaveScheduler({
      delayMs: 100,
      now: () => time,
      setTimer: (fn, ms) => {
        const timer = { fn, at: time + ms, cleared: false };
        timers.push(timer);
        return timer;
      },
      clearTimer: (handle) => {
        (handle as { cleared: boolean }).cleared = true;
      },
      onFire,
    });
    const runDue = () => {
      for (const timer of [...timers]) {
        if (!timer.cleared && timer.at <= time) {
          timer.cleared = true;
          timer.fn();
        }
      }
    };
    scheduler.touch();
    time = 60;
    scheduler.touch();
    time = 100;
    runDue();
    expect(onFire).not.toHaveBeenCalled();
    time = 160;
    runDue();
    expect(onFire).toHaveBeenCalledTimes(1);
  });
});

describe("save snapshots", () => {
  it("keeps the form clean when nothing changed after the snapshot", () => {
    const form = {
      direction: "inbound",
      times: { startedAt: "10:00", endedAt: null },
      tags: [1, 2],
    };
    const snapshot = createSaveSnapshot(form);
    expect(isDirtyAfterSave(snapshot, { ...form, times: { ...form.times } })).toBe(false);
  });

  it("is independent of key order", () => {
    const snapshot = createSaveSnapshot({ a: 1, nested: { x: "1", y: [true, null] } });
    expect(isDirtyAfterSave(snapshot, { nested: { y: [true, null], x: "1" }, a: 1 })).toBe(false);
  });

  it("stays dirty when a nested value changed after the snapshot", () => {
    const form = { times: { startedAt: "10:00" }, tags: ["a"] };
    const snapshot = createSaveSnapshot(form);
    form.times.startedAt = "10:05";
    expect(isDirtyAfterSave(snapshot, form)).toBe(true);
    expect(isDirtyAfterSave(createSaveSnapshot({ tags: ["a"] }), { tags: ["a", "b"] })).toBe(true);
  });

  it("accepts a custom equality", () => {
    const snapshot = createSaveSnapshot({ value: "A" });
    const caseInsensitive = (a: { value: string }, b: { value: string }) =>
      a.value.toLowerCase() === b.value.toLowerCase();
    expect(isDirtyAfterSave(snapshot, { value: "a" }, caseInsensitive)).toBe(false);
  });

  it("compares JSON-like values deeply", () => {
    expect(deepEqualJson({ a: undefined, b: 1 }, { b: 1 })).toBe(true);
    expect(deepEqualJson([1, 2], [2, 1])).toBe(false);
    expect(deepEqualJson([1], { 0: 1 })).toBe(false);
    expect(deepEqualJson(null, {})).toBe(false);
    expect(deepEqualJson(new Date(5), new Date(5))).toBe(true);
    expect(deepEqualJson(new Date(5), new Date(6))).toBe(false);
    expect(deepEqualJson(Number.NaN, Number.NaN)).toBe(true);
  });
});

describe("autosave status", () => {
  it("labels every status in Spanish with a 24 h Buenos Aires time", () => {
    expect(autosaveStatusLabel({ kind: "idle" })).toBe("");
    expect(autosaveStatusLabel({ kind: "dirty" })).toBe("Sin guardar");
    expect(autosaveStatusLabel({ kind: "saving" })).toBe("Guardando…");
    expect(autosaveStatusLabel({ kind: "saved", at: new Date("2026-10-14T17:09:00.000Z") })).toBe(
      "Guardado 14:09",
    );
    expect(autosaveStatusLabel({ kind: "offline" })).toBe(
      "Sin conexión: se guardará al reconectar",
    );
    expect(autosaveStatusLabel({ kind: "blocked", reason: "not_owner" })).toBe("Sin guardar");
    expect(autosaveStatusLabel({ kind: "blocked", reason: "pending" })).toBe("Pendiente");
    expect(autosaveStatusLabel({ kind: "error", message: "No se pudo guardar." })).toBe(
      "No se pudo guardar.",
    );
  });

  it("derives the visible status from the decision and controller state", () => {
    const base = { enabled: true, dirty: true, saving: false, lastSavedAt: null, error: null };
    const at = new Date("2026-10-14T17:09:00.000Z");
    expect(deriveAutosaveStatus({ ...base, decision: { ok: true } })).toEqual({ kind: "dirty" });
    expect(deriveAutosaveStatus({ ...base, enabled: false, decision: { ok: true } })).toEqual({
      kind: "idle",
    });
    expect(deriveAutosaveStatus({ ...base, saving: true, decision: { ok: true } })).toEqual({
      kind: "saving",
    });
    expect(
      deriveAutosaveStatus({ ...base, error: "Falló.", decision: { ok: false, reason: "busy" } }),
    ).toEqual({ kind: "error", message: "Falló." });
    expect(deriveAutosaveStatus({ ...base, decision: { ok: false, reason: "offline" } })).toEqual({
      kind: "offline",
    });
    expect(
      deriveAutosaveStatus({
        ...base,
        dirty: false,
        lastSavedAt: at,
        decision: { ok: false, reason: "not_dirty" },
      }),
    ).toEqual({ kind: "saved", at });
    expect(
      deriveAutosaveStatus({ ...base, dirty: false, decision: { ok: false, reason: "not_owner" } }),
    ).toEqual({ kind: "idle" });
    expect(deriveAutosaveStatus({ ...base, decision: { ok: false, reason: "pending" } })).toEqual({
      kind: "blocked",
      reason: "pending",
    });
  });
});

describe("liveAutosaveGate", () => {
  const rendered: Omit<AutosaveInput, "online"> = {
    canWrite: true,
    recordExists: true,
    isDraft: true,
    editorIsOwner: true,
    dirty: true,
    pending: false,
    queueUsable: true,
    busy: false,
  };

  it("evaluates the live conditions and connectivity instead of the last render", () => {
    const live = { ...rendered };
    let online = true;
    const gate = liveAutosaveGate(
      () => ({
        enabled: true,
        conditions: { ...rendered, pending: true },
        getConditions: () => live,
      }),
      () => online,
    );
    expect(gate.canSave()).toBe(true);
    live.busy = true;
    expect(gate.canSave()).toBe(false);
    live.busy = false;
    online = false;
    expect(gate.canSave()).toBe(false);
  });

  it("falls back to the rendered conditions and honors the master switch", () => {
    const source = { enabled: true, conditions: { ...rendered, pending: true } };
    const gate = liveAutosaveGate(
      () => source,
      () => true,
    );
    expect(gate.canSave()).toBe(false);
    source.conditions.pending = false;
    expect(gate.canSave()).toBe(true);
    source.enabled = false;
    expect(gate.canSave()).toBe(false);
  });

  it("reads dirtiness from isDirty, then the live conditions, then the render", () => {
    const live = { ...rendered, dirty: false };
    const withLive = liveAutosaveGate(
      () => ({ enabled: true, conditions: rendered, getConditions: () => live }),
      () => true,
    );
    expect(withLive.isDirty()).toBe(false);
    const withReader = liveAutosaveGate(
      () => ({
        enabled: true,
        conditions: rendered,
        getConditions: () => live,
        isDirty: () => true,
      }),
      () => true,
    );
    expect(withReader.isDirty()).toBe(true);
    const renderedOnly = liveAutosaveGate(
      () => ({ enabled: true, conditions: rendered }),
      () => true,
    );
    expect(renderedOnly.isDirty()).toBe(true);
  });

  it("lets a flush right after a confirmed save run although the render still says pending", async () => {
    // The render captured while the first save ran; no render happens between the two flushes.
    const stale = { ...rendered, pending: true, busy: true };
    const live = { ...rendered };
    const units = ["fields", "links"];
    const save = vi.fn(async () => {
      live.pending = true;
      await Promise.resolve();
      units.shift();
      live.pending = false;
      live.dirty = units.length > 0;
      return true;
    });
    const gate = liveAutosaveGate(
      () => ({ enabled: true, conditions: stale, getConditions: () => live }),
      () => true,
    );
    const controller = createAutosaveController({ delayMs: 1000, save, ...gate });
    controller.setActive(true);
    await expect(controller.flush()).resolves.toBe(true);
    await expect(controller.flush()).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(live.dirty).toBe(false);
    controller.dispose();
  });
});

describe("createAutosaveController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(save: () => Promise<boolean>) {
    const state = { dirty: true, canSave: true };
    const controller = createAutosaveController({
      delayMs: 1000,
      save,
      canSave: () => state.canSave,
      isDirty: () => state.dirty,
    });
    controller.setActive(true);
    return { controller, state };
  }

  it("saves after the inactivity delay and records the time", async () => {
    vi.setSystemTime(new Date("2026-10-14T17:09:00.000Z"));
    const save = vi.fn(async () => {
      state.dirty = false;
      return true;
    });
    const { controller, state } = setup(save);
    controller.touch();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toEqual({
      saving: false,
      lastSavedAt: new Date("2026-10-14T17:09:01.000Z"),
      error: null,
    });
  });

  it("skips the save when it is blocked or clean at fire time", async () => {
    const save = vi.fn(async () => true);
    const { controller, state } = setup(save);
    state.canSave = false;
    controller.touch();
    await vi.advanceTimersByTimeAsync(1000);
    state.canSave = true;
    state.dirty = false;
    controller.touch();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).not.toHaveBeenCalled();
  });

  it("never runs two saves at once", async () => {
    const pending = deferred<boolean>();
    const save = vi.fn(() => pending.promise);
    const { controller } = setup(save);
    controller.touch();
    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.getSnapshot().saving).toBe(true);
    const flushed = controller.flush();
    controller.touch();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    pending.resolve(true);
    await flushed;
  });

  it("flush awaits the in-flight save and then saves what is still dirty", async () => {
    const first = deferred<boolean>();
    const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(true);
    const { controller, state } = setup(save);
    controller.touch();
    await vi.advanceTimersByTimeAsync(1000);
    let done = false;
    const flushed = controller.flush().then((result) => {
      done = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    first.resolve(true);
    await expect(flushed).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    state.dirty = false;
    await expect(controller.flush()).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("flush resolves false when saving is blocked while dirty", async () => {
    const save = vi.fn(async () => true);
    const { controller, state } = setup(save);
    state.canSave = false;
    await expect(controller.flush()).resolves.toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it("re-arms after a successful save when the form is still dirty", async () => {
    const save = vi.fn(async () => true);
    const { controller, state } = setup(save);
    controller.touch();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(2);
    state.dirty = false;
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("does not retry a failed save until the next touch", async () => {
    const save = vi.fn(async () => false);
    const { controller } = setup(save);
    controller.touch();
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().lastSavedAt).toBeNull();
  });

  it("turns a thrown save into an error and clears it on the next success", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(true);
    const { controller } = setup(save);
    await expect(controller.flush()).resolves.toBe(false);
    expect(controller.getSnapshot().error).toBe(
      "No se pudo guardar automáticamente; tus cambios siguen en el formulario.",
    );
    await expect(controller.flush()).resolves.toBe(true);
    expect(controller.getSnapshot().error).toBeNull();
  });

  it("notifies subscribers and records manual saves", () => {
    const { controller } = setup(async () => true);
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    const at = new Date("2026-10-14T17:09:00.000Z");
    controller.markSaved(at);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().lastSavedAt).toBe(at);
    unsubscribe();
    controller.markSaved(at);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("flush awaits a manual save run through the controller and then re-checks dirtiness", async () => {
    const manual = deferred<boolean>();
    const save = vi.fn(async () => true);
    const { controller, state } = setup(save);
    const manualResult = controller.runExclusive(() => manual.promise);
    let done = false;
    const flushed = controller.flush().then((result) => {
      done = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    state.dirty = false;
    manual.resolve(true);
    await expect(manualResult).resolves.toBe(true);
    await expect(flushed).resolves.toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it("flush saves what a manual save left dirty once it settles", async () => {
    const manual = deferred<boolean>();
    const save = vi.fn(async () => true);
    const { controller } = setup(save);
    void controller.runExclusive(() => manual.promise);
    const flushed = controller.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).not.toHaveBeenCalled();
    manual.resolve(true);
    await expect(flushed).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("never starts an autosave while a manual save is in flight, nor the reverse", async () => {
    const manual = deferred<boolean>();
    const auto = deferred<boolean>();
    const save = vi.fn(() => auto.promise);
    const { controller } = setup(save);
    void controller.runExclusive(() => manual.promise);
    controller.touch();
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();
    manual.resolve(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    const second = vi.fn(async () => true);
    const secondResult = controller.runExclusive(second);
    await vi.advanceTimersByTimeAsync(0);
    expect(second).not.toHaveBeenCalled();
    auto.resolve(true);
    await expect(secondResult).resolves.toBe(true);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("returns the manual result, rethrows its error and stays usable", async () => {
    const save = vi.fn(async () => true);
    const { controller } = setup(save);
    await expect(controller.runExclusive(async () => false)).resolves.toBe(false);
    await expect(controller.runExclusive(() => Promise.reject(new Error("boom")))).rejects.toThrow(
      "boom",
    );
    await expect(controller.flush()).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("settle waits for the in-flight save without starting another, within a bound", async () => {
    const pending = deferred<boolean>();
    const save = vi.fn(() => pending.promise);
    const { controller, state } = setup(save);
    controller.touch();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    const timedOut = controller.settle(500);
    await vi.advanceTimersByTimeAsync(500);
    await expect(timedOut).resolves.toBe(false);
    const settled = controller.settle(5000);
    state.dirty = false;
    pending.resolve(true);
    await expect(settled).resolves.toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
    await expect(controller.settle(10)).resolves.toBe(true);
  });

  it("stops scheduling while inactive", async () => {
    const save = vi.fn(async () => true);
    const { controller } = setup(save);
    controller.touch();
    controller.setActive(false);
    await vi.advanceTimersByTimeAsync(5000);
    controller.touch();
    await vi.advanceTimersByTimeAsync(5000);
    await expect(controller.flush()).resolves.toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
});
