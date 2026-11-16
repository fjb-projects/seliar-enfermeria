import { and, asc, eq, sql } from "drizzle-orm";
import { getDatabase } from "../db/index.server";
import { accountAccess, accountRoleGrant, efaInstitution, efaInstitutionAudit } from "../db/schema";
import { effectiveRoles, type AccountRole } from "./access";

export type EfaInstitutionRecord = {
  id: string;
  name: string;
  normalizedName: string;
  isActive: boolean;
  version: number;
};
export type EfaInstitutionView = Pick<EfaInstitutionRecord, "id" | "name" | "isActive" | "version">;
export type EfaInstitutionState = Pick<EfaInstitutionRecord, "name" | "isActive">;
export type EfaInstitutionAudit = {
  id: string;
  institutionId: string;
  actorUserId: string;
  action: "created" | "renamed" | "disabled" | "reactivated";
  versionBefore: number | null;
  versionAfter: number;
  beforeState: EfaInstitutionState | null;
  afterState: EfaInstitutionState;
  occurredAt: Date;
};

type ActorRecord = { isActive: boolean; roles: AccountRole[] };
export interface EfaInstitutionTransaction {
  findActor(userId: string): Promise<ActorRecord | null>;
  listInstitutions(activeOnly: boolean): Promise<EfaInstitutionRecord[]>;
  findInstitution(institutionId: string): Promise<EfaInstitutionRecord | null>;
  findInstitutionByNormalizedName(name: string): Promise<EfaInstitutionRecord | null>;
  insertInstitution(input: {
    id: string;
    name: string;
    normalizedName: string;
    actorUserId: string;
  }): Promise<void>;
  updateInstitution(
    institutionId: string,
    expectedVersion: number,
    next: Omit<EfaInstitutionRecord, "id">,
  ): Promise<void>;
  appendAudit(input: Omit<EfaInstitutionAudit, "id" | "occurredAt">): Promise<void>;
  listAudit(institutionId: string): Promise<EfaInstitutionAudit[]>;
}
export interface EfaInstitutionStore {
  transaction<T>(work: (tx: EfaInstitutionTransaction) => Promise<T>): Promise<T>;
}

export function normalizeInstitutionName(input: string) {
  const name = input.normalize("NFKC").trim().replace(/\s+/gu, " ");
  const normalizedName = name.toLowerCase();
  if (name.length < 1 || name.length > 120 || normalizedName.length > 120) {
    throw new Error("El nombre de la institución debe tener entre 1 y 120 caracteres.");
  }
  return { name, normalizedName };
}

const toView = ({ id, name, isActive, version }: EfaInstitutionRecord): EfaInstitutionView => ({
  id,
  name,
  isActive,
  version,
});
const toState = ({ name, isActive }: EfaInstitutionRecord): EfaInstitutionState => ({
  name,
  isActive,
});

export function createEfaInstitutionsService(
  store: EfaInstitutionStore,
  dependencies: { newId?: () => string } = {},
) {
  const newId = dependencies.newId ?? (() => crypto.randomUUID());

  async function requireRole(tx: EfaInstitutionTransaction, userId: string, role: "efa" | "admin") {
    const current = await tx.findActor(userId);
    if (!current?.isActive) throw new Error("La cuenta está inactiva.");
    if (!effectiveRoles(current.roles).includes(role)) {
      throw new Error(
        role === "admin"
          ? "Se requiere administración vigente."
          : "Se requiere acceso EFA vigente.",
      );
    }
  }

  async function requireInstitution(tx: EfaInstitutionTransaction, institutionId: string) {
    const current = await tx.findInstitution(institutionId);
    if (!current) throw new Error("No se encontró la institución/destino.");
    return current;
  }

  function assertVersion(current: EfaInstitutionRecord, expectedVersion: number) {
    if (current.version !== expectedVersion)
      throw new Error("La institución cambió; actualiza la lista antes de continuar.");
  }

  async function create(userId: string, inputName: string, role: "efa" | "admin") {
    const { name, normalizedName } = normalizeInstitutionName(inputName);
    return store.transaction(async (tx) => {
      await requireRole(tx, userId, role);
      if (await tx.findInstitutionByNormalizedName(normalizedName))
        throw new Error("Ya existe una institución con ese nombre normalizado.");
      const id = newId();
      await tx.insertInstitution({ id, name, normalizedName, actorUserId: userId });
      await tx.appendAudit({
        institutionId: id,
        actorUserId: userId,
        action: "created",
        versionBefore: null,
        versionAfter: 1,
        beforeState: null,
        afterState: { name, isActive: true },
      });
      return { id };
    });
  }

  return {
    async listActive(userId: string) {
      return store.transaction(async (tx) => {
        await requireRole(tx, userId, "efa");
        return (await tx.listInstitutions(true)).map(toView);
      });
    },
    async listCatalog(userId: string) {
      return store.transaction(async (tx) => {
        await requireRole(tx, userId, "admin");
        return (await tx.listInstitutions(false)).map(toView);
      });
    },
    async listHistory(userId: string, institutionId: string) {
      return store.transaction(async (tx) => {
        await requireRole(tx, userId, "admin");
        await requireInstitution(tx, institutionId);
        return tx.listAudit(institutionId);
      });
    },
    createInline(userId: string, name: string) {
      return create(userId, name, "efa");
    },
    createAdmin(userId: string, name: string) {
      return create(userId, name, "admin");
    },
    async rename(
      userId: string,
      input: { institutionId: string; expectedVersion: number; name: string },
    ) {
      const next = normalizeInstitutionName(input.name);
      return store.transaction(async (tx) => {
        await requireRole(tx, userId, "admin");
        const current = await requireInstitution(tx, input.institutionId);
        assertVersion(current, input.expectedVersion);
        const duplicate = await tx.findInstitutionByNormalizedName(next.normalizedName);
        if (duplicate && duplicate.id !== current.id)
          throw new Error("Ya existe una institución con ese nombre normalizado.");
        if (current.name === next.name) return;
        const version = current.version + 1;
        await tx.updateInstitution(current.id, current.version, {
          ...next,
          isActive: current.isActive,
          version,
        });
        await tx.appendAudit({
          institutionId: current.id,
          actorUserId: userId,
          action: "renamed",
          versionBefore: current.version,
          versionAfter: version,
          beforeState: toState(current),
          afterState: { name: next.name, isActive: current.isActive },
        });
      });
    },
    async setActive(
      userId: string,
      input: { institutionId: string; expectedVersion: number; isActive: boolean },
    ) {
      return store.transaction(async (tx) => {
        await requireRole(tx, userId, "admin");
        const current = await requireInstitution(tx, input.institutionId);
        assertVersion(current, input.expectedVersion);
        if (current.isActive === input.isActive) return;
        const version = current.version + 1;
        await tx.updateInstitution(current.id, current.version, {
          name: current.name,
          normalizedName: current.normalizedName,
          isActive: input.isActive,
          version,
        });
        await tx.appendAudit({
          institutionId: current.id,
          actorUserId: userId,
          action: input.isActive ? "reactivated" : "disabled",
          versionBefore: current.version,
          versionAfter: version,
          beforeState: toState(current),
          afterState: { name: current.name, isActive: input.isActive },
        });
      });
    },
  };
}

