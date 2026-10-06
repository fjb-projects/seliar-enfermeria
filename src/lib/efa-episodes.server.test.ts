import { describe, expect, it } from "vitest";
import {
  createEfaEpisodesService,
  type EfaEpisodeRecord,
  type EfaEpisodeTransaction,
} from "./efa-episodes.server";

const opened = new Date("2026-10-06T08:00:00.000Z");
const eventTime = new Date("2026-10-06T09:30:00.000Z");
const owner = "owner";
const admin = "admin";
const guardId = "guard-open";

function createStore() {
  const actors = new Map<string, { isActive: boolean; roles: Array<"efa" | "admin"> }>([
    [owner, { isActive: true, roles: ["efa"] as Array<"efa" | "admin"> }],
    [admin, { isActive: true, roles: ["admin"] as Array<"efa" | "admin"> }],
    ["revoked", { isActive: true, roles: [] as Array<"efa" | "admin"> }],
    ["disabled", { isActive: false, roles: ["efa"] as Array<"efa" | "admin"> }],
  ]);
  const guards = new Map([
    [guardId, { id: guardId, ownerUserId: owner, startedAt: opened, endedAt: null }],
    [
      "guard-closed",
      {
        id: "guard-closed",
        ownerUserId: owner,
        startedAt: opened,
        endedAt: new Date("2026-10-06T18:00:00.000Z"),
      },
    ],
    ["guard-other", { id: "guard-other", ownerUserId: "other", startedAt: opened, endedAt: null }],
  ]);
  const episodes: EfaEpisodeRecord[] = [];
  const audits: Array<Parameters<EfaEpisodeTransaction["appendAudit"]>[0]> = [];
  const notices: Array<Parameters<EfaEpisodeTransaction["appendNotice"]>[0]> = [];
  const operationLookup: Array<{
    id: string;
    episodeId: string;
    actorUserId: string;
    clientOperationId: string;
    action: "created" | "updated";
    requestHash: string;
    appliedVersion: number;
    changed: boolean;
  }> = [];
  let forcedCreationMisses = 0;
  let transactionTail = Promise.resolve();
  const guardLocks: string[] = [];
  const episodeLocks: string[] = [];
  let auditNumber = 0;
  const tx = {
    async findActor(userId: string) {
      return actors.get(userId) ?? null;
    },
    async findGuard(id: string, lock = false) {
      if (lock) guardLocks.push(id);
      return guards.get(id) ?? null;
    },
    async listEpisodes(ownerUserId: string | null) {
      return episodes.filter((episode) => !ownerUserId || episode.ownerUserId === ownerUserId);
    },
    async findEpisode(id: string, lock = false) {
      if (lock) episodeLocks.push(id);
      return episodes.find((episode) => episode.id === id) ?? null;
    },
    async findEpisodeByCreationKey(userId: string, key: string) {
      if (forcedCreationMisses > 0) {
        forcedCreationMisses -= 1;
        return null;
      }
      return (
        episodes.find(
          (episode) => episode.ownerUserId === userId && episode.clientCreationKey === key,
        ) ?? null
      );
    },
    async findOperation(episodeId: string, clientOperationId: string) {
      return (
        operationLookup.find(
          (operation) =>
            operation.episodeId === episodeId && operation.clientOperationId === clientOperationId,
        ) ?? null
      );
    },
    async insertEpisode(input: Omit<EfaEpisodeRecord, "version" | "createdAt" | "updatedAt">) {
      const now = new Date("2026-10-06T10:00:00.000Z");
      episodes.push({ ...input, version: 1, createdAt: now, updatedAt: now });
    },
    async updateEpisode(
      id: string,
      expectedVersion: number,
      next: Pick<
        EfaEpisodeRecord,
        "eventAt" | "motive" | "address" | "interventionNumber" | "version"
      >,
    ) {
      const episode = episodes.find((item) => item.id === id);
      if (!episode || episode.version !== expectedVersion)
        throw new Error("episode-version-conflict");
      Object.assign(episode, next, { updatedAt: new Date("2026-10-06T11:00:00.000Z") });
    },
    async appendAudit(input: Parameters<EfaEpisodeTransaction["appendAudit"]>[0]) {
      audits.push(input);
      auditNumber += 1;
      const id = `audit-${auditNumber}`;
      return id;
    },
    async insertOperation(input: Omit<(typeof operationLookup)[number], "id">) {
      operationLookup.push({ ...input, id: `op-${operationLookup.length + 1}` });
    },
    async appendNotice(input: Parameters<EfaEpisodeTransaction["appendNotice"]>[0]) {
      notices.push(input);
    },
  } satisfies EfaEpisodeTransaction;
  return {
    store: {
      async transaction<T>(work: (value: EfaEpisodeTransaction) => Promise<T>) {
        const previous = transactionTail;
        let release!: () => void;
        transactionTail = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        try {
          return await work(tx);
        } finally {
          release();
        }
      },
    },
    episodes,
    audits,
    notices,
    operationLookup,
    guardLocks,
    episodeLocks,
    setForcedCreationMisses(value: number) {
      forcedCreationMisses = value;
    },
    setRoles(userId: string, roles: Array<"efa" | "admin">) {
      const actor = actors.get(userId)!;
      actors.set(userId, { ...actor, roles });
    },
    closeGuard(id: string) {
      guards.get(id)!.endedAt = new Date("2026-10-06T18:00:00.000Z");
    },
  };
}

