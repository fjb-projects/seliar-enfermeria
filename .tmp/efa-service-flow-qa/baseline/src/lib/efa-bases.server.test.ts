import { describe, expect, it } from "vitest";
import {
  createEfaBasesService,
  normalizeBaseName,
  type EfaBaseTransaction,
} from "./efa-bases.server";

type BaseRow = {
  id: string;
  name: string;
  normalizedName: string;
  isActive: boolean;
  version: number;
};

function createStore() {
  const bases: BaseRow[] = [
    { id: "base-1", name: "Central", normalizedName: "central", isActive: true, version: 1 },
    { id: "base-2", name: "Norte", normalizedName: "norte", isActive: false, version: 2 },
  ];
  const audits: unknown[] = [];
  let actor = { isActive: true, roles: ["admin"] as Array<"efa" | "admin"> };
  const tx = {
    async findActor() {
      return actor;
    },
    async listBases(activeOnly: boolean) {
      return bases.filter((base) => !activeOnly || base.isActive).map((base) => ({ ...base }));
    },
    async findBase(id: string) {
      const base = bases.find((item) => item.id === id);
      return base ? { ...base } : null;
    },
    async findBaseByNormalizedName(name: string) {
      const base = bases.find((item) => item.normalizedName === name);
      return base ? { ...base } : null;
    },
    async insertBase(input: Omit<BaseRow, "version" | "isActive"> & { actorUserId: string }) {
      const { actorUserId: _actorUserId, ...base } = input;
      bases.push({ ...base, isActive: true, version: 1 });
    },
    async updateBase(
      id: string,
      expectedVersion: number,
      next: Pick<BaseRow, "name" | "normalizedName" | "isActive" | "version">,
    ) {
      const base = bases.find((item) => item.id === id);
      if (!base || base.version !== expectedVersion) throw new Error("stale-base-version");
      Object.assign(base, next);
    },
    async appendAudit(input: unknown) {
      audits.push(input);
    },
  } satisfies EfaBaseTransaction;
  const store = {
    async transaction<T>(work: (transaction: EfaBaseTransaction) => Promise<T>) {
      return work(tx);
    },
  };
  return {
    store,
    bases,
    audits,
    setActor(next: typeof actor) {
      actor = next;
    },
    tx,
  };
}

describe("EFA institutional base service", () => {
  it("normalizes display whitespace and case for duplicate detection", () => {
    expect(normalizeBaseName("  Base   Norte ")).toEqual({
      name: "Base Norte",
      normalizedName: "base norte",
    });
  });

  it("rejects names whose normalized key exceeds the database column limit", () => {
    expect(() => normalizeBaseName("İ".repeat(120))).toThrow(/1 y 120 caracteres/i);
  });

  it("allows active EFA actors to list only active bases", async () => {
    const db = createStore();
    db.setActor({ isActive: true, roles: ["efa"] });
    await expect(createEfaBasesService(db.store).listActive("efa-user")).resolves.toEqual([
      expect.objectContaining({ id: "base-1" }),
    ]);
  });

  it("lets an administrator list all bases while rejecting nurses", async () => {
    const db = createStore();
    await expect(createEfaBasesService(db.store).listCatalog("admin-user")).resolves.toHaveLength(
      2,
    );
    db.setActor({ isActive: true, roles: [] });
    await expect(createEfaBasesService(db.store).listCatalog("nurse-user")).rejects.toThrow(
      /administraci/i,
    );
  });

  it("treats administration as effective EFA and rechecks active actor state", async () => {
    const db = createStore();
    await expect(createEfaBasesService(db.store).listActive("admin-user")).resolves.toHaveLength(1);
    db.setActor({ isActive: false, roles: ["admin"] });
    await expect(createEfaBasesService(db.store).listActive("admin-user")).rejects.toThrow(
      /inactiva/i,
    );
  });

  it("rejects duplicate normalized names and does not write an audit event", async () => {
    const db = createStore();
    await expect(createEfaBasesService(db.store).create("admin-user", " CENTRAL ")).rejects.toThrow(
      /ya existe/i,
    );
    expect(db.bases).toHaveLength(2);
    expect(db.audits).toHaveLength(0);
  });

  it("creates normalized catalog rows with an actor-attributed creation event", async () => {
    const db = createStore();
    const service = createEfaBasesService(db.store, { newId: () => "base-3" });
    await expect(service.create("admin-user", "  Sur   Oeste ")).resolves.toEqual({ id: "base-3" });
    expect(db.bases.at(-1)).toMatchObject({
      id: "base-3",
      name: "Sur Oeste",
      normalizedName: "sur oeste",
      isActive: true,
      version: 1,
    });
    expect(db.audits[0]).toMatchObject({
      actorUserId: "admin-user",
      action: "created",
      versionBefore: null,
      versionAfter: 1,
      afterState: { name: "Sur Oeste", isActive: true },
    });
  });

  it("rejects stale renames before mutation", async () => {
    const db = createStore();
    await expect(
      createEfaBasesService(db.store).rename("admin-user", {
        baseId: "base-1",
        expectedVersion: 2,
        name: "Central Sur",
      }),
    ).rejects.toThrow(/cambi/i);
    expect(db.bases[0]!.name).toBe("Central");
    expect(db.audits).toHaveLength(0);
  });

  it("deactivates without deleting history and excludes the base from active listing", async () => {
    const db = createStore();
    const service = createEfaBasesService(db.store);
    await service.setActive("admin-user", {
      baseId: "base-1",
      expectedVersion: 1,
      isActive: false,
    });
    expect(db.bases[0]).toMatchObject({ isActive: false, version: 2 });
    expect(db.audits[0]).toMatchObject({
      actorUserId: "admin-user",
      action: "disabled",
      versionBefore: 1,
      versionAfter: 2,
      beforeState: { name: "Central", isActive: true },
      afterState: { name: "Central", isActive: false },
    });
    db.setActor({ isActive: true, roles: ["efa"] });
    await expect(service.listActive("efa-user")).resolves.toEqual([]);
    expect(db.bases).toHaveLength(2);
  });

  it("denies catalog mutation to an EFA-only actor", async () => {
    const db = createStore();
    db.setActor({ isActive: true, roles: ["efa"] });
    await expect(createEfaBasesService(db.store).create("efa-user", "Sur")).rejects.toThrow(
      /administraci/i,
    );
    expect(db.bases).toHaveLength(2);
  });
});
