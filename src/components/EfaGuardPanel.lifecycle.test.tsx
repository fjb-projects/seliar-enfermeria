import { Children, isValidElement, type ComponentProps, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EfaGuardPanel, type GuardView } from "./EfaGuardPanel";
import { EfaMobileArrivalPanel, type MobileArrivalView } from "./EfaMobileArrivalPanel";
import {
  listActiveEfaGuardBases,
  listEfaGuards,
  setEfaGuardBases,
} from "@/lib/efa-guards.functions";
import { listEfaMobileArrivalsForGuard } from "@/lib/efa-mobile-arrivals.functions";
import { listEfaMobileHygieneForGuard } from "@/lib/efa-mobile-hygiene.functions";
import { listEfaStaffing } from "@/lib/efa-staffing.functions";

type Effect = { setup: () => void | (() => void); cleanup?: void | (() => void) };
const hooks = vi.hoisted(() => ({
  slots: [] as unknown[],
  effects: [] as Effect[],
  pending: [] as Effect[],
  index: 0,
  changed: false,
  queryClient: { invalidateQueries: vi.fn(async () => {}) },
}));

// Follow the existing node-only hook harness pattern, retaining memo/ref identity during
// React's development setup -> cleanup -> setup cycle. This does not simulate browser DOM.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useId: () => `id-${hooks.index++}`,
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.slots))
      hooks.slots[index] = typeof initial === "function" ? initial() : initial;
    return [
      hooks.slots[index],
      (next: unknown) => {
        const value = typeof next === "function" ? next(hooks.slots[index]) : next;
        hooks.changed ||= !Object.is(value, hooks.slots[index]);
        hooks.slots[index] = value;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    return hooks.slots[index] ?? (hooks.slots[index] = { current: initial });
  },
  useMemo: (factory: () => unknown, dependencies: readonly unknown[]) => {
    const index = hooks.index++;
    const previous = hooks.slots[index] as
      { dependencies: readonly unknown[]; value: unknown } | undefined;
    if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i])))
      hooks.slots[index] = { dependencies, value: factory() };
    return (hooks.slots[index] as { value: unknown }).value;
  },
  useEffect: (setup: Effect["setup"], dependencies: readonly unknown[]) => {
    const index = hooks.index++;
    const previous = hooks.slots[index] as
      { dependencies: readonly unknown[]; effect: Effect } | undefined;
    if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
      const effect = { setup };
      hooks.slots[index] = { dependencies, effect };
      if (previous) {
        previous.effect.cleanup?.();
        hooks.effects.splice(hooks.effects.indexOf(previous.effect), 1);
      }
      hooks.effects.push(effect);
      hooks.pending.push(effect);
    }
  },
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => hooks.queryClient }));
vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-start")>()),
  useServerFn: (fn: unknown) => fn,
}));
vi.mock("@tanstack/react-router", () => ({ Link: () => null }));
vi.mock("./EfaMobileArrivalPanel", () => ({ EfaMobileArrivalPanel: () => null }));
vi.mock("@/components/EfaObservationPanel", () => ({ EfaObservationPanel: () => null }));
vi.mock("@/lib/efa-guards.functions", () => ({
  endEfaGuard: vi.fn(),
  listActiveEfaGuardBases: vi.fn(),
  listEfaGuards: vi.fn(),
  setEfaGuardBases: vi.fn(),
  startEfaGuard: vi.fn(),
}));
vi.mock("@/lib/efa-staffing.functions", () => ({
  arriveEfaStaffing: vi.fn(),
  departEfaStaffing: vi.fn(),
  enterEfaStaffing: vi.fn(),
  exitEfaStaffing: vi.fn(),
  listEfaStaffing: vi.fn(),
}));
vi.mock("@/lib/efa-staffing-plan.functions", () => ({ previewEfaStaffingPlan: vi.fn() }));
vi.mock("@/lib/efa-mobile-arrivals.functions", () => ({
  listEfaMobileArrivalsForGuard: vi.fn(async () => []),
}));
vi.mock("@/lib/efa-mobile-hygiene.functions", () => ({ listEfaMobileHygieneForGuard: vi.fn() }));

const base = { id: "mobile-1", name: "Móvil 1", isActive: true };
const anotherBase = { id: "mobile-2", name: "Móvil 2", isActive: true };
const guard: GuardView = {
  id: "guard-a",
  ownerUserId: "user-a",
  startedAt: "2026-11-12T10:00:00Z",
  endedAt: null,
  declaredAtCentral: true,
  version: 1,
  bases: [],
  baseEvents: [],
};
const serverGuard = {
  ...guard,
  startedAt: new Date(guard.startedAt),
  endedAt: null,
  baseEvents: [],
};
let tree: ReactNode;

