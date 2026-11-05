import { describe, expect, it } from "vitest";
import {
  createEfaMobileArrivalService,
  type MobileArrivalAudit,
  type MobileArrivalOperation,
  type MobileArrivalRecord,
  type MobileArrivalTransaction,
  type MobileArrivalStore,
} from "./efa-mobile-arrivals.server";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = new Date("2026-10-07T12:00:00.000Z");

class FakeStore implements MobileArrivalStore {
  actors = new Map<string, { isActive: boolean; roles: ("efa" | "admin")[] }>([
    ["owner", { isActive: true, roles: ["efa"] }],
    ["admin", { isActive: true, roles: ["admin"] }],
    ["revoked", { isActive: true, roles: [] }],
    ["inactive", { isActive: false, roles: ["efa"] }],
  ]);
  guard = { id: id(1), ownerUserId: "owner", endedAt: null as Date | null };
  selected = new Set([`${id(1)}:${id(2)}`]);
  bases = new Map([[id(2), "Base Norte"]]);
  rows: MobileArrivalRecord[] = [];
  audits: MobileArrivalAudit[] = [];
  operations: MobileArrivalOperation[] = [];

  async transaction<T>(work: (tx: MobileArrivalTransaction) => Promise<T>) {
    const tx: MobileArrivalTransaction = {
      findActor: async (userId) => this.actors.get(userId) ?? null,
      findGuard: async (guardId) => (guardId === this.guard.id ? this.guard : null),
      findSelectedBase: async (guardId, baseId) =>
        this.selected.has(`${guardId}:${baseId}`)
          ? { id: baseId, name: this.bases.get(baseId) ?? "Base histórica" }
          : null,
      findArrival: async (arrivalId) => {
        const row = this.rows.find((item) => item.id === arrivalId);
        return row ? { ...row } : null;
      },
      findArrivalByKey: async (guardId, baseId, role) => {
        const row = this.rows.find(
          (item) => item.guardId === guardId && item.baseId === baseId && item.role === role,
        );
        return row ? { ...row } : null;
      },
      findByCreationKey: async (guardId, key) => {
        const row = this.rows.find(
          (item) => item.guardId === guardId && item.clientCreationKey === key,
        );
        return row ? { ...row } : null;
      },
      findOperation: async (guardId, operationId) =>
        this.operations.find(
          (item) => item.guardId === guardId && item.clientOperationId === operationId,
        ) ?? null,
      listForGuard: async (guardId) => this.rows.filter((row) => row.guardId === guardId),
      listAudit: async (arrivalId) => this.audits.filter((row) => row.arrivalId === arrivalId),
      insertArrival: async (record) => {
        this.rows.push({ ...record, createdAt: now, updatedAt: now });
      },
      updateArrival: async (arrivalId, version, fields) => {
        const row = this.rows.find((item) => item.id === arrivalId);
        if (!row || row.version !== version)
          throw new Error("La marca cambió; actualiza la lista.");
        Object.assign(row, fields, { updatedAt: now });
      },
      appendAudit: async (record) => {
        this.audits.push({ ...record, id: id(this.audits.length + 20), occurredAt: now });
      },
      insertOperation: async (record) => {
        this.operations.push(record);
      },
      databaseNow: async () => now,
    };
    return work(tx);
  }
}

const setup = () => {
  const store = new FakeStore();
  let sequence = 10;
  return {
    store,
    service: createEfaMobileArrivalService(store, { newId: () => id(sequence++) }),
  };
};
const createInput = (operation: number, extra: Record<string, unknown> = {}) => ({
  guardId: id(1),
  baseId: id(2),
  role: "nurse" as const,
  clientCreationKey: id(operation),
  operationId: id(operation + 100),
  ...extra,
});

