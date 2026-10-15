import { describe, expect, it } from "vitest";
import {
  createEfaMobileHygieneService,
  type MobileHygieneAudit,
  type MobileHygieneOperation,
  type MobileHygieneRecord,
  type MobileHygieneStore,
  type MobileHygieneTransaction,
} from "./efa-mobile-hygiene.server";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = new Date("2026-10-07T12:00:00.000Z");
const guardStart = new Date("2026-10-07T08:00:00.000Z");

class FakeStore implements MobileHygieneStore {
  actors = new Map<string, { isActive: boolean; roles: ("efa" | "admin")[] }>([
    ["owner", { isActive: true, roles: ["efa"] }],
    ["admin", { isActive: true, roles: ["admin"] }],
    ["revoked", { isActive: true, roles: [] }],
    ["inactive", { isActive: false, roles: ["efa"] }],
  ]);
  guard = { id: id(1), ownerUserId: "owner", startedAt: guardStart, endedAt: null as Date | null };
  selected = new Set([`${id(1)}:${id(2)}`, `${id(1)}:${id(3)}`]);
  bases = new Map([
    [id(2), "Base Norte"],
    [id(3), "Base Sur"],
  ]);
  rows: MobileHygieneRecord[] = [];
  audits: MobileHygieneAudit[] = [];
  operations: MobileHygieneOperation[] = [];

