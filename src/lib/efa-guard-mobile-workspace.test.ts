import { describe, expect, it, vi } from "vitest";
import {
  createEfaGuardMobileWorkspace,
  sortGuardMobileBases,
  type EfaGuardMobileMembership,
} from "./efa-guard-mobile-workspace";

type Base = { id: string; name: string; isActive: boolean };
type Guard = EfaGuardMobileMembership<Base> & { startedAt: string };

const base2 = { id: "base-2", name: "Móvil 2", isActive: true };
const base10 = { id: "base-10", name: "Móvil 10", isActive: true };

function guard(version: number, bases: Base[] = []): Guard {
  return { id: "guard-a", version, bases, startedAt: "2026-10-08T10:00:00.000Z" };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createWorkspace(
  overrides: Partial<{
    write: (input: {
      guardId: string;
      expectedVersion: number;
      baseIds: string[];
    }) => Promise<Guard>;
    readGuard: (guardId: string) => Promise<Guard | null>;
    readArrivals: (guardId: string) => Promise<unknown[]>;
    isCurrent: () => boolean;
  }> = {},
) {
  const write =
    overrides.write ??
    vi.fn(async ({ guardId, expectedVersion, baseIds }) =>
      guard(
        expectedVersion + Math.max(1, baseIds.length),
        baseIds.map((id: string) => (id === base2.id ? base2 : base10)),
      ),
    );
  const readGuard = overrides.readGuard ?? vi.fn(async () => guard(1));
  const readArrivals = overrides.readArrivals ?? vi.fn(async () => []);
  const isCurrent = overrides.isCurrent ?? (() => true);
  const onGuardConfirmed = vi.fn();
  const onArrivalsConfirmed = vi.fn();
  const workspace = createEfaGuardMobileWorkspace({
    initialGuard: guard(1),
    writeMembership: write,
    readGuard,
    readArrivals,
    isCurrent: () => isCurrent(),
    onGuardConfirmed,
    onArrivalsConfirmed,
  });
  return { workspace, write, readGuard, readArrivals, onGuardConfirmed, onArrivalsConfirmed };
}

describe("EFA guard mobile workspace coordinator", () => {
  it("sorts numeric mobile names naturally with a stable identity tie-breaker", () => {
    expect(
      sortGuardMobileBases([
        { id: "base-z", name: "Móvil 2", isActive: true },
        base10,
        { id: "base-a", name: "Móvil 2", isActive: true },
      ]).map((base) => base.id),
    ).toEqual(["base-a", "base-z", "base-10"]);
  });

  it("serializes rapid membership intent against each authoritative version", async () => {
    const firstWrite = deferred<Guard>();
    const writes: Array<{ guardId: string; expectedVersion: number; baseIds: string[] }> = [];
    let activeWrites = 0;
    let maxActiveWrites = 0;
    const write = vi.fn(async (input) => {
      writes.push(input);
      activeWrites += 1;
      maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
      const response = writes.length === 1 ? await firstWrite.promise : guard(4, [base2, base10]);
      activeWrites -= 1;
      return response;
    });
    const { workspace } = createWorkspace({ write });

    const add2 = workspace.requestBaseSelection(base2.id, true);
    const add10 = workspace.requestBaseSelection(base10.id, true);
    expect(writes).toEqual([{ guardId: "guard-a", expectedVersion: 1, baseIds: [base2.id] }]);

    firstWrite.resolve(guard(2, [base2]));
    await expect(add2).resolves.toBe(true);
    await expect(add10).resolves.toBe(true);
    expect(writes).toEqual([
      { guardId: "guard-a", expectedVersion: 1, baseIds: [base2.id] },
      { guardId: "guard-a", expectedVersion: 2, baseIds: [base2.id, base10.id] },
    ]);
    expect(maxActiveWrites).toBe(1);
    expect(workspace.getSnapshot().confirmedGuard).toMatchObject({
      version: 4,
      bases: [base2, base10],
    });
  });

  it("skips an unchanged membership intent without requiring a version change", async () => {
    const { workspace, write } = createWorkspace();

    await expect(workspace.requestBaseSelection(base2.id, false)).resolves.toBe(true);

    expect(write).not.toHaveBeenCalled();
    expect(workspace.getSnapshot().confirmedGuard).toMatchObject({ version: 1, bases: [] });
  });

  it("blocks arrivals and closure through membership acknowledgement and arrival readback", async () => {
    const membershipWrite = deferred<Guard>();
    const arrivalRead = deferred<unknown[]>();
    const { workspace } = createWorkspace({
      write: vi.fn(async () => membershipWrite.promise),
      readArrivals: vi.fn(async () => arrivalRead.promise),
    });

    const mutation = workspace.requestBaseSelection(base2.id, true);
    expect(workspace.beginArrival("nurse")).toBeNull();
    expect(workspace.beginClose()).toBeNull();
    membershipWrite.resolve(guard(2, [base2]));
    await Promise.resolve();
    expect(workspace.beginArrival("nurse")).toBeNull();
    arrivalRead.resolve([]);
    await expect(mutation).resolves.toBe(true);

    const nurse = workspace.beginArrival("nurse");
    const driver = workspace.beginArrival("driver");
    expect(nurse).toBeTypeOf("function");
    expect(driver).toBeTypeOf("function");
    expect(workspace.beginClose()).toBeNull();
    expect(await workspace.requestBaseSelection(base2.id, false)).toBe(false);
    nurse?.();
    expect(workspace.beginClose()).toBeNull();
    driver?.();
    const close = workspace.beginClose();
    expect(close).toBeTypeOf("function");
    expect(await workspace.requestBaseSelection(base2.id, false)).toBe(false);
    close?.();
  });

  it("restores confirmed membership after readback proves a failed write did not commit", async () => {
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error("write failed"))
      .mockResolvedValueOnce(guard(2, [base10]));
    const readGuard = vi.fn(async () => guard(1));
    const { workspace } = createWorkspace({ write, readGuard });

    await expect(workspace.requestBaseSelection(base2.id, true)).resolves.toBe(false);
    expect(readGuard).toHaveBeenCalledWith("guard-a");
    expect(write).toHaveBeenCalledTimes(1);
    expect(workspace.getSnapshot().confirmedGuard).toMatchObject({ version: 1, bases: [] });
    expect(workspace.getSnapshot().requestedBaseIds).toEqual([]);
    expect(workspace.getSnapshot().errors[base2.id]).toMatch(/no se guardó/i);

    await expect(workspace.requestBaseSelection(base10.id, true)).resolves.toBe(true);
    expect(write).toHaveBeenLastCalledWith({
      guardId: "guard-a",
      expectedVersion: 1,
      baseIds: [base10.id],
    });
  });

  it("clears transient feedback when a committed write loses its response but readback confirms it", async () => {
    const lostResponse = deferred<Guard>();
    let serverGuard = guard(1);
    let writeCount = 0;
    const write = vi.fn(async () => {
      writeCount += 1;
      if (writeCount === 1) {
        serverGuard = guard(2, [base2]);
        return lostResponse.promise;
      }
      serverGuard = guard(4, [base2, base10]);
      return serverGuard;
    });
    const readGuard = vi.fn(async () => serverGuard);
    const { workspace } = createWorkspace({ write, readGuard });

    const add2 = workspace.requestBaseSelection(base2.id, true);
    expect(write).toHaveBeenCalledOnce();
    lostResponse.reject(new Error("response lost after commit"));

    await expect(add2).resolves.toBe(true);
    expect(readGuard).toHaveBeenCalledWith("guard-a");
    expect(workspace.getSnapshot().confirmedGuard).toMatchObject({
      version: 2,
      bases: [base2],
    });
    expect(workspace.getSnapshot().errors[base2.id]).toBeUndefined();
    expect(workspace.getSnapshot().unresolved).toBe(false);
    expect(write).toHaveBeenCalledOnce();

    await expect(workspace.requestBaseSelection(base10.id, true)).resolves.toBe(true);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith({
      guardId: "guard-a",
      expectedVersion: 2,
      baseIds: [base2.id, base10.id],
    });
  });

  it("remains unresolved after failed readback and blocks mutations until explicit reconciliation", async () => {
    const readGuard = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(guard(2));
    const readArrivals = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue([]);
    const write = vi.fn().mockRejectedValue(new Error("ambiguous"));
    const { workspace } = createWorkspace({ write, readGuard, readArrivals });

    await expect(workspace.requestBaseSelection(base2.id, true)).resolves.toBe(false);
    expect(workspace.getSnapshot().unresolved).toBe(true);
    expect(workspace.beginArrival("doctor")).toBeNull();
    expect(workspace.beginClose()).toBeNull();
    expect(await workspace.requestBaseSelection(base10.id, true)).toBe(false);
    expect(write).toHaveBeenCalledOnce();

    await expect(workspace.reconcile()).resolves.toBe(true);
    expect(workspace.getSnapshot().unresolved).toBe(false);
    expect(workspace.beginArrival("doctor")).toBeTypeOf("function");
  });

  it("keeps an acknowledged selection confirmed when arrival readback fails", async () => {
    const readGuard = vi.fn(async () => guard(2, [base2]));
    const readArrivals = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue([]);
    const write = vi.fn(async () => guard(2, [base2]));
    const { workspace } = createWorkspace({ write, readGuard, readArrivals });

    await expect(workspace.requestBaseSelection(base2.id, true)).resolves.toBe(false);
    expect(workspace.getSnapshot()).toMatchObject({
      confirmedGuard: { version: 2, bases: [base2] },
      unresolved: true,
      canCapture: false,
      canClose: false,
    });
    expect(workspace.getSnapshot().errors[base2.id]).toMatch(/se guardó/i);
    expect(write).toHaveBeenCalledOnce();

    await expect(workspace.reconcile()).resolves.toBe(true);
    expect(workspace.getSnapshot()).toMatchObject({ unresolved: false, canCapture: true });
    expect(write).toHaveBeenCalledOnce();
  });

  it("ignores late acknowledgements after the guard identity changes", async () => {
    const pending = deferred<Guard>();
    let current = true;
    const { workspace, onGuardConfirmed, readArrivals } = createWorkspace({
      write: vi.fn(async () => pending.promise),
      isCurrent: () => current,
    });

    const mutation = workspace.requestBaseSelection(base2.id, true);
    current = false;
    pending.resolve(guard(2, [base2]));

    await expect(mutation).resolves.toBe(false);
    expect(onGuardConfirmed).not.toHaveBeenCalled();
    expect(readArrivals).not.toHaveBeenCalled();
  });
});