const createInput = (overrides: Record<string, unknown> = {}) => ({
  clientCreationKey: "11111111-1111-4111-8111-111111111111",
  guardId,
  eventAt: "2026-10-06T09:30:00.000Z",
  motive: "  Traslado de paciente  ",
  address: "  Calle 123, piso 2  ",
  interventionNumber: "  00073  ",
  ...overrides,
});

describe("EFA episode draft persistence", () => {
  it("stores event time separately from capture time and returns a safe caller-bound DTO", async () => {
    const db = createStore();
    const service = createEfaEpisodesService(db.store, { newId: () => "episode-1" });
    const result = await service.create(owner, createInput());
    const draft = result.episode;
    expect(draft).toMatchObject({
      id: "episode-1",
      ownerUserId: owner,
      originGuardId: guardId,
      eventAt: eventTime.toISOString(),
      motive: "Traslado de paciente",
      address: "Calle 123, piso 2",
      interventionNumber: "00073",
      state: "draft",
      version: 1,
      canEdit: true,
    });
    expect(draft.createdAt).not.toBe(draft.eventAt);
    expect(db.audits[0]).toMatchObject({ action: "created", versionBefore: null, versionAfter: 1 });
    expect(result.operation).toMatchObject({
      action: "created",
      appliedVersion: 1,
      changed: true,
      replayed: false,
    });
    expect(JSON.stringify(draft)).not.toMatch(/operationId|password|credential|token/i);
    expect(JSON.stringify(db.operationLookup)).not.toContain("Calle 123");
  });

  it("rejects inactive actors, revoked editors, and foreign or closed guards without audit", async () => {
    const db = createStore();
    const service = createEfaEpisodesService(db.store);
    await expect(service.create("disabled", createInput())).rejects.toThrow(/inactiva/i);
    await expect(service.create("revoked", createInput())).rejects.toThrow(/EFA/i);
    await expect(service.create(owner, createInput({ guardId: "guard-other" }))).rejects.toThrow(
      /propia/i,
    );
    await expect(service.create(owner, createInput({ guardId: "guard-closed" }))).rejects.toThrow(
      /abierta/i,
    );
    expect(db.episodes).toHaveLength(0);
    expect(db.audits).toHaveLength(0);
  });

  it("allows owner history after EFA revocation but blocks edits; admin can read all", async () => {
    const db = createStore();
    const service = createEfaEpisodesService(db.store, { newId: () => "episode-1" });
    await service.create(owner, createInput());
    db.setRoles(owner, []);
    await expect(service.list(owner)).resolves.toMatchObject([{ canEdit: false }]);
    await expect(service.get(owner, "episode-1")).resolves.toMatchObject({
      ownerUserId: owner,
      canEdit: false,
    });
    await expect(
      service.update(owner, {
        episodeId: "episode-1",
        expectedVersion: 1,
        operationId: "55555555-5555-4555-8555-555555555555",
        eventAt: "2026-10-06T10:00:00.000Z",
        motive: null,
        address: null,
        interventionNumber: null,
      }),
    ).rejects.toThrow(/EFA/i);
    await expect(service.list(admin)).resolves.toHaveLength(1);
  });

  it("supports idempotent creation retries, including after the origin guard closes", async () => {
    const db = createStore();
    const service = createEfaEpisodesService(db.store, { newId: () => "episode-1" });
    const first = await service.create(owner, createInput());
    const second = await service.create(owner, createInput());
    expect(second.episode.id).toBe(first.episode.id);
    expect(second.operation).toMatchObject({ appliedVersion: 1, replayed: true });
    expect(db.episodes).toHaveLength(1);
    expect(db.audits).toHaveLength(1);
    await expect(service.create(owner, createInput({ motive: "Otro episodio" }))).rejects.toThrow(
      /identidad/i,
    );
    expect(db.episodes).toHaveLength(1);
    expect(db.audits).toHaveLength(1);
  });

  it("updates a closed-guard draft optimistically and notifies the original owner for admin edits", async () => {
    const db = createStore();
    const service = createEfaEpisodesService(db.store, { newId: () => "episode-1" });
    await service.create(owner, createInput());
    db.closeGuard(guardId);
    const next = {
      episodeId: "episode-1",
      expectedVersion: 1,
      operationId: "22222222-2222-4222-8222-222222222222",
      eventAt: "2026-10-06T10:15:00.000Z",
      motive: "Actualizado",
      address: "Calle 123, piso 2",
      interventionNumber: "00073",
    };
    const concurrent = await Promise.all([
      service.update(admin, next),
      service.update(admin, next),
    ]);
    expect(concurrent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: expect.objectContaining({ appliedVersion: 2 }) }),
        expect.objectContaining({
          operation: expect.objectContaining({ appliedVersion: 2, replayed: true }),
        }),
      ]),
    );
    expect(db.episodeLocks).toEqual(["episode-1", "episode-1"]);
    expect(db.audits).toHaveLength(2);
    expect(db.notices).toHaveLength(1);
    expect(db.notices[0]).toMatchObject({
      episodeId: "episode-1",
      recipientUserId: owner,
      auditId: expect.any(String),
    });
    await expect(service.update(admin, next)).resolves.toMatchObject({
      episode: { version: 2 },
      operation: { appliedVersion: 2, replayed: true },
    });
    expect(db.audits).toHaveLength(2);
    expect(db.notices).toHaveLength(1);
    await expect(
      service.update(owner, {
        ...next,
        expectedVersion: 1,
        operationId: "33333333-3333-4333-8333-333333333333",
      }),
    ).rejects.toThrow(/cambió/i);
    expect(db.audits).toHaveLength(2);
  });

  it("does not create redundant notices for self-edits and never exposes foreign records to non-admins", async () => {
    const db = createStore();
    const service = createEfaEpisodesService(db.store, { newId: () => "episode-1" });
    await service.create(owner, createInput());
    db.closeGuard(guardId);
    const result = await service.update(owner, {
      episodeId: "episode-1",
      expectedVersion: 1,
      operationId: "44444444-4444-4444-8444-444444444444",
      eventAt: "2026-10-06T10:15:00.000Z",
      motive: null,
      address: null,
      interventionNumber: null,
    });
    expect(result).toMatchObject({
      episode: { version: 2, canEdit: true },
      operation: { changed: true },
    });
    expect(db.notices).toHaveLength(0);
    await expect(service.get("revoked", "episode-1")).rejects.toThrow(/encontró/i);
    await expect(service.get(admin, "episode-1")).resolves.toMatchObject({ address: null });
  });

  it("records stable no-op receipts without fabricating audit versions or notices", async () => {
    const db = createStore();
    const service = createEfaEpisodesService(db.store, { newId: () => "episode-1" });
    const created = await service.create(owner, createInput());
    const noop = {
      episodeId: "episode-1",
      expectedVersion: 1,
      operationId: "66666666-6666-4666-8666-666666666666",
      eventAt: "2026-10-06T09:30:00.000Z",
      motive: "Traslado de paciente",
      address: "Calle 123, piso 2",
      interventionNumber: "00073",
    };
    const first = await service.update(owner, noop);
    expect(first).toMatchObject({
      episode: { version: 1 },
      operation: { changed: false, appliedVersion: 1 },
    });
    await service.update(owner, {
      ...noop,
      expectedVersion: 1,
      operationId: "77777777-7777-4777-8777-777777777777",
      motive: "Nuevo motivo",
    });
    const retry = await service.update(owner, noop);
    expect(retry).toMatchObject({
      episode: { version: 2, motive: "Nuevo motivo" },
      operation: { changed: false, appliedVersion: 1, replayed: true },
    });
    expect(db.audits).toHaveLength(2);
    expect(db.notices).toHaveLength(0);
    expect(db.operationLookup).toHaveLength(3);
    await expect(service.update(owner, { ...noop, motive: "Payload distinto" })).rejects.toThrow(
      /identidad/i,
    );
    expect(db.operationLookup).toHaveLength(3);
    expect(created.operation.appliedVersion).toBe(1);
  });

  it("replays a creation after closure and later edits using the receipt fingerprint", async () => {
    const db = createStore();
    const service = createEfaEpisodesService(db.store, { newId: () => "episode-1" });
    const original = createInput();
    const created = await service.create(owner, original);
    db.closeGuard(guardId);
    await service.update(owner, {
      episodeId: created.episode.id,
      expectedVersion: 1,
      operationId: "88888888-8888-4888-8888-888888888888",
      eventAt: "2026-10-06T10:15:00.000Z",
      motive: "Actualizado",
      address: "Calle 123, piso 2",
      interventionNumber: "00073",
    });
    const retry = await service.create(owner, original);
    expect(retry).toMatchObject({
      episode: { id: created.episode.id, version: 2, motive: "Actualizado" },
      operation: { appliedVersion: 1, replayed: true },
    });
    expect(db.episodes).toHaveLength(1);
  });

  it("rechecks creation identity after acquiring the origin guard lock", async () => {
    const db = createStore();
    const service = createEfaEpisodesService(db.store, { newId: () => "episode-1" });
    db.setForcedCreationMisses(3);
    const results = await Promise.all([
      service.create(owner, createInput()),
      service.create(owner, createInput()),
    ]);
    expect(results.map((result) => result.episode.id)).toEqual(["episode-1", "episode-1"]);
    expect(db.episodes).toHaveLength(1);
    expect(db.audits).toHaveLength(1);
    expect(db.operationLookup).toHaveLength(1);
    expect(db.guardLocks).toEqual([guardId, guardId]);
  });
});
