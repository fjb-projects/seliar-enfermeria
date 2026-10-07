import { describe, expect, it } from "vitest";
import {
  createEfaObservationService,
  omitObservationDatabaseTimestamps,
  type ObservationRecord,
  type ObservationStore,
  type ObservationTransaction,
} from "./efa-observations.server";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
class FakeStore implements ObservationStore {
  actors = new Map<string, { isActive: boolean; roles: ("efa" | "admin")[] }>([
    ["owner", { isActive: true, roles: ["efa"] }],
    ["revoked", { isActive: true, roles: [] }],
    ["admin", { isActive: true, roles: ["admin"] }],
  ]);
  guard = { id: id(1), ownerUserId: "owner", endedAt: null as Date | null };
  episode = { id: id(2), ownerUserId: "owner", originGuardId: id(1) };
  communication = { id: id(3), ownerUserId: "owner", episodeId: id(2) };
  rows: ObservationRecord[] = [];
  audits: Array<Record<string, unknown>> = [];
  operations: Array<Record<string, unknown>> = [];
  notices: Array<{
    id: string;
    observationId: string;
    createdAt: Date;
    readAt: Date | null;
    recipient: string;
  }> = [];
  async transaction<T>(work: (tx: ObservationTransaction) => Promise<T>) {
    const tx: ObservationTransaction = {
      findActor: async (key) => this.actors.get(key) ?? null,
      findGuard: async (key) => (key === this.guard.id ? this.guard : null),
      findEpisode: async (key) => (key === this.episode.id ? this.episode : null),
      findCommunication: async (key) => (key === this.communication.id ? this.communication : null),
      findDispatch: async () => null,
      findCoordination: async () => null,
      findPoliceEvent: async () => null,
      findCatalogItem: async (key) =>
        key === "phone.early_location"
          ? {
              key,
              label: "Ubicación temprana",
              group: "phone",
              competencyReference: null,
              isActive: true,
            }
          : null,
      listCatalog: async () => [
        {
          key: "phone.early_location",
          label: "Ubicación temprana",
          group: "phone",
          competencyReference: null,
          isActive: true,
        },
      ],
      findObservation: async (key) => {
        const row = this.rows.find((item) => item.id === key);
        return row
          ? {
              ...row,
              observedAt: row.observedAt && new Date(row.observedAt),
              createdAt: new Date(row.createdAt),
              updatedAt: new Date(row.updatedAt),
            }
          : null;
      },
      findByCreation: async (owner, key) => {
        const row = this.rows.find(
          (item) => item.ownerUserId === owner && item.clientCreationKey === key,
        );
        return row
          ? {
              ...row,
              observedAt: row.observedAt && new Date(row.observedAt),
              createdAt: new Date(row.createdAt),
              updatedAt: new Date(row.updatedAt),
            }
          : null;
      },
      findOperation: async (obs, op) =>
        (this.operations.find(
          (row) => row["observationId"] === obs && row["clientOperationId"] === op,
        ) as never) ?? null,
      listForGuard: async (key) => this.rows.filter((row) => row.guardId === key),
      listForEpisode: async (key) => this.rows.filter((row) => row.episodeId === key),
      listAudit: async (key) => this.audits.filter((row) => row["observationId"] === key) as never,
      listNotices: async (userId) => this.notices.filter((item) => item.recipient === userId),
      insertObservation: async (record) => {
        this.rows.push({ ...record, createdAt: new Date(), updatedAt: new Date() });
      },
      updateObservation: async (key, version, fields) => {
        const row = this.rows.find((item) => item.id === key);
        if (!row || row.version !== version) throw new Error("CAS conflict");
        Object.assign(row, fields, { updatedAt: new Date() });
      },
      appendAudit: async (record) => {
        const auditId = id(this.audits.length + 20);
        this.audits.push({ ...record, id: auditId, occurredAt: new Date() });
        return auditId;
      },
      insertOperation: async (record) => {
        this.operations.push(record);
      },
      appendNotice: async (record) => {
        this.notices.push({
          ...record,
          id: id(this.notices.length + 40),
          createdAt: new Date(),
          readAt: null,
          recipient: record.recipientUserId,
        });
      },
      markNoticeRead: async (key, userId) => {
        const item = this.notices.find(
          (notice) => notice.id === key && notice.recipient === userId,
        );
        if (!item) return null;
        item.readAt ??= new Date();
        return item;
      },
    };
    return work(tx);
  }
}
const setup = () => {
  const store = new FakeStore();
  return { store, service: createEfaObservationService(store, { newId: () => id(10) }) };
};
const createInput = (op: number, extra: Record<string, unknown> = {}) => ({
  contextType: "guard" as const,
  guardId: id(1),
  clientCreationKey: id(op),
  operationId: id(op + 100),
  catalogItemKey: "phone.early_location",
  classification: "adequate" as const,
  ...extra,
});