function render(overrides: Partial<ComponentProps<typeof EfaGuardPanel>> = {}) {
  for (let pass = 0; pass < 20; pass++) {
    hooks.index = 0;
    hooks.changed = false;
    tree = EfaGuardPanel({
      initialGuards: [guard],
      activeBases: [base, anotherBase],
      initialStaffing: {},
      currentUserId: guard.ownerUserId,
      isAdmin: false,
      canWrite: true,
      ...overrides,
    });
    hooks.pending.splice(0).forEach((effect) => {
      effect.cleanup = effect.setup();
    });
    if (!hooks.changed) return;
  }
  throw new Error("Guard panel did not settle");
}

function mobileProps(node: ReactNode = tree): ComponentProps<typeof EfaMobileArrivalPanel> {
  let found: ComponentProps<typeof EfaMobileArrivalPanel> | undefined;
  function visit(node: ReactNode) {
    Children.forEach(node, (child) => {
      if (!isValidElement<{ children?: ReactNode }>(child)) return;
      if (child.type === EfaMobileArrivalPanel && !found)
        found = child.props as ComponentProps<typeof EfaMobileArrivalPanel>;
      visit(child.props.children);
    });
  }
  visit(node);
  if (!found) throw new Error("Missing mobile panel");
  return found;
}

function cleanup() {
  hooks.effects.forEach((effect) => effect.cleanup?.());
}

function staffingAction() {
  type RunAction = (action: () => Promise<unknown>, success: string) => Promise<boolean>;
  let runAction: RunAction | undefined;
  function visit(node: ReactNode) {
    Children.forEach(node, (child) => {
      if (!isValidElement<{ children?: ReactNode; runAction?: RunAction }>(child)) return;
      runAction ??= child.props.runAction;
      visit(child.props.children);
    });
  }
  visit(tree);
  if (!runAction) throw new Error("Missing staffing action");
  return runAction;
}

beforeEach(() => {
  hooks.slots = [];
  hooks.effects = [];
  hooks.pending = [];
  vi.mocked(listEfaGuards).mockResolvedValue([serverGuard]);
  vi.mocked(listActiveEfaGuardBases).mockResolvedValue([base, anotherBase]);
  vi.mocked(listEfaMobileArrivalsForGuard).mockResolvedValue([]);
  vi.mocked(listEfaMobileHygieneForGuard).mockResolvedValue([]);
  vi.mocked(listEfaStaffing).mockResolvedValue([]);
  vi.mocked(setEfaGuardBases).mockImplementation(async (input) => {
    const data = input?.data as { expectedVersion: number; baseIds: string[] } | undefined;
    if (!data) throw new Error("Missing membership input");
    return {
      ...serverGuard,
      version: data.expectedVersion + 1,
      bases: [base, anotherBase].filter((item) => data.baseIds.includes(item.id)),
    };
  });
});

