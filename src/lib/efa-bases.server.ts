import { and, asc, eq, sql } from "drizzle-orm";
import { getDatabase } from "../db/index.server";
import { accountAccess, accountRoleGrant, efaBase, efaBaseAudit } from "../db/schema";
import { effectiveRoles, type AccountRole } from "./access";

export type EfaBaseRecord = {
  id: string;
  name: string;
  normalizedName: string;
  isActive: boolean;
  version: number;
};
export type EfaBaseView = Pick<EfaBaseRecord, "id" | "name" | "isActive" | "version">;

type EfaBaseState = Pick<EfaBaseRecord, "name" | "isActive">;
type EfaActorRecord = { isActive: boolean; roles: AccountRole[] };

export interface EfaBaseTransaction {
  findActor(userId: string): Promise<EfaActorRecord | null>;
  listBases(activeOnly: boolean): Promise<EfaBaseRecord[]>;
  findBase(baseId: string): Promise<EfaBaseRecord | null>;
  findBaseByNormalizedName(name: string): Promise<EfaBaseRecord | null>;
  insertBase(input: {
    id: string;
    name: string;
    normalizedName: string;
    actorUserId: string;
  }): Promise<void>;
  updateBase(
    baseId: string,
    expectedVersion: number,
    next: Pick<EfaBaseRecord, "name" | "normalizedName" | "isActive" | "version">,
  ): Promise<void>;
  appendAudit(input: {
    baseId: string;
    actorUserId: string;
    action: "created" | "renamed" | "disabled" | "reactivated";
    versionBefore: number | null;
    versionAfter: number;
    beforeState: EfaBaseState | null;
    afterState: EfaBaseState;
  }): Promise<void>;
}

export interface EfaBaseStore {
  transaction<T>(work: (tx: EfaBaseTransaction) => Promise<T>): Promise<T>;
}

export function normalizeBaseName(input: string) {
  const name = input.normalize("NFKC").trim().replace(/\s+/gu, " ");
  const normalizedName = name.toLowerCase();
  if (name.length < 1 || name.length > 120 || normalizedName.length > 120) {
    throw new Error("El nombre de la base debe tener entre 1 y 120 caracteres.");
  }
  return { name, normalizedName };
}

const toState = (base: EfaBaseRecord): EfaBaseState => ({
  name: base.name,
  isActive: base.isActive,
});

export type EfaBasesServiceDependencies = { newId?: () => string };
const randomId = () => crypto.randomUUID();

