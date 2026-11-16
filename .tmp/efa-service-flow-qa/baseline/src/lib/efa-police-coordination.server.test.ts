import { describe, expect, it } from "vitest";
import {
  createEfaPoliceCoordinationService,
  omitDatabaseTimestamps,
  type PoliceAuditRecord,
  type PoliceCoordinationRecord,
  type PoliceCoordinationStore,
  type PoliceCoordinationTransaction,
  type PoliceEventRecord,
  type PoliceOperationRecord,
} from "./efa-police-coordination.server";

const episode = { id: "episode-1", ownerUserId: "owner" };
const dispatches = [
  { id: "dispatch-1", episodeId: episode.id, ownerUserId: episode.ownerUserId },
  { id: "dispatch-2", episodeId: episode.id, ownerUserId: episode.ownerUserId },
  { id: "foreign", episodeId: "other-episode", ownerUserId: "other-owner" },
];
const now = () => new Date("2026-10-07T10:00:00.000Z");

function fixture() {
  const actors = new Map([
    ["owner", { isActive: true, roles: ["efa"] as Array<"efa" | "admin"> }],
    ["admin", { isActive: true, roles: ["admin"] as Array<"efa" | "admin"> }],
    ["revoked", { isActive: true, roles: [] as Array<"efa" | "admin"> }],
    ["disabled", { isActive: false, roles: ["efa"] as Array<"efa" | "admin"> }],
  ]);
  const records: PoliceCoordinationRecord[] = [];
  const events: PoliceEventRecord[] = [];
  const audits: PoliceAuditRecord[] = [];
  const operations: PoliceOperationRecord[] = [];
  const links = new Map<string, string[]>();
  const notices: Array<{
    id: string;
    coordinationId: string;
    ownerUserId: string;
    createdAt: Date;
    readAt: Date | null;
    recipientUserId: string;
  }> = [];
  let serial = 0;
  let failCas = false;
  const clone = <T>(item: T): T => structuredClone(item);
  const tx: PoliceCoordinationTransaction = {
    async findActor(id) {
      return actors.get(id) ?? null;
    },
    async findEpisode(id) {
      return id === episode.id ? episode : null;
    },
    async findDispatch(id) {
      return dispatches.find((item) => item.id === id) ?? null;
    },
    async listForEpisode(id) {
      return records.filter((item) => item.episodeId === id).map(clone);
    },
    async findCoordination(id) {
      const item = records.find((row) => row.id === id);
      return item ? clone(item) : null;
    },
    async findByCreationKey(owner, key) {
      const item = records.find(
        (row) => row.ownerUserId === owner && row.clientCreationKey === key,
      );
      return item ? clone(item) : null;
    },
    async findOperation(id, key) {
      return (
        operations.find((item) => item.coordinationId === id && item.clientOperationId === key) ??
        null
      );
    },
    async findEvent(id, eventId) {
      const item = events.find((row) => row.coordinationId === id && row.id === eventId);
      return item ? clone(item) : null;
    },
    async findEventByClientId(id, clientEventId) {
      const item = events.find(
        (row) => row.coordinationId === id && row.clientEventId === clientEventId,
      );
      return item ? clone(item) : null;
    },
    async listEvents(id) {
      return events.filter((row) => row.coordinationId === id).map(clone);
    },
    async listDispatchIds(id) {
      return [...(links.get(id) ?? [])].sort();
    },
    async insertCoordination(input) {
      records.push({ ...input, createdAt: now(), updatedAt: now() });
      links.set(input.id, []);
    },
    async updateCoordination(id, expectedVersion, fields) {
      if (failCas) {
        failCas = false;
        throw new Error("version conflict");
      }
      const row = records.find((item) => item.id === id);
      if (!row || row.version !== expectedVersion) throw new Error("version conflict");
      Object.assign(row, fields, { updatedAt: now() });
    },
    async associateDispatch(input) {
      const current = links.get(input.coordinationId) ?? [];
      if (!current.includes(input.dispatchId)) current.push(input.dispatchId);
      links.set(input.coordinationId, current);
    },
    async removeDispatch(id, dispatchId) {
      links.set(
        id,
        (links.get(id) ?? []).filter((item) => item !== dispatchId),
      );
    },
    async insertEvent(input) {
      events.push({ ...input, createdAt: now(), updatedAt: now() });
    },
    async updateEvent(id, expectedVersion, fields) {
      const row = events.find((item) => item.id === id);
      if (!row || row.version !== expectedVersion) throw new Error("event version conflict");
      Object.assign(row, fields, { updatedAt: now() });
    },
    async appendAudit(input) {
      const row = { ...input, id: `audit-${++serial}`, occurredAt: now() };
      audits.push(row);
      return row.id;
    },
    async listAudits(id) {
      return audits.filter((item) => item.coordinationId === id).map(clone);
    },
    async insertOperation(input) {
      operations.push({ ...input, id: `operation-${++serial}` });
    },
    async listNotices(userId) {
      return notices
        .filter((item) => item.recipientUserId === userId)
        .map(({ id, coordinationId, createdAt, readAt }) => ({
          id,
          coordinationId,
          createdAt,
          readAt,
        }));
    },
    async appendNotice(input) {
      notices.push({ ...input, id: `notice-${++serial}`, createdAt: now(), readAt: null });
    },
    async markNoticeRead(id, recipient) {
      const item = notices.find((row) => row.id === id && row.recipientUserId === recipient);
      if (!item) return null;
      item.readAt ??= now();
      return item;
    },
    async currentTimestamp() {
      return now();
    },
  };
  const store: PoliceCoordinationStore = {
    async transaction(work) {
      return work(tx);
    },
  };
  return {
    actors,
    records,
    events,
    audits,
    operations,
    links,
    notices,
    failCas: () => {
      failCas = true;
    },
    service: createEfaPoliceCoordinationService(store, { newId: () => `id-${++serial}` }),
  };
}

