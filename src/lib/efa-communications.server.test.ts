import { describe, expect, it } from "vitest";
import {
  createEfaCommunicationsService,
  type EfaCommunicationAuditRecord,
  type EfaCommunicationRecord,
  type EfaCommunicationTransaction,
} from "./efa-communications.server";
import {
  createEfaDispatchesService,
  type DispatchRecord,
  type DispatchStore,
  type DispatchTransaction,
} from "./efa-dispatches.server";

const owner = "owner";
const admin = "admin";
const revoked = "revoked";
const episodeId = "episode-1";
const preciseStart = "2026-10-06T09:30:12.345Z";

function createStore() {
  const actors = new Map([
    [owner, { isActive: true, roles: ["efa"] as Array<"efa" | "admin"> }],
    [admin, { isActive: true, roles: ["admin"] as Array<"efa" | "admin"> }],
    [revoked, { isActive: true, roles: [] as Array<"efa" | "admin"> }],
    ["disabled", { isActive: false, roles: ["efa"] as Array<"efa" | "admin"> }],
  ]);
  const episodes = new Map([
    [
      episodeId,
      {
        id: episodeId,
        ownerUserId: owner,
        originGuardClosed: true,
        cancelledAt: null as Date | null,
      },
    ],
    [
      "episode-other",
      {
        id: "episode-other",
        ownerUserId: "other",
        originGuardClosed: false,
        cancelledAt: null as Date | null,
      },
    ],
  ]);
  const communications: EfaCommunicationRecord[] = [];
  const audits: EfaCommunicationAuditRecord[] = [];
  const operations: Array<{
    id: string;
    communicationId: string;
    ownerUserId: string;
    actorUserId: string;
    clientOperationId: string;
    action: "created" | "updated" | "finalized" | "cancelled" | "reactivated";
    requestHash: string;
    appliedVersion: number;
    changed: boolean;
  }> = [];
  const notices: Array<{
    id: string;
    communicationId: string;
    ownerUserId: string;
    auditId: string;
    recipientUserId: string;
    createdAt: Date;
    readAt: Date | null;
  }> = [];
  let tail = Promise.resolve();
  let auditCount = 0;
  let noticeCount = 0;
  let failNextCas = false;
  const lockOrder: string[] = [];
  const detach = (record: EfaCommunicationRecord) => ({
    ...record,
    startedAt: record.startedAt && new Date(record.startedAt),
    endedAt: record.endedAt && new Date(record.endedAt),
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
    finalizedAt: record.finalizedAt && new Date(record.finalizedAt),
    cancelledAt: record.cancelledAt && new Date(record.cancelledAt),
  });
  const tx = {
    async findActor(userId: string) {
      return actors.get(userId) ?? null;
    },
    async findEpisode(id: string, lock = false) {
      if (lock) lockOrder.push("episode-lock");
      return episodes.get(id) ?? null;
    },
    async listCommunications(ownerUserId: string | null) {
      return communications
        .filter((item) => !ownerUserId || item.ownerUserId === ownerUserId)
        .map(detach);
    },
    async listCommunicationsForEpisode(episodeId: string) {
      return communications.filter((item) => item.episodeId === episodeId).map(detach);
    },
    async findCommunication(id: string, lock = false) {
      if (lock) lockOrder.push("communication-lock");
      const found = communications.find((item) => item.id === id);
      return found ? detach(found) : null;
    },
    async findCommunicationByCreationKey(ownerUserId: string, key: string) {
      lockOrder.push("creation-key-lookup");
      const found = communications.find(
        (item) => item.ownerUserId === ownerUserId && item.clientCreationKey === key,
      );
      return found ? detach(found) : null;
    },
    async findOperation(communicationId: string, operationId: string) {
      lockOrder.push("operation-lookup");
      return (
        operations.find(
          (item) =>
            item.communicationId === communicationId && item.clientOperationId === operationId,
        ) ?? null
      );
    },
    async currentTimestamp() {
      return new Date("2026-10-06T12:30:00.000Z");
    },
    async insertCommunication(
      input: Omit<
        EfaCommunicationRecord,
        "version" | "createdAt" | "updatedAt" | "finalizedAt" | "cancelledAt" | "cancelledFromState"
      >,
    ) {
      const now = new Date("2026-10-06T12:00:00.000Z");
      communications.push({
        ...input,
        version: 1,
        createdAt: now,
        updatedAt: now,
        finalizedAt: null,
        cancelledAt: null,
        cancelledFromState: null,
      });
    },
    async updateCommunication(
      id: string,
      expectedVersion: number,
      next: Pick<
        EfaCommunicationRecord,
        | "direction"
        | "startedAt"
        | "endedAt"
        | "priority"
        | "state"
        | "version"
        | "finalizedAt"
        | "cancelledAt"
        | "cancelledFromState"
      >,
    ) {
      if (failNextCas) {
        failNextCas = false;
        throw new Error("communication-version-conflict");
      }
      const found = communications.find((item) => item.id === id);
      if (!found || found.version !== expectedVersion)
        throw new Error("communication-version-conflict");
      Object.assign(found, next, { updatedAt: new Date("2026-10-06T13:00:00.000Z") });
    },
    async appendAudit(input: Parameters<EfaCommunicationTransaction["appendAudit"]>[0]) {
      const id = `audit-${++auditCount}`;
      audits.push({ ...input, id, occurredAt: new Date("2026-10-06T13:00:00.000Z") });
      return id;
    },
    async insertOperation(input: Omit<(typeof operations)[number], "id">) {
      operations.push({ ...input, id: `operation-${operations.length + 1}` });
    },
    async appendNotice(input: Parameters<EfaCommunicationTransaction["appendNotice"]>[0]) {
      notices.push({
        ...input,
        id: `notice-${++noticeCount}`,
        createdAt: new Date("2026-10-06T13:00:00.000Z"),
        readAt: null,
      });
    },
    async listAudits(communicationId: string) {
      return audits
        .filter((item) => item.communicationId === communicationId)
        .sort((left, right) => left.versionAfter - right.versionAfter);
    },
    async listNotices(recipientUserId: string) {
      return notices.filter((item) => item.recipientUserId === recipientUserId);
    },
    async markNoticeRead(noticeId: string, recipientUserId: string) {
      const found = notices.find(
        (item) => item.id === noticeId && item.recipientUserId === recipientUserId,
      );
      if (!found) return null;
      found.readAt ??= new Date("2026-10-06T14:00:00.000Z");
      return found;
    },
  } satisfies EfaCommunicationTransaction;

  return {
    store: {
      async transaction<T>(work: (value: EfaCommunicationTransaction) => Promise<T>) {
        const prior = tail;
        let release!: () => void;
        tail = new Promise<void>((resolve) => (release = resolve));
        await prior;
        try {
          return await work(tx);
        } finally {
          release();
        }
      },
    },
    communications,
    episodes,
    audits,
    operations,
    notices,
    lockOrder,
    revokeEfa(userId: string) {
      const actor = actors.get(userId)!;
      actors.set(userId, { ...actor, roles: [] });
    },
    failNextCas() {
      failNextCas = true;
    },
  };
}