export function createEfaBasesService(
  store: EfaBaseStore,
  dependencies: EfaBasesServiceDependencies = {},
) {
  const newId = dependencies.newId ?? randomId;

  async function actor(tx: EfaBaseTransaction, userId: string, role: "efa" | "admin") {
    const current = await tx.findActor(userId);
    if (!current?.isActive) throw new Error("La cuenta está inactiva.");
    const roles = effectiveRoles(current.roles);
    if (!roles.includes(role)) {
      throw new Error(
        role === "admin"
          ? "Se requiere administración vigente."
          : "Se requiere acceso EFA vigente.",
      );
    }
  }

  async function requireBase(tx: EfaBaseTransaction, baseId: string) {
    const current = await tx.findBase(baseId);
    if (!current) throw new Error("No se encontró la base institucional.");
    return current;
  }

  function assertVersion(current: EfaBaseRecord, expectedVersion: number) {
    if (current.version !== expectedVersion) {
      throw new Error("La base cambió; actualiza la lista antes de continuar.");
    }
  }

  return {
    async listActive(userId: string) {
      return store.transaction(async (tx) => {
        await actor(tx, userId, "efa");
        return (await tx.listBases(true)).map(toView);
      });
    },

    async listCatalog(userId: string) {
      return store.transaction(async (tx) => {
        await actor(tx, userId, "admin");
        return (await tx.listBases(false)).map(toView);
      });
    },

    async create(userId: string, inputName: string) {
      const { name, normalizedName } = normalizeBaseName(inputName);
      return store.transaction(async (tx) => {
        await actor(tx, userId, "admin");
        if (await tx.findBaseByNormalizedName(normalizedName)) {
          throw new Error("Ya existe una base con ese nombre normalizado.");
        }
        const id = newId();
        await tx.insertBase({ id, name, normalizedName, actorUserId: userId });
        await tx.appendAudit({
          baseId: id,
          actorUserId: userId,
          action: "created",
          versionBefore: null,
          versionAfter: 1,
          beforeState: null,
          afterState: { name, isActive: true },
        });
        return { id };
      });
    },

    async rename(userId: string, input: { baseId: string; expectedVersion: number; name: string }) {
      const nextName = normalizeBaseName(input.name);
      return store.transaction(async (tx) => {
        await actor(tx, userId, "admin");
        const current = await requireBase(tx, input.baseId);
        assertVersion(current, input.expectedVersion);
        const duplicate = await tx.findBaseByNormalizedName(nextName.normalizedName);
        if (duplicate && duplicate.id !== current.id) {
          throw new Error("Ya existe una base con ese nombre normalizado.");
        }
        if (current.name === nextName.name) return;
        const version = current.version + 1;
        await tx.updateBase(current.id, current.version, {
          ...nextName,
          isActive: current.isActive,
          version,
        });
        await tx.appendAudit({
          baseId: current.id,
          actorUserId: userId,
          action: "renamed",
          versionBefore: current.version,
          versionAfter: version,
          beforeState: toState(current),
          afterState: { name: nextName.name, isActive: current.isActive },
        });
      });
    },

    async setActive(
      userId: string,
      input: { baseId: string; expectedVersion: number; isActive: boolean },
    ) {
      return store.transaction(async (tx) => {
        await actor(tx, userId, "admin");
        const current = await requireBase(tx, input.baseId);
        assertVersion(current, input.expectedVersion);
        if (current.isActive === input.isActive) return;
        const version = current.version + 1;
        await tx.updateBase(current.id, current.version, {
          name: current.name,
          normalizedName: current.normalizedName,
          isActive: input.isActive,
          version,
        });
        await tx.appendAudit({
          baseId: current.id,
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

function toView({ id, name, isActive, version }: EfaBaseRecord): EfaBaseView {
  return { id, name, isActive, version };
}

const drizzleStore: EfaBaseStore = {
  async transaction(work) {
    return getDatabase().transaction(async (db) => {
      const tx: EfaBaseTransaction = {
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
        async listBases(activeOnly) {
          const query = db
            .select({
              id: efaBase.id,
              name: efaBase.name,
              normalizedName: efaBase.normalizedName,
              isActive: efaBase.isActive,
              version: efaBase.version,
            })
            .from(efaBase);
          const rows = activeOnly
            ? await query.where(eq(efaBase.isActive, true)).orderBy(asc(efaBase.name))
            : await query.orderBy(asc(efaBase.name));
          return rows;
        },
        async findBase(baseId) {
          const rows = await db
            .select({
              id: efaBase.id,
              name: efaBase.name,
              normalizedName: efaBase.normalizedName,
              isActive: efaBase.isActive,
              version: efaBase.version,
            })
            .from(efaBase)
            .where(eq(efaBase.id, baseId))
            .limit(1);
          return rows[0] ?? null;
        },
        async findBaseByNormalizedName(normalizedName) {
          const rows = await db
            .select({
              id: efaBase.id,
              name: efaBase.name,
              normalizedName: efaBase.normalizedName,
              isActive: efaBase.isActive,
              version: efaBase.version,
            })
            .from(efaBase)
            .where(eq(efaBase.normalizedName, normalizedName))
            .limit(1);
          return rows[0] ?? null;
        },
        async insertBase(input) {
          await db.insert(efaBase).values({
            id: input.id,
            name: input.name,
            normalizedName: input.normalizedName,
            isActive: true,
            version: 1,
            createdByUserId: input.actorUserId,
          });
        },
        async updateBase(baseId, expectedVersion, next) {
          const changed = await db
            .update(efaBase)
            .set({ ...next, updatedAt: sql`now()` })
            .where(and(eq(efaBase.id, baseId), eq(efaBase.version, expectedVersion)))
            .returning({ id: efaBase.id });
          if (!changed.length)
            throw new Error("La base cambió; actualiza la lista antes de continuar.");
        },
        async appendAudit(input) {
          await db.insert(efaBaseAudit).values(input);
        },
      };
      return work(tx);
    });
  },
};

export const efaBases = createEfaBasesService(drizzleStore);
