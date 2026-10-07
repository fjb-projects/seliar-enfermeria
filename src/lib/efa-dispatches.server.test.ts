import { describe, expect, it } from "vitest";
import { normalizeConfirmedDispatch } from "./efa-dispatches.client";
import {
  createEfaDispatchesService,
  type DispatchAudit,
  type DispatchOperation,
  type DispatchRecord,
  type DispatchStore,
  type DispatchTransaction,
  type SupportOperation,
  type SupportRequestRecord,
} from "./efa-dispatches.server";

const owner = "owner";
const admin = "admin";
const revoked = "revoked";
const episodeId = "episode-1";
const baseId = "base-1";
const callId = "call-1";
const time = "2026-10-06T09:30:12.345Z";

function makeStore() {
  const actors = new Map([
    [owner, { isActive: true, roles: ["efa"] as Array<"efa" | "admin"> }],
    [admin, { isActive: true, roles: ["admin"] as Array<"efa" | "admin"> }],
    [revoked, { isActive: true, roles: [] as Array<"efa" | "admin"> }],
    ["disabled", { isActive: false, roles: ["efa"] as Array<"efa" | "admin"> }],
  ]);
  const episodes = new Map([[episodeId, { id: episodeId, ownerUserId: owner }]]);
  const bases = new Map([[baseId, { id: baseId, isActive: true }]]);
  const institutions = new Map([
    ["institution-active", { id: "institution-active", name: "Hospital Central", isActive: true }],
    [
      "institution-inactive",
      { id: "institution-inactive", name: "Hospital Histórico", isActive: false },
    ],
  ]);
  const calls = new Map<
    string,
    {
      id: string;
      episodeId: string;
      ownerUserId: string;
      priority: "red" | "yellow" | "green" | null;
      state: "draft" | "finalized" | "cancelled";
    }
  >([
    [
      callId,
      {
        id: callId,
        episodeId,
        ownerUserId: owner,
        priority: "red" as const,
        state: "finalized" as const,
      },
    ],
  ]);
  const dispatches: DispatchRecord[] = [];
  const audits: DispatchAudit[] = [];
  const operations: DispatchOperation[] = [];
  const supportRequests: SupportRequestRecord[] = [];
  const supportAudits: Array<Omit<DispatchAudit, "dispatchId"> & { supportRequestId: string }> = [];
  const supportOperations: SupportOperation[] = [];
  const dispatchNotices: Array<{
    id: string;
    dispatchId: string;
    createdAt: Date;
    readAt: Date | null;
    recipientUserId: string;
  }> = [];
  const supportNotices: Array<{
    id: string;
    supportRequestId: string;
    createdAt: Date;
    readAt: Date | null;
    recipientUserId: string;
  }> = [];
  const contactAttempts: Array<{
    id: string;
    dispatchId: string;
    ownerUserId: string;
    actorUserId: string;
    clientEventId: string;
    occurredAt: Date;
    note: string | null;
    createdAt: Date;
  }> = [];
  let id = 0;
  let failNextDispatchCas = false;
  let failNextSupportCas = false;
  const communicationLockTails = new Map<string, Promise<void>>();
  const communicationReads: Array<{ id: string; lock: boolean }> = [];
  let beforeNextDispatchInsert: (() => Promise<void>) | null = null;
  const now = () => new Date("2026-10-06T10:00:00.000Z");
  const detach = <T extends { [key: string]: unknown }>(record: T): T => structuredClone(record);
  const acquireCommunicationLock = async (communicationId: string) => {
    const previous = communicationLockTails.get(communicationId) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => (release = resolve));
    communicationLockTails.set(
      communicationId,
      previous.then(() => next),
    );
    await previous;
    return release;
  };
  const tx: DispatchTransaction = {
    async findActor(userId) {
      return actors.get(userId) ?? null;
    },
    async findEpisode(id) {
      return episodes.get(id) ?? null;
    },
    async findBase(id) {
      return bases.get(id) ?? null;
    },
    async findInstitution(id) {
      return institutions.get(id) ?? null;
    },
    async findCommunication(id) {
      return calls.get(id) ?? null;
    },
    async listDispatches(id) {
      return dispatches.filter((record) => record.episodeId === id).map(detach);
    },
    async findDispatch(id) {
      const item = dispatches.find((record) => record.id === id);
      return item ? detach(item) : null;
    },
    async findDispatchByKey(userId, key) {
      const item = dispatches.find(
        (record) => record.ownerUserId === userId && record.clientCreationKey === key,
      );
      return item ? detach(item) : null;
    },
    async findDispatchOperation(dispatchId, key) {
      return (
        operations.find(
          (item) => item.dispatchId === dispatchId && item.clientOperationId === key,
        ) ?? null
      );
    },
    async insertDispatch(input) {
      dispatches.push({
        ...input,
        version: 1,
        finalizedAt: null,
        cancelledAt: null,
        cancelledFromState: null,
        createdAt: now(),
        updatedAt: now(),
      });
    },
    async updateDispatch(id, version, next) {
      if (failNextDispatchCas) {
        failNextDispatchCas = false;
        throw new Error("version conflict");
      }
      const item = dispatches.find((record) => record.id === id);
      if (!item || item.version !== version) throw new Error("version conflict");
      Object.assign(item, next, { updatedAt: now() });
    },
    async appendDispatchAudit(input) {
      const audit = { ...input, id: `audit-${++id}`, occurredAt: now() };
      audits.push(audit);
      return audit.id;
    },
    async insertDispatchOperation(input) {
      operations.push({ ...input, id: `operation-${++id}` });
    },
    async listDispatchAudits(id) {
      return audits.filter((item) => item.dispatchId === id).map(detach);
    },
    async listDispatchNotices(userId) {
      return dispatchNotices
        .filter((item) => item.recipientUserId === userId)
        .map(({ id, dispatchId, createdAt, readAt }) => ({ id, dispatchId, createdAt, readAt }));
    },
    async appendDispatchNotice(input) {
      dispatchNotices.push({ ...input, id: `notice-${++id}`, createdAt: now(), readAt: null });
    },
    async markDispatchNoticeRead(noticeId, recipient) {
      const item = dispatchNotices.find(
        (notice) => notice.id === noticeId && notice.recipientUserId === recipient,
      );
      if (!item) return null;
      item.readAt ??= now();
      return item;
    },
    async findContactAttempt(dispatchId, eventId) {
      return (
        contactAttempts.find(
          (item) => item.dispatchId === dispatchId && item.clientEventId === eventId,
        ) ?? null
      );
    },
    async insertContactAttempt(input) {
      contactAttempts.push({ ...input, createdAt: now() });
    },
    async listContactAttempts(dispatchId) {
      return contactAttempts.filter((item) => item.dispatchId === dispatchId).map(detach);
    },
    async listSupportRequests(id) {
      return supportRequests.filter((item) => item.episodeId === id).map(detach);
    },
    async findSupportRequest(id) {
      const item = supportRequests.find((record) => record.id === id);
      return item ? detach(item) : null;
    },
    async findSupportByKey(userId, key) {
      const item = supportRequests.find(
        (record) => record.ownerUserId === userId && record.clientCreationKey === key,
      );
      return item ? detach(item) : null;
    },
    async findSupportOperation(requestId, key) {
      return (
        supportOperations.find(
          (item) => item.supportRequestId === requestId && item.clientOperationId === key,
        ) ?? null
      );
    },
    async insertSupportRequest(input) {
      supportRequests.push({ ...input, version: 1, createdAt: now(), updatedAt: now() });
    },
    async updateSupportRequest(id, version, next) {
      if (failNextSupportCas) {
        failNextSupportCas = false;
        throw new Error("version conflict");
      }
      const item = supportRequests.find((record) => record.id === id);
      if (!item || item.version !== version) throw new Error("version conflict");
      Object.assign(item, next, { updatedAt: now() });
    },
    async appendSupportAudit(input) {
      const audit = { ...input, id: `support-audit-${++id}`, occurredAt: now() };
      supportAudits.push(audit);
      return audit.id;
    },
    async insertSupportOperation(input) {
      supportOperations.push({ ...input, id: `support-operation-${++id}` });
    },
    async listSupportAudits(id) {
      return supportAudits.filter((item) => item.supportRequestId === id).map(detach);
    },
    async appendSupportNotice(input) {
      supportNotices.push({
        ...input,
        id: `support-notice-${++id}`,
        createdAt: now(),
        readAt: null,
      });
    },
    async listSupportNotices(userId) {
      return supportNotices
        .filter((item) => item.recipientUserId === userId)
        .map(({ id, supportRequestId, createdAt, readAt }) => ({
          id,
          supportRequestId,
          createdAt,
          readAt,
        }));
    },
    async markSupportNoticeRead(noticeId, recipient) {
      const item = supportNotices.find(
        (notice) => notice.id === noticeId && notice.recipientUserId === recipient,
      );
      if (!item) return null;
      item.readAt ??= now();
      return item;
    },
    async currentTimestamp() {
      return now();
    },
  };
  const store: DispatchStore = {
    async transaction<T>(work: (value: DispatchTransaction) => Promise<T>) {
      const releases: Array<() => void> = [];
      const transaction = {
        ...tx,
        async findCommunication(communicationId: string, lock = false) {
          communicationReads.push({ id: communicationId, lock });
          if (lock) releases.push(await acquireCommunicationLock(communicationId));
          return calls.get(communicationId) ?? null;
        },
        async insertDispatch(input: Parameters<DispatchTransaction["insertDispatch"]>[0]) {
          const pause = beforeNextDispatchInsert;
          beforeNextDispatchInsert = null;
          if (pause) await pause();
          return tx.insertDispatch(input);
        },
      } satisfies DispatchTransaction;
      try {
        return await work(transaction);
      } finally {
        releases.reverse().forEach((release) => release());
      }
    },
  };
  return {
    store,
    failDispatchCas: () => {
      failNextDispatchCas = true;
    },
    failSupportCas: () => {
      failNextSupportCas = true;
    },
    actors,
    bases,
    institutions,
    calls,
    communicationReads,
    holdNextDispatchInsert() {
      let entered!: () => void;
      let continueInsert!: () => void;
      const reached = new Promise<void>((resolve) => (entered = resolve));
      const gate = new Promise<void>((resolve) => (continueInsert = resolve));
      beforeNextDispatchInsert = async () => {
        entered();
        await gate;
      };
      return { reached, continue: continueInsert };
    },
    async cancelCommunication(id: string) {
      const release = await acquireCommunicationLock(id);
      try {
        const communication = calls.get(id);
        if (communication) calls.set(id, { ...communication, state: "cancelled" });
      } finally {
        release();
      }
    },
    dispatches,
    audits,
    operations,
    supportRequests,
    supportAudits,
    supportOperations,
    contactAttempts,
    dispatchNotices,
    supportNotices,
    service: createEfaDispatchesService(store, { newId: () => `id-${++id}` }),
  };
}