describe("EFA police coordination service", () => {
  it("omits client placeholder timestamps at the production database insert boundary", () => {
    expect(
      omitDatabaseTimestamps({
        id: "coordination",
        createdAt: new Date(0),
        updatedAt: new Date(0),
      }),
    ).toEqual({ id: "coordination" });
    expect(
      omitDatabaseTimestamps({
        id: "event",
        createdAt: new Date(0),
        updatedAt: new Date(0),
      }),
    ).not.toHaveProperty("createdAt");
  });

  it("stores distinct shared reiterations once and requires mobile events to reference an associated same-episode dispatch", async () => {
    const f = fixture();
    const created = await f.service.create("owner", {
      episodeId: episode.id,
      clientCreationKey: "create-1",
      operationId: "op-create",
      initiator: "central",
      placeType: "incident",
      dispatchIds: ["dispatch-1", "dispatch-2"],
    });
    const id = created.coordination.id;
    const requestInput = {
      coordinationId: id,
      expectedVersion: 1,
      operationId: "op-request",
      clientEventId: "event-request",
      kind: "reiteration" as const,
      occurredAt: "2026-10-07T10:01:02.345Z",
      timeStatus: "observed" as const,
    };
    const request = await f.service.addEvent("owner", requestInput);
    const requestReplay = await f.service.addEvent("owner", requestInput);
    expect(request.event).toMatchObject({
      kind: "reiteration",
      dispatchId: null,
      occurredAt: "2026-10-07T10:01:02.345Z",
    });
    expect(requestReplay.operation.replayed).toBe(true);
    expect(requestReplay.event?.id).toBe(request.event!.id);
    expect(f.events).toHaveLength(1);
    expect(requestReplay.coordination.version).toBe(request.coordination.version);

    const secondRequestInput = {
      ...requestInput,
      expectedVersion: 2,
      operationId: "op-request-second",
      clientEventId: "event-request-second",
      occurredAt: "2026-10-07T10:01:30.456Z",
    };
    const secondRequest = await f.service.addEvent("owner", secondRequestInput);
    const secondRequestReplay = await f.service.addEvent("owner", secondRequestInput);
    expect(secondRequest.event?.id).not.toBe(request.event?.id);
    expect(secondRequestReplay.operation.replayed).toBe(true);
    expect(secondRequestReplay.event?.id).toBe(secondRequest.event?.id);
    expect(secondRequest.coordination.version).toBe(3);
    expect(secondRequestReplay.coordination.version).toBe(secondRequest.coordination.version);
    expect(f.events.filter((event) => event.kind === "reiteration")).toHaveLength(2);
    expect(f.events.filter((event) => event.kind === "reiteration")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: request.event?.id, dispatchId: null }),
        expect.objectContaining({ id: secondRequest.event?.id, dispatchId: null }),
      ]),
    );
    expect(f.audits).toHaveLength(3);
    expect(f.operations).toHaveLength(3);
    expect(secondRequest.coordination.dispatchIds).toEqual(["dispatch-1", "dispatch-2"]);

    await expect(
      f.service.addEvent("owner", {
        coordinationId: id,
        expectedVersion: 3,
        operationId: "op-bad",
        clientEventId: "event-bad",
        kind: "actual_meeting",
        dispatchId: "foreign",
        timeStatus: "not_observed",
      }),
    ).rejects.toThrow("asociado");
    const meeting = await f.service.addEvent("owner", {
      coordinationId: id,
      expectedVersion: 3,
      operationId: "op-meet",
      clientEventId: "event-meet",
      kind: "actual_meeting",
      dispatchId: "dispatch-1",
      occurredAt: "2026-10-07T10:02:03.456Z",
      timeStatus: "observed",
    });
    expect(meeting.coordination.dispatchIds).toEqual(["dispatch-1", "dispatch-2"]);
    expect(f.events).toHaveLength(3);
    expect(f.events[0]?.occurredAt?.toISOString()).toBe("2026-10-07T10:01:02.345Z");
    expect(f.audits).toHaveLength(4);
    expect(f.audits[3]?.action).toBe("event_created");
    expect(f.audits[3]).toMatchObject({ actorUserId: "owner", versionBefore: 3, versionAfter: 4 });
    expect(f.audits[3]?.afterState).toMatchObject({
      event: {
        kind: "actual_meeting",
        dispatchId: "dispatch-1",
        occurredAt: "2026-10-07T10:02:03.456Z",
      },
    });
    await expect(
      f.service.setDispatches("owner", {
        coordinationId: id,
        expectedVersion: 4,
        operationId: "remove-linked-event",
        dispatchIds: ["dispatch-2"],
      }),
    ).rejects.toThrow("eventos asociados");
  });

  it("stores a no-op event correction as a replayable receipt without a new version or audit", async () => {
    const f = fixture();
    const coordination = await f.service.create("owner", {
      episodeId: episode.id,
      clientCreationKey: "create-noop",
      operationId: "op-create",
      initiator: "central",
      placeType: "incident",
      dispatchIds: ["dispatch-1"],
    });
    const created = await f.service.addEvent("owner", {
      coordinationId: coordination.coordination.id,
      expectedVersion: 1,
      operationId: "event-add",
      clientEventId: "event-1",
      kind: "waiting",
      dispatchId: "dispatch-1",
      timeStatus: "not_observed",
    });
    const beforeAudits = f.audits.length;
    const unchanged = await f.service.updateEvent("owner", {
      coordinationId: coordination.coordination.id,
      eventId: created.event!.id,
      expectedVersion: 1,
      expectedCoordinationVersion: 2,
      operationId: "event-noop",
      kind: "waiting",
      dispatchId: "dispatch-1",
      occurredAt: null,
      timeStatus: "not_observed",
      note: null,
    });
    expect(unchanged.operation).toMatchObject({ appliedVersion: 2, changed: false });
    expect(f.audits).toHaveLength(beforeAudits);
    const replay = await f.service.updateEvent("owner", {
      coordinationId: coordination.coordination.id,
      eventId: created.event!.id,
      expectedVersion: 1,
      expectedCoordinationVersion: 2,
      operationId: "event-noop",
      kind: "waiting",
      dispatchId: "dispatch-1",
      occurredAt: null,
      timeStatus: "not_observed",
      note: null,
    });
    expect(replay.operation.replayed).toBe(true);
  });

  it("preserves omitted event fields and rejects clearing a mobile event's required dispatch link", async () => {
    const f = fixture();
    const coordination = await f.service.create("owner", {
      episodeId: episode.id,
      clientCreationKey: "create-partial-event",
      operationId: "create-partial-event-op",
      initiator: "central",
      placeType: "incident",
      dispatchIds: ["dispatch-1"],
    });
    const created = await f.service.addEvent("owner", {
      coordinationId: coordination.coordination.id,
      expectedVersion: 1,
      operationId: "event-create",
      clientEventId: "event-partial",
      kind: "waiting",
      dispatchId: "dispatch-1",
      occurredAt: "2026-10-07T10:10:11.123Z",
      timeStatus: "observed",
      note: "Waiting at the meeting point",
    });
    const update = (input: Record<string, unknown>) =>
      f.service.updateEvent("owner", input as Parameters<typeof f.service.updateEvent>[1]);
    const timeCorrection = await update({
      coordinationId: coordination.coordination.id,
      eventId: created.event!.id,
      expectedVersion: 1,
      expectedCoordinationVersion: 2,
      operationId: "event-time-only",
      kind: "waiting",
      occurredAt: "2026-10-07T10:12:13.456Z",
    });
    expect(timeCorrection.event).toMatchObject({
      dispatchId: "dispatch-1",
      occurredAt: "2026-10-07T10:12:13.456Z",
      timeStatus: "observed",
      note: "Waiting at the meeting point",
    });
    const noteCorrection = await update({
      coordinationId: coordination.coordination.id,
      eventId: created.event!.id,
      expectedVersion: 2,
      expectedCoordinationVersion: 3,
      operationId: "event-note-only",
      kind: "waiting",
      note: "Still waiting",
    });
    expect(noteCorrection.event).toMatchObject({
      dispatchId: "dispatch-1",
      occurredAt: "2026-10-07T10:12:13.456Z",
      timeStatus: "observed",
      note: "Still waiting",
    });
    await expect(
      update({
        coordinationId: coordination.coordination.id,
        eventId: created.event!.id,
        expectedVersion: 3,
        expectedCoordinationVersion: 4,
        operationId: "event-clear-dispatch",
        kind: "waiting",
        dispatchId: null,
        note: "Still waiting",
      }),
    ).rejects.toThrow("alcance de despacho");
  });

  it("allows revoked owners to read, but only current EFA or admin can correct, preserving original ownership and notice recipient", async () => {
    const f = fixture();
    const created = await f.service.create("owner", {
      episodeId: episode.id,
      clientCreationKey: "create-2",
      operationId: "op-create",
      initiator: "ambulance",
      initiatingDispatchId: "dispatch-1",
      placeType: "meeting_point",
    });
    f.actors.set("owner", { isActive: true, roles: [] });
    expect((await f.service.get("owner", created.coordination.id)).ownerUserId).toBe("owner");
    await expect(
      f.service.update("owner", {
        coordinationId: created.coordination.id,
        expectedVersion: 1,
        operationId: "op-denied",
        initiator: "central",
        initiatingDispatchId: null,
        placeType: "incident",
        meetingReference: null,
        notes: null,
      }),
    ).rejects.toThrow("acceso EFA");
    const result = await f.service.update("admin", {
      coordinationId: created.coordination.id,
      expectedVersion: 1,
      operationId: "op-admin",
      initiator: "central",
      initiatingDispatchId: null,
      placeType: "incident",
      meetingReference: "Privado",
      notes: null,
    });
    expect(result.coordination.ownerUserId).toBe("owner");
    expect(await f.service.listNotices("owner")).toHaveLength(1);
    expect(await f.service.listNotices("admin")).toHaveLength(0);
    const notice = (await f.service.listNotices("owner"))[0]!;
    await expect(f.service.markNoticeRead("admin", notice.id)).rejects.toThrow("aviso");
    const acknowledged = await f.service.markNoticeRead("owner", notice.id);
    const replayedAcknowledgement = await f.service.markNoticeRead("owner", notice.id);
    expect(acknowledged.readAt).toBe(replayedAcknowledgement.readAt);
    const history = await f.service.history("owner", created.coordination.id);
    expect(history[1]).toMatchObject({
      actorUserId: "admin",
      action: "updated",
      versionBefore: 1,
      versionAfter: 2,
      beforeState: expect.objectContaining({
        initiator: "ambulance",
        initiatingDispatchId: "dispatch-1",
      }),
      afterState: expect.objectContaining({
        initiator: "central",
        initiatingDispatchId: null,
        meetingReference: "Privado",
      }),
    });
  });

  it("replays creation without duplicating events and rejects stale changes before audit", async () => {
    const f = fixture();
    const input = {
      episodeId: episode.id,
      clientCreationKey: "create-3",
      operationId: "op-create",
      initiator: "central" as const,
      placeType: "incident" as const,
      dispatchIds: ["dispatch-1"],
    };
    const first = await f.service.create("owner", input);
    const replay = await f.service.create("owner", input);
    expect(replay.coordination.id).toBe(first.coordination.id);
    expect(replay.operation.replayed).toBe(true);
    expect(f.records).toHaveLength(1);
    await expect(
      f.service.create("owner", { ...input, notes: "different content" }),
    ).rejects.toThrow("identidad de operación");
    const before = f.audits.length;
    await expect(
      f.service.update("owner", {
        coordinationId: first.coordination.id,
        expectedVersion: 9,
        operationId: "stale",
        initiator: "central",
        initiatingDispatchId: null,
        placeType: "incident",
        meetingReference: null,
        notes: null,
      }),
    ).rejects.toThrow("cambió");
    expect(f.audits).toHaveLength(before);
  });

  it("does not claim update success when the versioned compare-and-set fails", async () => {
    const f = fixture();
    const created = await f.service.create("owner", {
      episodeId: episode.id,
      clientCreationKey: "create-4",
      operationId: "op-create",
      initiator: "central",
      placeType: "incident",
    });
    f.failCas();
    await expect(
      f.service.update("owner", {
        coordinationId: created.coordination.id,
        expectedVersion: 1,
        operationId: "op-cas",
        initiator: "ambulance",
        initiatingDispatchId: null,
        placeType: "meeting_point",
        meetingReference: null,
        notes: null,
      }),
    ).rejects.toThrow("version conflict");
    expect(f.audits).toHaveLength(1);
    f.failCas();
    await expect(
      f.service.setDispatches("owner", {
        coordinationId: created.coordination.id,
        expectedVersion: 1,
        operationId: "op-link-cas",
        dispatchIds: ["dispatch-1"],
      }),
    ).rejects.toThrow("version conflict");
    expect(f.links.get(created.coordination.id)).toEqual([]);
  });
});