  async transaction<T>(work: (tx: MobileHygieneTransaction) => Promise<T>) {
    const isOpen = (row: MobileHygieneRecord) =>
      row.availableAt === null && row.deletedAt === null && !row.notInformed;
    const tx: MobileHygieneTransaction = {
      findActor: async (userId) => this.actors.get(userId) ?? null,
      findGuard: async (guardId) => (guardId === this.guard.id ? this.guard : null),
      findSelectedBase: async (guardId, baseId) =>
        this.selected.has(`${guardId}:${baseId}`)
          ? { id: baseId, name: this.bases.get(baseId) ?? "Base histórica" }
          : null,
      findPeriod: async (periodId) => {
        const row = this.rows.find((item) => item.id === periodId);
        return row ? { ...row } : null;
      },
      findOpenForBase: async (guardId, baseId) => {
        const row = this.rows.find(
          (item) => item.guardId === guardId && item.baseId === baseId && isOpen(item),
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
      listAudit: async (periodId) => this.audits.filter((row) => row.periodId === periodId),
      insertPeriod: async (record) => {
        if (
          isOpen({ ...record, createdAt: now, updatedAt: now }) &&
          this.rows.some(
            (item) =>
              item.guardId === record.guardId && item.baseId === record.baseId && isOpen(item),
          )
        )
          throw new Error("one-open-per-mobile-violated");
        this.rows.push({ ...record, createdAt: now, updatedAt: now });
      },
      updatePeriod: async (periodId, version, fields) => {
        const row = this.rows.find((item) => item.id === periodId);
        if (!row || row.version !== version) throw new Error("El período cambió.");
        Object.assign(row, fields, { updatedAt: now });
      },
      appendAudit: async (record) => {
        this.audits.push({ ...record, id: id(this.audits.length + 500), occurredAt: now });
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
    service: createEfaMobileHygieneService(store, { newId: () => id(sequence++) }),
  };
};
const requestInput = (n: number, extra: Record<string, unknown> = {}) => ({
  guardId: id(1),
  baseId: id(2),
  clientCreationKey: id(n),
  operationId: id(n + 100),
  ...extra,
});
const availableInput = (periodId: string, n: number, extra: Record<string, unknown> = {}) => ({
  periodId,
  expectedVersion: 1,
  operationId: id(n + 200),
  ...extra,
});

describe("EFA mobile hygiene persistence service", () => {
  it("opens a period at database time and replays the same request without duplicating it", async () => {
    const { service, store } = setup();
    const input = requestInput(1);
    const first = await service.request("owner", input);
    const replay = await service.request("owner", input);

    expect(first.period).toMatchObject({
      id: id(10),
      baseNameSnapshot: "Base Norte",
      requestedAt: now.toISOString(),
      availableAt: null,
      notInformed: false,
      version: 1,
      canEdit: true,
    });
    expect(replay.operation.replayed).toBe(true);
    expect(replay.period.id).toBe(first.period.id);
    expect(store.rows).toHaveLength(1);
    expect(store.audits).toHaveLength(1);
    expect(store.operations).toHaveLength(1);
  });

  it("requires an active EFA writer, their own open guard and a selected base", async () => {
    const { service, store } = setup();
    await expect(service.request("revoked", requestInput(2))).rejects.toThrow("EFA vigente");
    await expect(service.request("inactive", requestInput(2))).rejects.toThrow("inactiva");
    await expect(service.request("admin", requestInput(3))).rejects.toThrow("no pertenece");
    store.selected.clear();
    await expect(service.request("owner", requestInput(4))).rejects.toThrow(
      /base no está seleccionada/,
    );
    store.selected.add(`${id(1)}:${id(2)}`);
    store.guard.endedAt = now;
    await expect(service.request("owner", requestInput(5))).rejects.toThrow("guardia finalizada");
    expect(store.rows).toHaveLength(0);
  });

  it("rejects a second open period for the same mobile but allows other mobiles and closed history", async () => {
    const { service, store } = setup();
    const first = await service.request("owner", requestInput(6));
    await expect(service.request("owner", requestInput(7))).rejects.toThrow(
      "Ya hay una solicitud de higiene abierta",
    );
    await service.request("owner", requestInput(8, { baseId: id(3) }));
    await service.markAvailable("owner", availableInput(first.period.id, 6));
    await service.request("owner", requestInput(9));
    expect(store.rows).toHaveLength(3);
    expect(store.rows.filter((row) => row.baseId === id(2))).toHaveLength(2);
  });

  it("validates explicit request times against the guard window", async () => {
    const { service, store } = setup();
    await expect(
      service.request("owner", requestInput(11, { requestedAt: "2026-10-07 09:00" })),
    ).rejects.toThrow("zona horaria");
    await expect(
      service.request("owner", requestInput(11, { requestedAt: "2026-10-07T07:59:00Z" })),
    ).rejects.toThrow("anterior al inicio de la guardia");
    await expect(
      service.request("owner", requestInput(11, { requestedAt: "2026-10-07T12:10:00Z" })),
    ).rejects.toThrow("posterior a la hora actual");
    const manual = await service.request(
      "owner",
      requestInput(12, { requestedAt: "2026-10-07T09:00:00-03:00" }),
    );
    expect(manual.period.requestedAt).toBe("2026-10-07T12:00:00.000Z");
    const nearNow = await service.request(
      "owner",
      requestInput(13, { baseId: id(3), requestedAt: "2026-10-07T12:03:00Z" }),
    );
    expect(nearNow.period.requestedAt).toBe("2026-10-07T12:03:00.000Z");
    expect(store.rows).toHaveLength(2);
  });

  it("marks the period available with an audit entry and never before the request", async () => {
    const { service, store } = setup();
    const created = await service.request(
      "owner",
      requestInput(14, { requestedAt: "2026-10-07T10:00:00Z" }),
    );
    await expect(
      service.markAvailable(
        "owner",
        availableInput(created.period.id, 14, { availableAt: "2026-10-07T09:59:00Z" }),
      ),
    ).rejects.toThrow("anterior a la solicitud");
    const available = await service.markAvailable(
      "owner",
      availableInput(created.period.id, 15, { availableAt: "2026-10-07T10:40:00Z" }),
    );
    expect(available.period).toMatchObject({
      availableAt: "2026-10-07T10:40:00.000Z",
      version: 2,
      notInformed: false,
    });
    expect(store.audits.at(-1)).toMatchObject({
      action: "available",
      versionBefore: 1,
      versionAfter: 2,
    });
    await expect(
      service.markAvailable("owner", {
        ...availableInput(created.period.id, 16),
        expectedVersion: 2,
      }),
    ).rejects.toThrow("ya figura como disponible");
  });

  it("uses database time when the available mark is made now and rejects stale versions", async () => {
    const { service } = setup();
    const created = await service.request(
      "owner",
      requestInput(17, { requestedAt: "2026-10-07T11:00:00Z" }),
    );
    await expect(
      service.markAvailable("owner", {
        ...availableInput(created.period.id, 17),
        expectedVersion: 5,
      }),
    ).rejects.toThrow("cambió");
    const available = await service.markAvailable("owner", availableInput(created.period.id, 18));
    expect(available.period.availableAt).toBe(now.toISOString());
  });

  it("edits times and the note with optimistic versioning and no-op detection", async () => {
    const { service, store } = setup();
    const created = await service.request(
      "owner",
      requestInput(19, { requestedAt: "2026-10-07T10:00:00Z" }),
    );
    const edit = {
      periodId: created.period.id,
      expectedVersion: 1,
      operationId: id(219),
      requestedAt: "2026-10-07T09:30:00Z",
      availableAt: "2026-10-07T10:15:00Z",
      note: "  Reposición de oxígeno  ",
    };
    const updated = await service.update("owner", edit);
    expect(updated.period).toMatchObject({
      requestedAt: "2026-10-07T09:30:00.000Z",
      availableAt: "2026-10-07T10:15:00.000Z",
      note: "Reposición de oxígeno",
      version: 2,
    });
    expect(store.audits.at(-1)).toMatchObject({ action: "updated", versionBefore: 1 });

    const noop = await service.update("owner", {
      ...edit,
      expectedVersion: 2,
      operationId: id(220),
      note: "Reposición de oxígeno",
    });
    expect(noop.operation.changed).toBe(false);
    expect(noop.period.version).toBe(2);
    expect(store.audits).toHaveLength(2);

    await expect(
      service.update("owner", { ...edit, operationId: id(221), note: "otro" }),
    ).rejects.toThrow("cambió");
  });

  it("keeps the order of times, the guard window and the open state when editing", async () => {
    const { service } = setup();
    const created = await service.request(
      "owner",
      requestInput(22, { requestedAt: "2026-10-07T10:00:00Z" }),
    );
    const base = {
      periodId: created.period.id,
      expectedVersion: 1,
      operationId: id(222),
      requestedAt: "2026-10-07T10:00:00Z",
      availableAt: null as string | null,
    };
    await expect(
      service.update("owner", { ...base, availableAt: "2026-10-07T09:00:00Z" }),
    ).rejects.toThrow("anterior a la solicitud");
    await expect(
      service.update("owner", { ...base, requestedAt: "2026-10-07T07:00:00Z" }),
    ).rejects.toThrow("anterior al inicio de la guardia");
    await expect(service.update("owner", { ...base, note: "x".repeat(301) })).rejects.toThrow(
      "300 caracteres",
    );
    const closed = await service.update("owner", {
      ...base,
      availableAt: "2026-10-07T10:20:00Z",
    });
    await expect(
      service.update("owner", {
        ...base,
        expectedVersion: closed.period.version,
        operationId: id(223),
        availableAt: null,
      }),
    ).rejects.toThrow("quitar la hora de disponible");
  });

  it("soft-deletes a period, frees the mobile and keeps audit history", async () => {
    const { service, store } = setup();
    const created = await service.request("owner", requestInput(24));
    const removal = { periodId: created.period.id, expectedVersion: 1, operationId: id(224) };
    const deleted = await service.delete("owner", removal);
    expect(deleted.period).toMatchObject({ deletedAt: now.toISOString(), canEdit: false });
    expect((await service.delete("owner", removal)).operation.replayed).toBe(true);
    await expect(
      service.delete("owner", { ...removal, operationId: id(225), expectedVersion: 2 }),
    ).rejects.toThrow("ya fue eliminado");
    await service.request("owner", requestInput(25));
    expect(store.audits.map((audit) => audit.action)).toEqual(["created", "deleted", "created"]);
    expect(await service.listForGuard("owner", id(1))).toHaveLength(1);
  });

  it("replays update and available operations and rejects reused identities with other data", async () => {
    const { service, store } = setup();
    const created = await service.request(
      "owner",
      requestInput(26, { requestedAt: "2026-10-07T10:00:00Z" }),
    );
    const available = availableInput(created.period.id, 26, {
      availableAt: "2026-10-07T10:30:00Z",
    });
    await service.markAvailable("owner", available);
    const replay = await service.markAvailable("owner", available);
    expect(replay.operation.replayed).toBe(true);
    expect(replay.period.version).toBe(2);
    await expect(
      service.markAvailable("owner", { ...available, availableAt: "2026-10-07T10:31:00Z" }),
    ).rejects.toThrow("otros datos");
    expect(store.audits).toHaveLength(2);
  });

  it("replays a creation key against immutable creation evidence after an edit", async () => {
    const { service, store } = setup();
    const creation = requestInput(27, { requestedAt: "2026-10-07T10:00:00Z" });
    const created = await service.request("owner", creation);
    await service.update("owner", {
      periodId: created.period.id,
      expectedVersion: 1,
      operationId: id(227),
      requestedAt: "2026-10-07T10:05:00Z",
      availableAt: null,
    });
    const retry = await service.request("owner", { ...creation, operationId: id(327) });
    expect(retry.period.id).toBe(created.period.id);
    expect(retry.period.requestedAt).toBe("2026-10-07T10:05:00.000Z");
    expect(retry.operation.changed).toBe(false);
    await expect(
      service.request("owner", { ...creation, baseId: id(3), operationId: id(328) }),
    ).rejects.toThrow("clave de creación");
    expect(store.audits).toHaveLength(2);
  });

  it("blocks new writes after base removal while keeping completed replays and read-only history", async () => {
    const { service, store } = setup();
    const created = await service.request("owner", requestInput(28));
    const available = availableInput(created.period.id, 28);
    await service.markAvailable("owner", available);
    const open = await service.request("owner", requestInput(29));
    store.selected.clear();

    expect((await service.markAvailable("owner", available)).operation.replayed).toBe(true);
    await expect(
      service.markAvailable("owner", availableInput(open.period.id, 29)),
    ).rejects.toThrow(/base.*seleccionada/i);
    await expect(
      service.delete("owner", {
        periodId: open.period.id,
        expectedVersion: 1,
        operationId: id(230),
      }),
    ).rejects.toThrow(/base.*seleccionada/i);
    const rows = await service.listForGuard("owner", id(1));
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.canEdit === false)).toBe(true);
  });

  it("lists periods read-only for an admin and for a closed guard", async () => {
    const { service, store } = setup();
    await service.request("owner", requestInput(31));
    expect((await service.listForGuard("admin", id(1)))[0]).toMatchObject({ canEdit: false });
    expect((await service.listForGuard("owner", id(1)))[0]).toMatchObject({ canEdit: true });
    store.guard.endedAt = now;
    expect((await service.listForGuard("owner", id(1)))[0]).toMatchObject({ canEdit: false });
    await expect(service.listForGuard("revoked", id(1))).rejects.toThrow(
      "No se encontró la guardia",
    );
  });

  it("never lets a flagged not-informed period be edited", async () => {
    const { service, store } = setup();
    const created = await service.request("owner", requestInput(32));
    Object.assign(store.rows[0]!, { notInformed: true, version: 2 });
    const rows = await service.listForGuard("owner", id(1));
    expect(rows[0]).toMatchObject({ notInformed: true, availableAt: null, canEdit: false });
    await expect(
      service.markAvailable("owner", {
        ...availableInput(created.period.id, 32),
        expectedVersion: 2,
      }),
    ).rejects.toThrow("no informado");
    // A new request is allowed because a not-informed period no longer counts as open.
    await service.request("owner", requestInput(33));
  });
});