const drizzleStore: EfaInstitutionStore = {
  async transaction(work) {
    return getDatabase().transaction(async (db) => {
      const tx: EfaInstitutionTransaction = {
        async findActor(userId) {
          const rows = await db
            .select({ isActive: accountAccess.isActive, role: accountRoleGrant.role })
            .from(accountAccess)
            .leftJoin(accountRoleGrant, eq(accountRoleGrant.userId, accountAccess.userId))
            .where(eq(accountAccess.userId, userId));
          if (!rows.length) return null;
          return {
            isActive: rows[0]!.isActive,
            roles: rows.flatMap((row) => (row.role ? [row.role as AccountRole] : [])),
          };
        },
        async listInstitutions(activeOnly) {
          const query = db
            .select({
              id: efaInstitution.id,
              name: efaInstitution.name,
              normalizedName: efaInstitution.normalizedName,
              isActive: efaInstitution.isActive,
              version: efaInstitution.version,
            })
            .from(efaInstitution);
          return activeOnly
            ? query.where(eq(efaInstitution.isActive, true)).orderBy(asc(efaInstitution.name))
            : query.orderBy(asc(efaInstitution.name));
        },
        async findInstitution(institutionId) {
          const rows = await db
            .select({
              id: efaInstitution.id,
              name: efaInstitution.name,
              normalizedName: efaInstitution.normalizedName,
              isActive: efaInstitution.isActive,
              version: efaInstitution.version,
            })
            .from(efaInstitution)
            .where(eq(efaInstitution.id, institutionId))
            .limit(1);
          return rows[0] ?? null;
        },
        async findInstitutionByNormalizedName(normalizedName) {
          const rows = await db
            .select({
              id: efaInstitution.id,
              name: efaInstitution.name,
              normalizedName: efaInstitution.normalizedName,
              isActive: efaInstitution.isActive,
              version: efaInstitution.version,
            })
            .from(efaInstitution)
            .where(eq(efaInstitution.normalizedName, normalizedName))
            .limit(1);
          return rows[0] ?? null;
        },
        async insertInstitution(input) {
          await db.insert(efaInstitution).values({
            id: input.id,
            name: input.name,
            normalizedName: input.normalizedName,
            isActive: true,
            version: 1,
            createdByUserId: input.actorUserId,
          });
        },
        async updateInstitution(institutionId, expectedVersion, next) {
          const changed = await db
            .update(efaInstitution)
            .set({ ...next, updatedAt: sql`now()` })
            .where(
              and(
                eq(efaInstitution.id, institutionId),
                eq(efaInstitution.version, expectedVersion),
              ),
            )
            .returning({ id: efaInstitution.id });
          if (!changed.length)
            throw new Error("La institución cambió; actualiza la lista antes de continuar.");
        },
        async appendAudit(input) {
          await db.insert(efaInstitutionAudit).values(input);
        },
        async listAudit(institutionId) {
          return db
            .select({
              id: efaInstitutionAudit.id,
              institutionId: efaInstitutionAudit.institutionId,
              actorUserId: efaInstitutionAudit.actorUserId,
              action: efaInstitutionAudit.action,
              versionBefore: efaInstitutionAudit.versionBefore,
              versionAfter: efaInstitutionAudit.versionAfter,
              beforeState: efaInstitutionAudit.beforeState,
              afterState: efaInstitutionAudit.afterState,
              occurredAt: efaInstitutionAudit.occurredAt,
            })
            .from(efaInstitutionAudit)
            .where(eq(efaInstitutionAudit.institutionId, institutionId))
            .orderBy(asc(efaInstitutionAudit.versionAfter)) as Promise<EfaInstitutionAudit[]>;
        },
      };
      return work(tx);
    });
  },
};

export const efaInstitutions = createEfaInstitutionsService(drizzleStore);