describe("EFA anonymous conduct observations", () => {
  it("requires a local description for other conduct and preserves omitted fields on partial updates", async () => {
    const { store, service } = setup();
    await expect(
      service.create("owner", { ...createInput(2), catalogItemKey: "other" }),
    ).rejects.toThrow("descripción");
    const created = await service.create(
      "owner",
      createInput(3, { observedAt: "2026-10-07T10:11:12.345Z", comment: "Initial note" }),
    );
    const updated = await service.update("owner", {
      observationId: created.observation.id,
      expectedVersion: 1,
      operationId: id(104),
      comment: "Corrected note",
    });
    expect(updated.observation.observedAt).toBe("2026-10-07T10:11:12.345Z");
    expect(updated.observation.comment).toBe("Corrected note");
    expect(store.audits.at(-1)).toMatchObject({ versionBefore: 1, versionAfter: 2 });
    expect(store.rows[0]?.createdAt.getTime()).not.toBe(0);
  });

  it("allows own history after EFA revocation, blocks writes, and notices the owner after admin correction", async () => {
    const { service, store } = setup();
    const created = await service.create("owner", createInput(4));
    store.actors.set("owner", { isActive: true, roles: [] });
    expect((await service.get("owner", created.observation.id)).canEdit).toBe(false);
    await expect(
      service.update("owner", {
        observationId: created.observation.id,
        expectedVersion: 1,
        operationId: id(105),
        comment: "No",
      }),
    ).rejects.toThrow("EFA vigente");
    await service.update("admin", {
      observationId: created.observation.id,
      expectedVersion: 1,
      operationId: id(106),
      classification: "needs_improvement",
    });
    expect(store.notices).toHaveLength(1);
    expect(store.audits.at(-1)).toMatchObject({
      actorUserId: "admin",
      versionBefore: 1,
      versionAfter: 2,
    });
  });

  it("allows repeated observations for one item without converting absence into a negative record", async () => {
    let sequence = 10;
    const store = new FakeStore();
    const service = createEfaObservationService(store, { newId: () => id(sequence++) });
    const first = await service.create("owner", createInput(5));
    const second = await service.create("owner", createInput(6, { observedAt: null }));
    expect(first.observation.id).not.toBe(second.observation.id);
    expect(second.observation.observedAt).toBeNull();
    expect(store.rows).toHaveLength(2);
    expect(await service.listForGuard("owner", id(1))).toHaveLength(2);
  });

  it("revalidates complete parent ancestry and replays a confirmed create after guard closure", async () => {
    let sequence = 10;
    const store = new FakeStore();
    const service = createEfaObservationService(store, { newId: () => id(sequence++) });
    const input = {
      ...createInput(7),
      contextType: "communication" as const,
      episodeId: id(2),
      communicationId: id(3),
    };
    const created = await service.create("owner", input);
    await expect(
      service.create("owner", {
        ...createInput(8),
        contextType: "communication",
        episodeId: id(2),
        communicationId: id(999),
      }),
    ).rejects.toThrow("llamada");
    store.guard.endedAt = new Date();
    const replay = await service.create("owner", input);
    expect(replay.operation.replayed).toBe(true);
    expect(replay.observation.id).toBe(created.observation.id);
    expect(store.rows).toHaveLength(1);
  });

  it("keeps DB timestamp defaults out of inserts and records no-op operations without fake versions", async () => {
    const input = { id: id(1), createdAt: new Date(0), updatedAt: new Date(0), value: "x" };
    expect(omitObservationDatabaseTimestamps(input)).toEqual({ id: id(1), value: "x" });
    const { service, store } = setup();
    const created = await service.create("owner", createInput(9));
    const result = await service.update("owner", {
      observationId: created.observation.id,
      expectedVersion: 1,
      operationId: id(119),
      comment: null,
    });
    expect(result.operation).toMatchObject({ appliedVersion: 1, changed: false });
    expect(store.audits).toHaveLength(1);
    expect(
      (
        await service.update("owner", {
          observationId: created.observation.id,
          expectedVersion: 1,
          operationId: id(119),
          comment: null,
        })
      ).operation.replayed,
    ).toBe(true);
  });

  it("updates only an other-conduct group with an admin audit and stable replay", async () => {
    let sequence = 10;
    const store = new FakeStore();
    const service = createEfaObservationService(store, { newId: () => id(sequence++) });
    const catalogBacked = await service.create("owner", createInput(11));
    await expect(
      service.update("owner", {
        observationId: catalogBacked.observation.id,
        expectedVersion: 1,
        operationId: id(211),
        otherGroup: "radio",
      }),
    ).rejects.toThrow("solo se puede definir para otra conducta");
    const created = await service.create(
      "owner",
      createInput(10, {
        catalogItemKey: "other",
        otherGroup: "phone",
        otherDescription: "Conducta local",
        comment: "Contexto conservado",
        observedAt: "2026-10-07T10:11:12.345Z",
      }),
    );
    const input = {
      observationId: created.observation.id,
      expectedVersion: 1,
      operationId: id(210),
      otherGroup: "radio" as const,
    };

    const corrected = await service.update("admin", input);

    expect(corrected.observation).toMatchObject({
      catalogItemKey: null,
      catalogGroupSnapshot: "radio",
      otherDescription: "Conducta local",
      classification: "adequate",
      comment: "Contexto conservado",
      observedAt: "2026-10-07T10:11:12.345Z",
      version: 2,
    });
    expect(store.audits.at(-1)).toMatchObject({
      actorUserId: "admin",
      versionBefore: 1,
      versionAfter: 2,
      beforeState: expect.objectContaining({ catalogGroupSnapshot: "phone" }),
      afterState: expect.objectContaining({ catalogGroupSnapshot: "radio" }),
    });
    expect(store.notices).toHaveLength(1);

    const replay = await service.update("admin", input);

    expect(replay.operation.replayed).toBe(true);
    expect(replay.operation.appliedVersion).toBe(2);
    expect(store.audits).toHaveLength(3);
    expect(store.notices).toHaveLength(1);
  });
});