const createInput = (overrides: Record<string, unknown> = {}) => ({
  clientCreationKey: "11111111-1111-4111-8111-111111111111",
  episodeId,
  direction: "incoming" as const,
  startedAt: preciseStart,
  endedAt: null,
  priority: null,
  ...overrides,
});

describe("EFA phone communication persistence", () => {
  it("cancels and reactivates a communication with its exact prior state and idempotent audit receipts", async () => {
    const db = createStore();
    let id = 0;
    const service = createEfaCommunicationsService(db.store, {
      newId: () => `communication-${++id}`,
    });
    const created = await service.create(owner, createInput());
    const input = {
      communicationId: created.communication.id,
      expectedVersion: 1,
      operationId: "34343434-3434-4434-8434-343434343434",
    };

    const cancelled = await service.cancel(owner, input);
    expect(cancelled.communication).toMatchObject({
      state: "cancelled",
      cancelledFromState: "draft",
      version: 2,
      canEdit: false,
      canManageLifecycle: true,
    });
    expect(db.communications).toHaveLength(1);
    expect(db.audits.at(-1)).toMatchObject({
      action: "cancelled",
      actorUserId: owner,
      versionBefore: 1,
      versionAfter: 2,
      beforeState: { state: "draft" },
      afterState: { state: "cancelled", cancelledFromState: "draft" },
    });
    await expect(
      service.update(owner, {
        communicationId: created.communication.id,
        expectedVersion: 2,
        operationId: "35353535-3535-4535-8535-353535353535",
        direction: "outgoing",
        startedAt: preciseStart,
        endedAt: null,
        priority: null,
      }),
    ).rejects.toThrow(/anulad/i);
    await expect(
      service.cancel(revoked, {
        communicationId: created.communication.id,
        expectedVersion: 2,
        operationId: "40404040-4040-4040-8040-404040404040",
      }),
    ).rejects.toThrow(/EFA/i);

    const replay = await service.cancel(owner, input);
    expect(replay.operation.replayed).toBe(true);
    expect(db.audits.filter((audit) => audit.action === "cancelled")).toHaveLength(1);
    const lockStart = db.lockOrder.length;
    const reactivated = await service.reactivate(owner, {
      ...input,
      expectedVersion: 2,
      operationId: "36363636-3636-4636-8636-363636363636",
    });
    expect(reactivated.communication).toMatchObject({
      state: "draft",
      cancelledFromState: null,
      version: 3,
    });
    expect(db.lockOrder.slice(lockStart, lockStart + 2)).toEqual([
      "episode-lock",
      "communication-lock",
    ]);
  });

  it("rejects new communications after the parent episode is cancelled", async () => {
    const db = createStore();
    let id = 0;
    const service = createEfaCommunicationsService(db.store, {
      newId: () => `communication-${++id}`,
    });
    db.episodes.get(episodeId)!.cancelledAt = new Date("2026-10-07T11:00:00.000Z");
    await expect(service.create(owner, createInput())).rejects.toThrow(/episodio anulado/i);
    expect(db.lockOrder[0]).toBe("episode-lock");
  });

  it("preserves finalized state on cancellation and sends admin corrections only to the original owner", async () => {
    const db = createStore();
    let id = 0;
    const service = createEfaCommunicationsService(db.store, {
      newId: () => `communication-${++id}`,
    });
    const created = await service.create(owner, createInput());
    const finalized = await service.finalize(owner, {
      communicationId: created.communication.id,
      expectedVersion: 1,
      operationId: "37373737-3737-4737-8737-373737373737",
      priority: "red",
    });
    const cancelled = await service.cancel(admin, {
      communicationId: finalized.communication.id,
      expectedVersion: 2,
      operationId: "38383838-3838-4838-8838-383838383838",
    });
    expect(cancelled.communication).toMatchObject({
      state: "cancelled",
      cancelledFromState: "finalized",
      priority: "red",
      finalizedAt: "2026-10-06T12:30:00.000Z",
    });
    expect(db.notices).toHaveLength(1);
    expect(db.notices[0]?.recipientUserId).toBe(owner);
    await expect(service.listNotices(admin)).resolves.toHaveLength(0);
    await expect(
      service.reactivate(admin, {
        communicationId: created.communication.id,
        expectedVersion: 3,
        operationId: "39393939-3939-4939-8939-393939393939",
      }),
    ).resolves.toMatchObject({ communication: { state: "finalized", version: 4 } });
    expect(db.communications).toHaveLength(1);
  });

  it("keeps actual times optional and precise, permits multiple calls, and finalizes independently", async () => {
    const db = createStore();
    let id = 0;
    const service = createEfaCommunicationsService(db.store, {
      newId: () => `communication-${++id}`,
    });
    const first = await service.create(owner, createInput());
    const second = await service.create(
      owner,
      createInput({
        clientCreationKey: "22222222-2222-4222-8222-222222222222",
        direction: "outgoing",
        startedAt: null,
        endedAt: "2026-10-06T10:45:09.876Z",
      }),
    );
    const third = await service.create(
      owner,
      createInput({
        clientCreationKey: "23232323-2323-4323-8323-232323232323",
        startedAt: "2026-10-06T10:45:12.345Z",
        endedAt: "2026-10-06T09:30:09.876Z",
      }),
    );

    const openDispatches: DispatchRecord[] = [];
    let dispatchId = 0;
    const dispatchTx = {
      async findActor() {
        return { isActive: true, roles: ["efa"] as const };
      },
      async findEpisode(id: string) {
        return id === episodeId ? { id, ownerUserId: owner } : null;
      },
      async findBase(id: string) {
        return { id, isActive: true };
      },
      async findCommunication() {
        return null;
      },
      async findDispatchByKey() {
        return null;
      },
      async findDispatchOperation() {
        return null;
      },
      async insertDispatch(
        input: Omit<DispatchRecord, "version" | "createdAt" | "updatedAt" | "finalizedAt">,
      ) {
        const timestamp = new Date("2026-10-06T10:00:00.000Z");
        openDispatches.push({
          ...input,
          version: 1,
          finalizedAt: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      },
      async appendDispatchAudit() {
        return "dispatch-audit";
      },
      async insertDispatchOperation() {},
      async findDispatch(id: string) {
        return openDispatches.find((dispatch) => dispatch.id === id) ?? null;
      },
      async listContactAttempts() {
        return [];
      },
      async listSupportRequests() {
        return [];
      },
    } as unknown as DispatchTransaction;
    const dispatchService = createEfaDispatchesService(
      { transaction: (work) => work(dispatchTx) } as DispatchStore,
      { newId: () => `open-dispatch-${++dispatchId}` },
    );
    const openDispatch = await dispatchService.create(owner, {
      clientCreationKey: "open-dispatch-key",
      episodeId,
      baseId: "active-base",
      t0At: preciseStart,
      t0Status: "observed",
    });

    expect(first.communication).toMatchObject({
      startedAt: preciseStart,
      endedAt: null,
      state: "draft",
    });
    expect(second.communication).toMatchObject({
      startedAt: null,
      endedAt: "2026-10-06T10:45:09.876Z",
    });
    expect(third.communication).toMatchObject({
      startedAt: "2026-10-06T10:45:12.345Z",
      endedAt: "2026-10-06T09:30:09.876Z",
    });
    const finalized = await service.finalize(owner, {
      communicationId: first.communication.id,
      expectedVersion: 1,
      operationId: "33333333-3333-4333-8333-333333333333",
      priority: "red",
    });
    expect(finalized.communication).toMatchObject({
      state: "finalized",
      priority: "red",
      endedAt: null,
      version: 2,
    });
    expect(finalized.communication.finalizedAt).toBe("2026-10-06T12:30:00.000Z");
    expect(await dispatchService.get(owner, openDispatch.dispatch.id)).toMatchObject({
      state: "draft",
      version: 1,
      t0At: preciseStart,
      t0Status: "observed",
      finalizedAt: null,
    });
    expect(db.audits.map(({ action }) => action)).toEqual([
      "created",
      "created",
      "created",
      "finalized",
    ]);
    expect(db.communications).toHaveLength(3);
    await expect(
      service.create(
        owner,
        createInput({
          clientCreationKey: "99999999-9999-4999-8999-999999999999",
          startedAt: null,
          endedAt: null,
        }),
      ),
    ).resolves.toMatchObject({ communication: { startedAt: null, endedAt: null, state: "draft" } });
  });

  it("allows an owner to read after EFA revocation but blocks inactive, revoked writes, and foreign episodes", async () => {
    const db = createStore();
    let id = 0;
    const service = createEfaCommunicationsService(db.store, {
      newId: () => `communication-${++id}`,
    });
    await service.create(owner, createInput());
    const adminCreated = await service.create(
      admin,
      createInput({
        episodeId: "episode-other",
        clientCreationKey: "24242424-2424-4424-8424-242424242424",
      }),
    );
    expect(adminCreated.communication.ownerUserId).toBe("other");
    expect(db.audits.at(-1)?.actorUserId).toBe(admin);
    await expect(service.list(admin)).resolves.toHaveLength(2);
    await expect(service.get(owner, adminCreated.communication.id)).rejects.toThrow(
      /comunicación/i,
    );
    await expect(service.list(revoked)).resolves.toHaveLength(0);
    await expect(
      service.create(owner, createInput({ episodeId: "episode-other" })),
    ).rejects.toThrow(/episodio/i);
    db.revokeEfa(owner);
    await expect(service.list(owner)).resolves.toMatchObject([{ canEdit: false }]);
    await expect(service.get(owner, "communication-1")).resolves.toMatchObject({ canEdit: false });
    await expect(service.history(owner, "communication-1")).resolves.toHaveLength(1);
    await expect(
      service.create(
        revoked,
        createInput({ clientCreationKey: "44444444-4444-4444-8444-444444444444" }),
      ),
    ).rejects.toThrow(/EFA/i);
    await expect(service.list("disabled")).rejects.toThrow(/inactiva/i);
  });

  it("lists only an authorized episode's calls for owners and administrators", async () => {
    const db = createStore();
    const service = createEfaCommunicationsService(db.store, {
      newId: (() => {
        let id = 0;
        return () => `communication-${++id}`;
      })(),
    });
    await service.create(owner, createInput());
    await service.create(
      admin,
      createInput({
        episodeId: "episode-other",
        clientCreationKey: "92929292-9292-4292-8292-929292929292",
      }),
    );

    await expect(service.listForEpisode(owner, episodeId)).resolves.toHaveLength(1);
    await expect(service.listForEpisode(admin, "episode-other")).resolves.toHaveLength(1);
    await expect(service.listForEpisode(owner, "episode-other")).rejects.toThrow(/episodio/i);
    db.revokeEfa(owner);
    await expect(service.listForEpisode(owner, episodeId)).resolves.toHaveLength(1);
  });

  it("preserves finalized state on edits, records exact snapshots, and rejects stale versions without receipts", async () => {
    const db = createStore();
    const service = createEfaCommunicationsService(db.store, { newId: () => "communication-1" });
    const created = await service.create(owner, createInput());
    const finalized = await service.finalize(owner, {
      communicationId: created.communication.id,
      expectedVersion: 1,
      operationId: "55555555-5555-4555-8555-555555555555",
      priority: "yellow",
    });
    const updated = await service.update(owner, {
      communicationId: created.communication.id,
      expectedVersion: finalized.communication.version,
      operationId: "66666666-6666-4666-8666-666666666666",
      direction: "outgoing",
      startedAt: preciseStart,
      endedAt: null,
      priority: "green",
    });
    expect(updated.communication).toMatchObject({
      state: "finalized",
      priority: "green",
      version: 3,
    });
    expect(updated.communication.finalizedAt).toBe(finalized.communication.finalizedAt);
    expect(db.audits[2]).toMatchObject({
      actorUserId: owner,
      operationId: "66666666-6666-4666-8666-666666666666",
      action: "updated",
      versionBefore: 2,
      versionAfter: 3,
      occurredAt: new Date("2026-10-06T13:00:00.000Z"),
      beforeState: {
        direction: "incoming",
        startedAt: preciseStart,
        endedAt: null,
        priority: "yellow",
        state: "finalized",
        finalizedAt: finalized.communication.finalizedAt,
      },
      afterState: {
        direction: "outgoing",
        startedAt: preciseStart,
        endedAt: null,
        priority: "green",
        state: "finalized",
        finalizedAt: finalized.communication.finalizedAt,
      },
    });
    expect(db.audits[1]).toMatchObject({
      actorUserId: owner,
      operationId: "55555555-5555-4555-8555-555555555555",
      action: "finalized",
      versionBefore: 1,
      versionAfter: 2,
      occurredAt: new Date("2026-10-06T13:00:00.000Z"),
      beforeState: {
        direction: "incoming",
        startedAt: preciseStart,
        endedAt: null,
        priority: null,
        state: "draft",
        finalizedAt: null,
      },
      afterState: {
        direction: "incoming",
        startedAt: preciseStart,
        endedAt: null,
        priority: "yellow",
        state: "finalized",
        finalizedAt: finalized.communication.finalizedAt,
      },
    });
    await expect(
      service.update(owner, {
        communicationId: created.communication.id,
        expectedVersion: 1,
        operationId: "77777777-7777-4777-8777-777777777777",
        direction: "incoming",
        startedAt: null,
        endedAt: null,
        priority: null,
      }),
    ).rejects.toThrow(/cambió/i);
    expect(db.operations).toHaveLength(3);
    expect(db.audits).toHaveLength(3);
  });

  it("replays creation receipts after later edits without duplicating a communication or audit", async () => {
    const db = createStore();
    const service = createEfaCommunicationsService(db.store, { newId: () => "communication-1" });
    const created = await service.create(owner, createInput());
    await service.update(owner, {
      communicationId: created.communication.id,
      expectedVersion: 1,
      operationId: "12121212-1212-4212-8212-121212121212",
      direction: "outgoing",
      startedAt: preciseStart,
      endedAt: null,
      priority: null,
    });
    const replayed = await service.create(owner, createInput());
    expect(replayed.operation).toMatchObject({ appliedVersion: 1, changed: true, replayed: true });
    expect(replayed.communication).toMatchObject({
      id: created.communication.id,
      direction: "outgoing",
      version: 2,
    });
    expect(db.communications).toHaveLength(1);
    expect(db.audits).toHaveLength(2);
  });

  it("serializes identical concurrent create requests through the stable creation key", async () => {
    const db = createStore();
    let id = 0;
    const service = createEfaCommunicationsService(db.store, {
      newId: () => `communication-${++id}`,
    });
    const [first, second] = await Promise.all([
      service.create(owner, createInput()),
      service.create(owner, createInput()),
    ]);
    expect(first.communication.id).toBe(second.communication.id);
    expect([first.operation.replayed, second.operation.replayed].sort()).toEqual([false, true]);
    expect(db.communications).toHaveLength(1);
    expect(db.audits).toHaveLength(1);
    expect(db.operations).toHaveLength(1);
    expect(db.operations[0]?.requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(db.operations[0] ?? {})).not.toContain("address");
  });

  it("locks the owning episode before duplicate creation lookup and communication before receipt lookup", async () => {
    const db = createStore();
    const service = createEfaCommunicationsService(db.store, { newId: () => "communication-1" });
    const created = await service.create(owner, createInput());
    expect(db.lockOrder.slice(0, 2)).toEqual(["episode-lock", "creation-key-lookup"]);

    const beforeUpdate = db.lockOrder.length;
    await service.update(owner, {
      communicationId: created.communication.id,
      expectedVersion: 1,
      operationId: "17171717-1717-4717-8717-171717171717",
      direction: "outgoing",
      startedAt: preciseStart,
      endedAt: null,
      priority: null,
    });
    expect(db.lockOrder.slice(beforeUpdate, beforeUpdate + 2)).toEqual([
      "communication-lock",
      "operation-lookup",
    ]);
  });

  it("records no-op update and finalization receipts without fake versions, then replays original applied versions", async () => {
    const db = createStore();
    const service = createEfaCommunicationsService(db.store, { newId: () => "communication-1" });
    const created = await service.create(owner, createInput());
    const noOpUpdate = {
      communicationId: created.communication.id,
      expectedVersion: 1,
      operationId: "13131313-1313-4313-8313-131313131313",
      direction: "incoming" as const,
      startedAt: preciseStart,
      endedAt: null,
      priority: null,
    };
    const updateReceipt = await service.update(owner, noOpUpdate);
    expect(updateReceipt.operation).toMatchObject({
      appliedVersion: 1,
      changed: false,
      replayed: false,
    });
    expect(db.audits).toHaveLength(1);
    expect(db.notices).toHaveLength(0);

    const finalized = await service.finalize(owner, {
      communicationId: created.communication.id,
      expectedVersion: 1,
      operationId: "14141414-1414-4414-8414-141414141414",
      priority: "red",
    });
    const noOpFinalize = {
      communicationId: created.communication.id,
      expectedVersion: finalized.communication.version,
      operationId: "15151515-1515-4515-8515-151515151515",
      priority: "red" as const,
    };
    const finalizeReceipt = await service.finalize(owner, noOpFinalize);
    expect(finalizeReceipt.operation).toMatchObject({
      appliedVersion: 2,
      changed: false,
      replayed: false,
    });
    expect(db.audits).toHaveLength(2);
    await service.update(owner, {
      communicationId: created.communication.id,
      expectedVersion: 2,
      operationId: "16161616-1616-4616-8616-161616161616",
      direction: "incoming",
      startedAt: preciseStart,
      endedAt: null,
      priority: "yellow",
    });
    const replayedFinalize = await service.finalize(owner, noOpFinalize);
    expect(replayedFinalize.operation).toMatchObject({
      appliedVersion: 2,
      changed: false,
      replayed: true,
    });
    expect(replayedFinalize.communication).toMatchObject({
      version: 3,
      priority: "yellow",
      state: "finalized",
    });
    expect(db.audits).toHaveLength(3);
    expect(db.operations).toHaveLength(5);
    await expect(service.update(owner, { ...noOpUpdate, direction: "outgoing" })).rejects.toThrow(
      /identidad/i,
    );
    await expect(service.finalize(owner, { ...noOpFinalize, priority: "green" })).rejects.toThrow(
      /identidad/i,
    );
  });

  it("keeps administrator corrections under the original owner and scopes private notices to that owner", async () => {
    const db = createStore();
    const service = createEfaCommunicationsService(db.store, { newId: () => "communication-1" });
    const created = await service.create(owner, createInput());
    const correction = {
      communicationId: created.communication.id,
      expectedVersion: 1,
      operationId: "88888888-8888-4888-8888-888888888888",
      direction: "outgoing" as const,
      startedAt: preciseStart,
      endedAt: null,
      priority: null,
    };
    const changed = await service.update(admin, correction);
    const replayed = await service.update(admin, correction);
    expect(changed.communication.ownerUserId).toBe(owner);
    expect(replayed.operation.replayed).toBe(true);
    expect(db.audits.at(-1)).toMatchObject({
      actorUserId: admin,
      operationId: correction.operationId,
      action: "updated",
      versionBefore: 1,
      versionAfter: 2,
      occurredAt: new Date("2026-10-06T13:00:00.000Z"),
      beforeState: {
        direction: "incoming",
        startedAt: preciseStart,
        endedAt: null,
        priority: null,
        state: "draft",
        finalizedAt: null,
      },
      afterState: {
        direction: "outgoing",
        startedAt: preciseStart,
        endedAt: null,
        priority: null,
        state: "draft",
        finalizedAt: null,
      },
    });
    expect(db.notices).toHaveLength(1);
    const noOp = await service.update(admin, {
      ...correction,
      expectedVersion: 2,
      operationId: "89898989-8989-4989-8989-898989898989",
    });
    expect(noOp.operation.changed).toBe(false);
    expect(db.audits).toHaveLength(2);
    expect(db.notices).toHaveLength(1);
    await expect(service.listNotices(owner)).resolves.toHaveLength(1);
    await expect(service.listNotices(admin)).resolves.toHaveLength(0);
    await expect(service.markNoticeRead(admin, db.notices[0]!.id)).rejects.toThrow(/aviso/i);
    const read = await service.markNoticeRead(owner, db.notices[0]!.id);
    expect(await service.markNoticeRead(owner, db.notices[0]!.id)).toEqual(read);
    expect(Object.keys(read)).toEqual(["id", "communicationId", "createdAt", "readAt"]);
  });

  it("does not append a finalization audit or owner notice when the versioned update fails", async () => {
    const db = createStore();
    const service = createEfaCommunicationsService(db.store, { newId: () => "communication-1" });
    const created = await service.create(owner, createInput());
    db.failNextCas();

    await expect(
      service.finalize(admin, {
        communicationId: created.communication.id,
        expectedVersion: 1,
        operationId: "91919191-9191-4191-8191-919191919191",
        priority: "red",
      }),
    ).rejects.toThrow(/version-conflict/i);

    expect(db.audits).toHaveLength(1);
    expect(db.audits[0]?.action).toBe("created");
    expect(db.notices).toHaveLength(0);
    expect(db.operations).toHaveLength(1);
    expect(db.communications[0]).toMatchObject({ state: "draft", version: 1 });
  });
});