describe("EFA mobile arrival persistence service", () => {
  it("defaults capture to database time and replays the same create operation", async () => {
    const { service, store } = setup();
    const input = createInput(1);
    const first = await service.create("owner", input);
    const replay = await service.create("owner", input);

    expect(first.arrival).toMatchObject({
      id: id(10),
      arrivedAt: now.toISOString(),
      version: 1,
      deletedAt: null,
    });
    expect(replay.operation.replayed).toBe(true);
    expect(replay.arrival.id).toBe(first.arrival.id);
    expect(replay.arrival.canEdit).toBe(true);
    expect(store.rows).toHaveLength(1);
    expect(store.audits).toHaveLength(1);
  });

  it("requires an active EFA writer, their own open guard, and a selected base to create", async () => {
    const { service, store } = setup();
    await expect(service.create("revoked", createInput(2))).rejects.toThrow("EFA vigente");
    await expect(service.create("admin", createInput(3))).rejects.toThrow("no pertenece");
    store.selected.clear();
    await expect(service.create("owner", createInput(4))).rejects.toThrow(
      /base no está seleccionada/,
    );
    store.selected.add(`${id(1)}:${id(2)}`);
    store.guard.endedAt = now;
    await expect(service.create("owner", createInput(5))).rejects.toThrow("guardia finalizada");
    expect(store.rows).toHaveLength(0);
  });

  it("validates explicit timestamps and applies optimistic edits with an audit entry", async () => {
    const { service, store } = setup();
    await expect(
      service.create("owner", createInput(6, { arrivedAt: "2026-10-07 09:00" })),
    ).rejects.toThrow("hora de ingreso");
    const created = await service.create("owner", createInput(7));
    const updated = await service.update("owner", {
      arrivalId: created.arrival.id,
      expectedVersion: 1,
      operationId: id(207),
      arrivedAt: "2026-10-07T09:30:00-03:00",
    });

    expect(updated.arrival.arrivedAt).toBe("2026-10-07T12:30:00.000Z");
    expect(store.audits.at(-1)).toMatchObject({
      action: "updated",
      versionBefore: 1,
      versionAfter: 2,
    });
    await expect(
      service.update("owner", {
        arrivalId: created.arrival.id,
        expectedVersion: 1,
        operationId: id(208),
        arrivedAt: "2026-10-07T12:31:00Z",
      }),
    ).rejects.toThrow("cambió");
  });

  it("soft-deletes and restores the same identity while keeping one row per guard, base, and role", async () => {
    const { service, store } = setup();
    const created = await service.create("owner", createInput(8));
    const deleted = await service.delete("owner", {
      arrivalId: created.arrival.id,
      expectedVersion: 1,
      operationId: id(208),
    });
    const restored = await service.create("owner", createInput(9));

    expect(deleted.arrival.deletedAt).toBe(now.toISOString());
    expect(restored.arrival.id).toBe(created.arrival.id);
    expect(restored.arrival.version).toBe(3);
    expect(restored.arrival.deletedAt).toBeNull();
    expect(store.rows).toHaveLength(1);
    expect(store.audits.map((audit) => audit.action)).toEqual(["created", "deleted", "restored"]);
    await expect(service.create("owner", createInput(10))).rejects.toThrow(/ya existe/i);
  });

  it("replays update and delete operation identities without duplicate audit versions", async () => {
    const { service, store } = setup();
    const created = await service.create("owner", createInput(12));
    const update = {
      arrivalId: created.arrival.id,
      expectedVersion: 1,
      operationId: id(212),
      arrivedAt: "2026-10-07T09:15:00Z",
    };
    const updated = await service.update("owner", update);
    const updateReplay = await service.update("owner", update);
    expect(updateReplay.operation.replayed).toBe(true);
    expect(updateReplay.arrival.version).toBe(2);

    const remove = {
      arrivalId: created.arrival.id,
      expectedVersion: 2,
      operationId: id(312),
    };
    await service.delete("owner", remove);
    const deleteReplay = await service.delete("owner", remove);
    expect(deleteReplay.operation.replayed).toBe(true);
    expect(store.audits).toHaveLength(3);
    await expect(
      service.update("owner", { ...update, arrivedAt: "2026-10-07T09:16:00Z" }),
    ).rejects.toThrow("otros datos");
    expect(updated.arrival.version).toBe(2);
  });

  it("blocks new edits and deletes after base removal while preserving completed replays", async () => {
    const { service, store } = setup();
    const nurse = await service.create("owner", createInput(13));
    const driver = await service.create("owner", createInput(14, { role: "driver" }));
    const doctor = await service.create("owner", createInput(15, { role: "doctor" }));
    const update = {
      arrivalId: nurse.arrival.id,
      expectedVersion: 1,
      operationId: id(213),
      arrivedAt: "2026-10-07T09:20:00Z",
    };
    const removeDriver = {
      arrivalId: driver.arrival.id,
      expectedVersion: 1,
      operationId: id(214),
    };
    await service.update("owner", update);
    await service.delete("owner", removeDriver);
    store.selected.clear();

    expect((await service.update("owner", update)).operation.replayed).toBe(true);
    expect((await service.delete("owner", removeDriver)).operation.replayed).toBe(true);
    await expect(
      service.update("owner", {
        ...update,
        operationId: id(215),
        arrivedAt: "2026-10-07T09:21:00Z",
        expectedVersion: 2,
      }),
    ).rejects.toThrow(/base.*seleccionada/i);
    await expect(
      service.delete("owner", {
        arrivalId: doctor.arrival.id,
        expectedVersion: 1,
        operationId: id(216),
      }),
    ).rejects.toThrow(/base.*seleccionada/i);
    expect(store.rows.find((row) => row.id === nurse.arrival.id)).toMatchObject({ version: 2 });
    expect(store.rows.find((row) => row.id === doctor.arrival.id)).toMatchObject({
      version: 1,
      deletedAt: null,
    });
    expect(store.audits).toHaveLength(5);
  });

  it("replays a creation key against immutable creation evidence after an edit", async () => {
    const { service, store } = setup();
    const creation = createInput(16, { arrivedAt: "2026-10-07T09:00:00Z" });
    const created = await service.create("owner", creation);
    await service.update("owner", {
      arrivalId: created.arrival.id,
      expectedVersion: 1,
      operationId: id(216),
      arrivedAt: "2026-10-07T10:00:00Z",
    });

    const alternateRetry = {
      ...creation,
      operationId: id(316),
    };
    const replay = await service.create("owner", alternateRetry);
    expect(replay.arrival.id).toBe(created.arrival.id);
    expect(replay.arrival.arrivedAt).toBe("2026-10-07T10:00:00.000Z");
    expect(replay.operation.changed).toBe(false);
    expect((await service.create("owner", alternateRetry)).operation.replayed).toBe(true);
    expect(store.audits).toHaveLength(2);
  });

  it("keeps removed-base and closed-guard records visible as read-only history", async () => {
    const { service, store } = setup();
    await service.create("owner", createInput(11));
    store.selected.clear();
    store.guard.endedAt = now;

    const rows = await service.listForGuard("owner", id(1));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ baseNameSnapshot: "Base Norte", canEdit: false });
    await expect(
      service.update("owner", {
        arrivalId: rows[0]!.id,
        expectedVersion: 1,
        operationId: id(211),
        arrivedAt: now.toISOString(),
      }),
    ).rejects.toThrow("guardia finalizada");
  });
});
