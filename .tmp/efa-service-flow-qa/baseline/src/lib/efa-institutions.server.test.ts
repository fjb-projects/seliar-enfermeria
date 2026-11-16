import { describe, expect, it } from "vitest";
import {
  createEfaInstitutionsService,
  normalizeInstitutionName,
  type EfaInstitutionAudit,
  type EfaInstitutionTransaction,
} from "./efa-institutions.server";

type Institution = {
  id: string;
  name: string;
  normalizedName: string;
  isActive: boolean;
  version: number;
};

function createStore() {
  const institutions: Institution[] = [
    {
      id: "institution-1",
      name: "Hospital Central",
      normalizedName: "hospital central",
      isActive: true,
      version: 1,
    },
    {
      id: "institution-2",
      name: "Clínica Norte",
      normalizedName: "clínica norte",
      isActive: false,
      version: 2,
    },
  ];
  const audits: unknown[] = [];
  let actor = { isActive: true, roles: ["admin"] as Array<"efa" | "admin"> };
  const tx = {
    async findActor() {
      return actor;
    },
    async listInstitutions(activeOnly: boolean) {
      return institutions
        .filter((institution) => !activeOnly || institution.isActive)
        .map((item) => ({ ...item }));
    },
    async findInstitution(id: string) {
      const item = institutions.find((institution) => institution.id === id);
      return item ? { ...item } : null;
    },
    async findInstitutionByNormalizedName(name: string) {
      const item = institutions.find((institution) => institution.normalizedName === name);
      return item ? { ...item } : null;
    },
    async insertInstitution(input: {
      id: string;
      name: string;
      normalizedName: string;
      actorUserId: string;
    }) {
      institutions.push({
        id: input.id,
        name: input.name,
        normalizedName: input.normalizedName,
        isActive: true,
        version: 1,
      });
    },
    async updateInstitution(id: string, expectedVersion: number, next: Omit<Institution, "id">) {
      const item = institutions.find((institution) => institution.id === id);
      if (!item || item.version !== expectedVersion) throw new Error("stale-institution-version");
      Object.assign(item, next);
    },
    async appendAudit(input: unknown) {
      audits.push(input);
    },
    async listAudit(institutionId: string) {
      return audits.filter(
        (entry) => (entry as { institutionId: string }).institutionId === institutionId,
      ) as EfaInstitutionAudit[];
    },
  } satisfies EfaInstitutionTransaction;
  return {
    store: {
      async transaction<T>(work: (transaction: EfaInstitutionTransaction) => Promise<T>) {
        return work(tx);
      },
    },
    institutions,
    audits,
    setActor(next: typeof actor) {
      actor = next;
    },
  };
}

describe("EFA institutional destination catalog", () => {
  it("normalizes names and enforces database length limits", () => {
    expect(normalizeInstitutionName("  Hospital   del Sur ")).toEqual({
      name: "Hospital del Sur",
      normalizedName: "hospital del sur",
    });
    expect(() => normalizeInstitutionName("İ".repeat(120))).toThrow(/1 y 120 caracteres/i);
  });

  it("allows active EFA actors to list only active catalog choices", async () => {
    const db = createStore();
    db.setActor({ isActive: true, roles: ["efa"] });
    await expect(createEfaInstitutionsService(db.store).listActive("efa-user")).resolves.toEqual([
      expect.objectContaining({ id: "institution-1", isActive: true }),
    ]);
  });

  it("rechecks account activity and EFA role for listing and inline creation", async () => {
    const db = createStore();
    db.setActor({ isActive: false, roles: ["efa"] });
    const service = createEfaInstitutionsService(db.store);
    await expect(service.listActive("efa-user")).rejects.toThrow(/inactiva/i);
    await expect(service.createInline("efa-user", "Hospital Sur")).rejects.toThrow(/inactiva/i);
    db.setActor({ isActive: true, roles: [] });
    await expect(service.createInline("nurse-user", "Hospital Sur")).rejects.toThrow(/acceso EFA/i);
    expect(db.institutions).toHaveLength(2);
  });

  it("allows EFA inline creation with normalized duplicate protection and actor audit", async () => {
    const db = createStore();
    db.setActor({ isActive: true, roles: ["efa"] });
    const service = createEfaInstitutionsService(db.store, { newId: () => "institution-3" });
    await expect(service.createInline("efa-user", "  Sanatorio   Sur ")).resolves.toEqual({
      id: "institution-3",
    });
    expect(db.institutions.at(-1)).toMatchObject({
      name: "Sanatorio Sur",
      normalizedName: "sanatorio sur",
      isActive: true,
      version: 1,
    });
    expect(db.audits[0]).toMatchObject({
      actorUserId: "efa-user",
      action: "created",
      versionBefore: null,
      versionAfter: 1,
      beforeState: null,
      afterState: { name: "Sanatorio Sur", isActive: true },
    });
    await expect(service.createInline("efa-user", " SANATORIO  SUR ")).rejects.toThrow(
      /ya existe/i,
    );
  });

  it("lets only administrators correct, deactivate, and reactivate with versioned before/after audit", async () => {
    const db = createStore();
    const service = createEfaInstitutionsService(db.store);
    await expect(
      service.rename("admin-user", {
        institutionId: "institution-1",
        expectedVersion: 1,
        name: "Hospital Regional",
      }),
    ).resolves.toBeUndefined();
    await service.setActive("admin-user", {
      institutionId: "institution-1",
      expectedVersion: 2,
      isActive: false,
    });
    await service.setActive("admin-user", {
      institutionId: "institution-1",
      expectedVersion: 3,
      isActive: true,
    });
    expect(db.institutions[0]).toMatchObject({
      name: "Hospital Regional",
      normalizedName: "hospital regional",
      isActive: true,
      version: 4,
    });
    expect(db.audits).toMatchObject([
      {
        action: "renamed",
        versionBefore: 1,
        versionAfter: 2,
        beforeState: { name: "Hospital Central", isActive: true },
        afterState: { name: "Hospital Regional", isActive: true },
      },
      {
        action: "disabled",
        versionBefore: 2,
        versionAfter: 3,
        beforeState: { name: "Hospital Regional", isActive: true },
        afterState: { name: "Hospital Regional", isActive: false },
      },
      {
        action: "reactivated",
        versionBefore: 3,
        versionAfter: 4,
        beforeState: { name: "Hospital Regional", isActive: false },
        afterState: { name: "Hospital Regional", isActive: true },
      },
    ]);
    expect(await service.listHistory("admin-user", "institution-1")).toHaveLength(3);
    db.setActor({ isActive: true, roles: ["efa"] });
    await expect(
      service.rename("efa-user", {
        institutionId: "institution-1",
        expectedVersion: 4,
        name: "Restricted",
      }),
    ).rejects.toThrow(/administraci/i);
  });

  it("rejects duplicate normalized corrections and stale writes without changing history", async () => {
    const db = createStore();
    const service = createEfaInstitutionsService(db.store);
    await expect(
      service.rename("admin-user", {
        institutionId: "institution-1",
        expectedVersion: 1,
        name: " clínica   NORTE ",
      }),
    ).rejects.toThrow(/ya existe/i);
    await expect(
      service.rename("admin-user", {
        institutionId: "institution-1",
        expectedVersion: 2,
        name: "Hospital Regional",
      }),
    ).rejects.toThrow(/cambi/i);
    expect(db.institutions[0]!.name).toBe("Hospital Central");
    expect(db.audits).toHaveLength(0);
  });
});