describe("EFA dispatch service", () => {
  it("cancels and restores a dispatch without changing its result, timestamps, or relationships", async () => {
    const fixture = makeStore();
    const created = await fixture.service.create(owner, {
      clientCreationKey: "cancel-dispatch-create",
      episodeId,
      baseId,
      communicationId: callId,
      institutionId: "institution-active",
      t0At: time,
      t0Status: "observed",
    });
    const finalized = await fixture.service.finalize(owner, {
      dispatchId: created.dispatch.id,
      expectedVersion: 1,
      operationId: "cancel-dispatch-finalize",
      priority: "red",
      result: "cancelled",
    });
    const operationBeforeCancel = "dispatch-cancel-1";
    fixture.failDispatchCas();
    await expect(
      fixture.service.cancel(owner, {
        dispatchId: created.dispatch.id,
        expectedVersion: 2,
        operationId: operationBeforeCancel,
      }),
    ).rejects.toThrow("version conflict");
    expect(fixture.audits).toHaveLength(2);
    const cancelled = await fixture.service.cancel(owner, {
      dispatchId: created.dispatch.id,
      expectedVersion: 2,
      operationId: operationBeforeCancel,
    });
    expect(cancelled.dispatch).toMatchObject({
      state: "cancelled",
      cancelledFromState: "finalized",
      finalizedAt: finalized.dispatch.finalizedAt,
      result: "cancelled",
      t0At: time,
      communicationId: callId,
      institutionId: "institution-active",
      version: 3,
      canEdit: false,
      canManage: true,
    });
    expect((await fixture.service.listForEpisode(owner, episodeId))[0]).toMatchObject({
      state: "cancelled",
      communicationId: callId,
      institutionId: "institution-active",
    });
    const replay = await fixture.service.cancel(owner, {
      dispatchId: created.dispatch.id,
      expectedVersion: 2,
      operationId: "dispatch-cancel-1",
    });
    expect(replay.operation.replayed).toBe(true);
    const restored = await fixture.service.reactivate(owner, {
      dispatchId: created.dispatch.id,
      expectedVersion: 3,
      operationId: "dispatch-reactivate-1",
    });
    expect(restored.dispatch).toMatchObject({
      state: "finalized",
      cancelledAt: null,
      cancelledFromState: null,
      finalizedAt: finalized.dispatch.finalizedAt,
      result: "cancelled",
      communicationId: callId,
      institutionId: "institution-active",
      version: 4,
    });
    expect(fixture.audits.slice(-2).map((item) => item.action)).toEqual([
      "cancelled",
      "reactivated",
    ]);
  });

  it("rejects a cancelled communication as a new dispatch origin but preserves an existing link for edits", async () => {
    const fixture = makeStore();
    const created = await fixture.service.create(owner, {
      clientCreationKey: "dispatch-from-call-before-cancel",
      episodeId,
      baseId,
      communicationId: callId,
    });
    fixture.calls.set(callId, {
      id: callId,
      episodeId,
      ownerUserId: owner,
      priority: "red",
      state: "cancelled",
    });
    await expect(
      fixture.service.create(owner, {
        clientCreationKey: "dispatch-from-call-after-cancel",
        episodeId,
        baseId,
        communicationId: callId,
      }),
    ).rejects.toThrow(/anulada|anulad/i);
    await fixture.service.update(owner, {
      dispatchId: created.dispatch.id,
      expectedVersion: 1,
      operationId: "edit-existing-cancelled-call-link",
      baseId,
      note: "Edición no relacionada",
    });
    expect(fixture.dispatches[0]?.communicationId).toBe(callId);
    expect(fixture.communicationReads.at(-1)).toEqual({ id: callId, lock: false });
  });

  it("serializes a new dispatch origin check against concurrent communication cancellation", async () => {
    const fixture = makeStore();
    const insertGate = fixture.holdNextDispatchInsert();
    const creating = fixture.service.create(owner, {
      clientCreationKey: "dispatch-origin-lock-race",
      episodeId,
      baseId,
      communicationId: callId,
    });
    await insertGate.reached;
    const cancelling = fixture.cancelCommunication(callId);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const stateWhileCreateIsUncommitted = fixture.calls.get(callId)?.state;
    insertGate.continue();
    const created = await creating;
    await cancelling;
    expect(fixture.communicationReads).toContainEqual({ id: callId, lock: true });
    expect(stateWhileCreateIsUncommitted).toBe("finalized");
    expect(created.dispatch.communicationId).toBe(callId);
    expect(fixture.calls.get(callId)?.state).toBe("cancelled");
  });

  it("requires current owner/admin authority and notifies only the original owner for admin cancellation", async () => {
    const fixture = makeStore();
    const created = await fixture.service.create(owner, {
      clientCreationKey: "dispatch-admin-cancel-create",
      episodeId,
      baseId,
    });
    fixture.actors.set(owner, { isActive: true, roles: [] });
    await expect(
      fixture.service.cancel(owner, {
        dispatchId: created.dispatch.id,
        expectedVersion: 1,
        operationId: "dispatch-owner-revoked-cancel",
      }),
    ).rejects.toThrow("acceso EFA");
    fixture.actors.set(owner, { isActive: true, roles: ["efa"] });
    const cancelled = await fixture.service.cancel(admin, {
      dispatchId: created.dispatch.id,
      expectedVersion: 1,
      operationId: "dispatch-admin-cancel",
    });
    expect(cancelled.operation).toMatchObject({
      action: "cancelled",
      appliedVersion: 2,
      changed: true,
    });
    expect(fixture.audits.at(-1)).toMatchObject({
      action: "cancelled",
      actorUserId: admin,
      versionBefore: 1,
      versionAfter: 2,
      beforeState: { state: "draft", cancelledAt: null },
      afterState: {
        state: "cancelled",
        cancelledFromState: "draft",
        cancelledAt: "2026-10-06T10:00:00.000Z",
      },
    });
    expect(fixture.dispatchNotices.map((notice) => notice.recipientUserId)).toEqual([owner]);
    await expect(
      fixture.service.cancel(admin, {
        dispatchId: created.dispatch.id,
        expectedVersion: 2,
        operationId: "dispatch-admin-cancel",
      }),
    ).rejects.toThrow("identidad de operación");
    await expect(
      fixture.service.update(owner, {
        dispatchId: created.dispatch.id,
        expectedVersion: 2,
        operationId: "dispatch-edit-while-cancelled",
        baseId,
      }),
    ).rejects.toThrow("Reactivá");
    await expect(
      fixture.service.finalize(owner, {
        dispatchId: created.dispatch.id,
        expectedVersion: 2,
        operationId: "dispatch-finalize-while-cancelled",
        priority: "red",
        result: "cancelled",
      }),
    ).rejects.toThrow("Reactivá");
  });

  it("keeps institution selection per dispatch and permits no institution for non-transport outcomes", async () => {
    const fixture = makeStore();
    fixture.institutions.set("institution-second", {
      id: "institution-second",
      name: "Hospital Norte",
      isActive: true,
    });
    const first = await fixture.service.create(owner, {
      clientCreationKey: "create-per-dispatch-a",
      episodeId,
      baseId,
      institutionId: "institution-active",
      result: "transported",
    });
    const second = await fixture.service.create(owner, {
      clientCreationKey: "create-per-dispatch-b",
      episodeId,
      baseId,
      institutionId: "institution-second",
      result: "transported",
    });
    const nonTransport = await fixture.service.create(owner, {
      clientCreationKey: "create-per-dispatch-no-destination",
      episodeId,
      baseId,
      institutionId: null,
      result: "treated_at_home",
    });

    expect(first.dispatch.institutionId).toBe("institution-active");
    expect(second.dispatch.institutionId).toBe("institution-second");
    expect(nonTransport.dispatch).toMatchObject({
      institutionId: null,
      result: "treated_at_home",
    });
    expect(fixture.dispatches).toHaveLength(3);
  });

  it("associates an active institution per dispatch and retains an inactive historical choice", async () => {
    const fixture = makeStore();
    const first = await fixture.service.create(owner, {
      clientCreationKey: "create-institution-1",
      episodeId,
      baseId,
      institutionId: "institution-active",
    });
    expect(first.dispatch.institutionId).toBe("institution-active");
    expect(fixture.audits[0]?.afterState).toMatchObject({ institutionId: "institution-active" });
    fixture.institutions.set("institution-active", {
      id: "institution-active",
      name: "Hospital Central",
      isActive: false,
    });
    await expect(
      fixture.service.create(owner, {
        clientCreationKey: "create-institution-inactive",
        episodeId,
        baseId,
        institutionId: "institution-inactive",
      }),
    ).rejects.toThrow(/institución|destino/i);
    await fixture.service.update(owner, {
      dispatchId: first.dispatch.id,
      expectedVersion: 1,
      operationId: "update-preserve-inactive-institution",
      baseId,
      institutionId: "institution-active",
    });
    const active = await fixture.service.listForEpisode(owner, episodeId);
    expect(active[0]).toMatchObject({
      id: first.dispatch.id,
      institutionId: "institution-active",
      institutionName: "Hospital Central",
      institutionIsActive: false,
    });
  });

  it("copies a linked call priority only at creation and replays after the base is deactivated", async () => {
    const fixture = makeStore();
    const input = {
      clientCreationKey: "create-1",
      episodeId,
      baseId,
      communicationId: callId,
      t0At: time,
      t0Status: "observed" as const,
    };
    const created = await fixture.service.create(owner, input);
    expect(created.dispatch.priority).toBe("red");
    expect(created.dispatch.t0At).toBe(time);
    expect(created.operation.appliedVersion).toBe(1);
    fixture.bases.set(baseId, { id: baseId, isActive: false });
    const replay = await fixture.service.create(owner, input);
    expect(replay.operation.replayed).toBe(true);
    expect(fixture.audits).toHaveLength(1);
  });

  it("uses the linked call priority at creation even when a conflicting priority is submitted", async () => {
    const fixture = makeStore();
    fixture.calls.set("call-null", {
      id: "call-null",
      episodeId,
      ownerUserId: owner,
      priority: null,
      state: "finalized",
    });
    const fromPrioritizedCall = await fixture.service.create(owner, {
      clientCreationKey: "create-priority-source",
      episodeId,
      baseId,
      communicationId: callId,
      priority: "green",
    });
    const fromUnprioritizedCall = await fixture.service.create(owner, {
      clientCreationKey: "create-no-priority-source",
      episodeId,
      baseId,
      communicationId: "call-null",
      priority: "green",
    });
    expect(fromPrioritizedCall.dispatch.priority).toBe("red");
    expect(fromUnprioritizedCall.dispatch.priority).toBeNull();
  });

  it("does not overwrite a dispatch priority when a call is linked later", async () => {
    const fixture = makeStore();
    const created = await fixture.service.create(owner, {
      clientCreationKey: "create-2",
      episodeId,
      baseId,
      priority: "green",
    });
    const updated = await fixture.service.update(owner, {
      dispatchId: created.dispatch.id,
      expectedVersion: 1,
      operationId: "update-1",
      baseId,
      communicationId: callId,
      priority: "green",
    });
    expect(updated.dispatch.priority).toBe("green");
    expect(updated.dispatch.communicationId).toBe(callId);
    expect(fixture.audits.map((item) => [item.versionBefore, item.versionAfter])).toEqual([
      [null, 1],
      [1, 2],
    ]);
  });

  it("rejects named or unknown first-response roles before creating or auditing", async () => {
    const fixture = makeStore();
    await expect(
      fixture.service.create(owner, {
        clientCreationKey: "create-named-role",
        episodeId,
        baseId,
        firstResponseRole: "Named operator",
      }),
    ).rejects.toThrow("rol anónimo");
    await expect(
      fixture.service.create(owner, {
        clientCreationKey: "create-empty-role",
        episodeId,
        baseId,
        firstResponseRole: "",
      }),
    ).rejects.toThrow("rol anónimo");
    expect(fixture.dispatches).toHaveLength(0);
    expect(fixture.audits).toHaveLength(0);
    expect(fixture.operations).toHaveLength(0);

    const created = await fixture.service.create(owner, {
      clientCreationKey: "create-valid-role",
      episodeId,
      baseId,
      firstResponseRole: "nurse",
    });
    await expect(
      fixture.service.update(owner, {
        dispatchId: created.dispatch.id,
        expectedVersion: 1,
        operationId: "update-named-role",
        baseId,
        firstResponseRole: "Named operator",
      }),
    ).rejects.toThrow("rol anónimo");
    expect(fixture.dispatches[0]?.firstResponseRole).toBe("nurse");
    expect(fixture.audits).toHaveLength(1);
    expect(fixture.operations).toHaveLength(1);
  });

  it("preserves an unchanged legacy role while allowing other edits", async () => {
    const fixture = makeStore();
    const created = await fixture.service.create(owner, {
      clientCreationKey: "create-legacy-role",
      episodeId,
      baseId,
      firstResponseRole: "not_observed",
    });
    const stored = fixture.dispatches[0]!;
    stored.firstResponseRole = "Historical free text";
    const updated = await fixture.service.update(owner, {
      dispatchId: created.dispatch.id,
      expectedVersion: 1,
      operationId: "update-legacy-note",
      baseId,
      note: "Se conserva el dato histórico sin editarlo.",
    });
    expect(updated.dispatch.firstResponseRole).toBe("Historical free text");
    expect(updated.dispatch.note).toBe("Se conserva el dato histórico sin editarlo.");
  });

  it("allows revoked owners to read but prevents writes, and requires final priority and result", async () => {
    const fixture = makeStore();
    const created = await fixture.service.create(owner, {
      clientCreationKey: "create-3",
      episodeId,
      baseId,
    });
    fixture.actors.set(owner, { isActive: true, roles: [] });
    expect((await fixture.service.get(owner, created.dispatch.id)).id).toBe(created.dispatch.id);
    await expect(
      fixture.service.update(owner, {
        dispatchId: created.dispatch.id,
        expectedVersion: 1,
        operationId: "revoked-update",
        baseId,
      }),
    ).rejects.toThrow("acceso EFA");
    fixture.actors.set(owner, { isActive: true, roles: ["efa"] });
    await expect(
      fixture.service.finalize(owner, {
        dispatchId: created.dispatch.id,
        expectedVersion: 1,
        operationId: "bad-final",
        priority: "green",
        result: null as never,
      }),
    ).rejects.toThrow("prioridad y el resultado");
    const finalized = await fixture.service.finalize(owner, {
      dispatchId: created.dispatch.id,
      expectedVersion: 1,
      operationId: "finalize-1",
      priority: "yellow",
      result: "not_informed",
    });
    expect(finalized.dispatch.state).toBe("finalized");
    expect(finalized.dispatch.finalizedAt).toBe("2026-10-06T10:00:00.000Z");
    expect(fixture.audits).toHaveLength(2);
  });

  it("rejects support responses from a different episode before creating a request", async () => {
    const fixture = makeStore();
    const created = await fixture.service.create(owner, {
      clientCreationKey: "create-4",
      episodeId,
      baseId,
    });
    await expect(
      fixture.service.createSupportRequest(owner, {
        clientCreationKey: "support-1",
        sourceDispatchId: created.dispatch.id,
        requestedAt: time,
        reason: "Reforzar",
        responseDispatchId: "foreign-dispatch",
      }),
    ).rejects.toThrow("mismo episodio");
    expect(fixture.supportRequests).toHaveLength(0);
  });

  it("audits admin corrections with complete before/after state and notifies only the original owner", async () => {
    const fixture = makeStore();
    const created = await fixture.service.create(owner, {
      clientCreationKey: "create-5",
      episodeId,
      baseId,
      t1At: time,
      t1Status: "observed",
    });
    const changed = await fixture.service.update(admin, {
      dispatchId: created.dispatch.id,
      expectedVersion: 1,
      operationId: "admin-update",
      note: "Actualización administrativa",
    });
    expect(changed.dispatch.version).toBe(2);
    expect(fixture.audits[1]).toMatchObject({
      actorUserId: admin,
      versionBefore: 1,
      versionAfter: 2,
      action: "updated",
    });
    expect(fixture.audits[1]?.beforeState).toMatchObject({
      t1At: time,
      state: "draft",
      finalizedAt: null,
    });
    expect(fixture.audits[1]?.afterState).toMatchObject({
      t1At: time,
      note: "Actualización administrativa",
      state: "draft",
    });
    expect(fixture.dispatchNotices.map((notice) => notice.recipientUserId)).toEqual([owner]);
  });

  it("stores a no-op receipt without an audit and replays its applied version after later edits", async () => {
    const fixture = makeStore();
    const created = await fixture.service.create(owner, {
      clientCreationKey: "create-8",
      episodeId,
      baseId,
    });
    const noOp = await fixture.service.update(owner, {
      dispatchId: created.dispatch.id,
      expectedVersion: 1,
      operationId: "noop-1",
      baseId,
    });
    expect(noOp.operation).toMatchObject({ appliedVersion: 1, changed: false, replayed: false });
    expect(fixture.audits).toHaveLength(1);
    await fixture.service.update(owner, {
      dispatchId: created.dispatch.id,
      expectedVersion: 1,
      operationId: "real-1",
      baseId,
      note: "Actualización",
    });
    const replay = await fixture.service.update(owner, {
      dispatchId: created.dispatch.id,
      expectedVersion: 1,
      operationId: "noop-1",
      baseId,
    });
    expect(replay.operation).toMatchObject({ appliedVersion: 1, changed: false, replayed: true });
    expect(replay.dispatch.version).toBe(2);
    await expect(
      fixture.service.update(owner, {
        dispatchId: created.dispatch.id,
        expectedVersion: 2,
        operationId: "noop-1",
        baseId,
        note: "Otro payload",
      }),
    ).rejects.toThrow("identidad de operación");
  });

  it("records repeated contact attempts and support request versions without duplicating the call", async () => {
    const fixture = makeStore();
    const source = await fixture.service.create(owner, {
      clientCreationKey: "create-6",
      episodeId,
      baseId,
    });
    const response = await fixture.service.create(owner, {
      clientCreationKey: "create-7",
      episodeId,
      baseId,
    });
    const contact = {
      dispatchId: source.dispatch.id,
      clientEventId: "contact-1",
      occurredAt: time,
      note: "Sin respuesta",
    };
    const first = await fixture.service.addContactAttempt(owner, contact);
    const replay = await fixture.service.addContactAttempt(owner, contact);
    expect(replay.id).toBe(first.id);
    expect(fixture.contactAttempts).toHaveLength(1);
    const beforeUpdate = await fixture.service.get(owner, source.dispatch.id);
    const updatedDispatch = await fixture.service.update(owner, {
      dispatchId: source.dispatch.id,
      expectedVersion: 1,
      operationId: "update-with-contact-history",
      baseId,
      note: "Preservar la colección al recibir el acuse",
    });
    expect(updatedDispatch.dispatch).not.toHaveProperty("contactAttempts");
    expect(
      normalizeConfirmedDispatch(updatedDispatch.dispatch, beforeUpdate).contactAttempts,
    ).toMatchObject([
      {
        id: first.id,
        occurredAt: new Date(time).toISOString(),
        note: "Sin respuesta",
      },
    ]);
    const request = await fixture.service.createSupportRequest(owner, {
      clientCreationKey: "support-2",
      sourceDispatchId: source.dispatch.id,
      requestedAt: time,
      reason: "Refuerzo solicitado",
      responseDispatchId: response.dispatch.id,
    });
    expect(request.supportRequest.responseDispatchId).toBe(response.dispatch.id);
    const updated = await fixture.service.updateSupportRequest(admin, {
      supportRequestId: request.supportRequest.id,
      expectedVersion: 1,
      operationId: "support-update",
      requestedAt: time,
      reason: "Refuerzo coordinado",
      responseDispatchId: response.dispatch.id,
    });
    expect(updated.supportRequest.version).toBe(2);
    expect(
      fixture.supportAudits.map((audit) => [
        audit.actorUserId,
        audit.versionBefore,
        audit.versionAfter,
      ]),
    ).toEqual([
      [owner, null, 1],
      [admin, 1, 2],
    ]);
    expect(fixture.supportNotices.map((notice) => notice.recipientUserId)).toEqual([owner]);
  });

  it("does not append audits or notices when either versioned compare-and-set fails", async () => {
    const fixture = makeStore();
    const created = await fixture.service.create(owner, {
      clientCreationKey: "create-9",
      episodeId,
      baseId,
    });
    fixture.failDispatchCas();
    await expect(
      fixture.service.update(owner, {
        dispatchId: created.dispatch.id,
        expectedVersion: 1,
        operationId: "conflict-1",
        baseId,
        note: "Cambio concurrente",
      }),
    ).rejects.toThrow("version conflict");
    expect(fixture.audits).toHaveLength(1);
    expect(fixture.operations).toHaveLength(1);
    const support = await fixture.service.createSupportRequest(owner, {
      clientCreationKey: "support-3",
      sourceDispatchId: created.dispatch.id,
      requestedAt: time,
      reason: "Reforzar",
    });
    fixture.failSupportCas();
    await expect(
      fixture.service.updateSupportRequest(owner, {
        supportRequestId: support.supportRequest.id,
        expectedVersion: 1,
        operationId: "support-conflict",
        requestedAt: time,
        reason: "Otra coordinación",
        responseDispatchId: null,
      }),
    ).rejects.toThrow("version conflict");
    expect(fixture.supportAudits).toHaveLength(1);
    expect(fixture.supportOperations).toHaveLength(1);
    expect(fixture.dispatchNotices).toHaveLength(0);
    expect(fixture.supportNotices).toHaveLength(0);
  });
});