describe("guard mobile workspace effect lifetime", () => {
  const arrival = (role: MobileArrivalView["role"], version = 1): MobileArrivalView => ({
    id: `arrival-${role}`,
    guardId: guard.id,
    baseId: base.id,
    baseNameSnapshot: base.name,
    role,
    arrivedAt: "2026-11-13T10:05:00Z",
    deletedAt: null,
    version,
    canEdit: true,
  });

  it("adopts fresh loader arrivals after cached route reentry and retains them when the doctor arrives", () => {
    const selectedGuard = { ...guard, bases: [base] };
    render({ initialGuards: [selectedGuard], initialArrivals: { [guard.id]: [] } });
    expect(mobileProps().arrivals).toEqual([]);

    const confirmed = [arrival("nurse"), arrival("driver")];
    const freshProps = {
      initialGuards: [selectedGuard],
      initialArrivals: { [guard.id]: confirmed },
    };
    render(freshProps);
    expect(mobileProps().arrivals).toEqual(confirmed);
    mobileProps().onArrivalsChange(arrival("doctor"));
    render(freshProps);
    expect(mobileProps().arrivals.map((record) => record.role)).toEqual([
      "nurse",
      "driver",
      "doctor",
    ]);
    cleanup();
  });

  it("keeps confirmed arrivals through stale snapshots and applies versioned deletion and restoration", () => {
    const nurse = arrival("nurse");
    render({ initialArrivals: { [guard.id]: [nurse] } });
    const edited = { ...nurse, version: 2, arrivedAt: "2026-11-13T10:10:00Z" };
    mobileProps().onArrivalsChange(edited);
    render({ initialArrivals: { [guard.id]: [] } });
    expect(mobileProps().arrivals).toEqual([edited]);
    render({ initialArrivals: { [guard.id]: [nurse] } });
    expect(mobileProps().arrivals).toEqual([edited]);

    const deleted = { ...edited, version: 3, deletedAt: "2026-11-13T10:11:00Z", canEdit: false };
    render({ initialArrivals: { [guard.id]: [deleted] } });
    expect(mobileProps().arrivals).toEqual([deleted]);
    mobileProps().onArrivalsChange(edited);
    render();
    expect(mobileProps().arrivals).toEqual([deleted]);
    const restored = { ...edited, version: 4 };
    render({ initialArrivals: { [guard.id]: [restored] } });
    expect(mobileProps().arrivals).toEqual([restored]);
    cleanup();
  });

  it.each(["membership", "staffing"])(
    "retains fresher arrivals when an older %s read finishes later",
    async (source) => {
      let finishRead!: (value: Awaited<ReturnType<typeof listEfaMobileArrivalsForGuard>>) => void;
      vi.mocked(listEfaMobileArrivalsForGuard).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishRead = resolve;
          }),
      );
      render();
      const refresh = source === "staffing" ? staffingAction()(async () => {}, "Saved") : undefined;
      if (source === "membership") mobileProps().onBaseSelectionChange?.(base.id, true);
      await vi.waitFor(() => expect(listEfaMobileArrivalsForGuard).toHaveBeenCalledOnce());

      const confirmed = [arrival("nurse"), arrival("driver")];
      const freshProps = { initialArrivals: { [guard.id]: confirmed } };
      render(freshProps);
      finishRead([]);
      if (refresh) await expect(refresh).resolves.toBe(true);
      await vi.waitFor(() => {
        render(freshProps);
        expect(mobileProps().membershipBlocked).toBe(false);
        expect(mobileProps().arrivals).toEqual(confirmed);
      });
      cleanup();
    },
  );

  it("accepts mobile selection and arrivals after development effect replay and a route remount", async () => {
    for (let mount = 0; mount < 2; mount++) {
      render();
      cleanup();
      hooks.effects.forEach((effect) => {
        effect.cleanup = effect.setup();
      });
      render();

      expect(mobileProps().baseSelectionBlocked).toBe(false);
      expect(mobileProps().membershipBlocked).toBe(false);
      mobileProps().onBaseSelectionChange?.(base.id, true);
      await vi.waitFor(() => expect(setEfaGuardBases).toHaveBeenCalledTimes(mount * 2 + 1));
      await vi.waitFor(() => {
        render();
        expect(mobileProps().requestedBaseIds).toEqual([base.id]);
        expect(mobileProps().membershipBlocked).toBe(false);
      });
      const release = mobileProps().onArrivalMutationStart?.("nurse");
      expect(release).toBeTypeOf("function");
      release?.();
      mobileProps().onBaseSelectionChange?.(anotherBase.id, true);
      await vi.waitFor(() => {
        render();
        expect(setEfaGuardBases).toHaveBeenCalledTimes(mount * 2 + 2);
        expect(mobileProps().requestedBaseIds).toEqual([base.id, anotherBase.id]);
        expect(mobileProps().membershipBlocked).toBe(false);
      });
      expect(setEfaGuardBases).toHaveBeenLastCalledWith({
        data: { guardId: guard.id, expectedVersion: 2, baseIds: [base.id, anotherBase.id] },
      });
      cleanup();
      hooks.slots = [];
      hooks.effects = [];
    }
  });

  it("keeps a pending membership write serialized across renders and ignores its acknowledgement after unmount", async () => {
    let finish!: (value: Awaited<ReturnType<typeof setEfaGuardBases>>) => void;
    vi.mocked(setEfaGuardBases).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render();
    mobileProps().onBaseSelectionChange?.(base.id, true);
    render();
    mobileProps().onBaseSelectionChange?.(anotherBase.id, true);
    expect(setEfaGuardBases).toHaveBeenCalledOnce();
    expect(mobileProps().membershipBlocked).toBe(true);
    cleanup();
    finish({ ...serverGuard, version: 2, bases: [base] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(setEfaGuardBases).toHaveBeenCalledOnce();
    expect(hooks.queryClient.invalidateQueries).not.toHaveBeenCalled();
  });
});
