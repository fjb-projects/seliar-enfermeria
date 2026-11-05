import { and, eq, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import {
  account,
  accountAccess,
  accountAudit,
  accountRoleGrant,
  session,
  user,
} from "../db/schema";
import { getDatabase } from "../db/index.server";
import type { AccountRole } from "./access";

type Snapshot = { isActive: boolean; roles: AccountRole[] };
type AccountRecord = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  version: number;
  roles: AccountRole[];
};
export type AdminActor = { userId: string; isActive: boolean; roles: readonly AccountRole[] };

export interface AccountTransaction {
  lockAdministrators(): Promise<void>;
  findAccount(userId: string): Promise<AccountRecord | null>;
  countActiveAdministrators(): Promise<number>;
  insertAccount(input: {
    id: string;
    name: string;
    email: string;
    passwordHash: string;
    roles: AccountRole[];
    actorUserId: string;
  }): Promise<void>;
  updateAccount(
    userId: string,
    expectedVersion: number,
    version: number,
    isActive: boolean,
  ): Promise<void>;
  replaceRoles(userId: string, actorId: string, roles: AccountRole[]): Promise<void>;
  revokeSessions(userId: string): Promise<void>;
  resetCredential(userId: string, passwordHash: string): Promise<void>;
  appendAudit(input: {
    actorUserId: string;
    targetUserId: string;
    action: string;
    versionBefore: number | null;
    versionAfter: number;
    beforeState: Snapshot | null;
    afterState: Snapshot;
  }): Promise<void>;
  listAccounts(): Promise<AccountRecord[]>;
}
export interface AccountStore {
  transaction<T>(work: (tx: AccountTransaction) => Promise<T>): Promise<T>;
}

type AccountListRow = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  version: number;
  role: AccountRole | null;
};

export function mapAccountList(rows: AccountListRow[]): AccountRecord[] {
  const byId = new Map<string, AccountRecord>();
  for (const row of rows) {
    const item = byId.get(row.id) ?? {
      id: row.id,
      name: row.name,
      email: row.email,
      isActive: row.isActive,
      version: row.version,
      roles: [],
    };
    if (row.role) item.roles.push(row.role);
    byId.set(row.id, item);
  }
  return [...byId.values()].map((item) => ({ ...item, roles: item.roles.sort() }));
}

export type AccountServiceDependencies = {
  hashPassword?: (password: string) => Promise<string>;
  newId?: () => string;
};
const randomId = () => crypto.randomUUID();
const snapshot = (record: AccountRecord): Snapshot => ({
  isActive: record.isActive,
  roles: [...record.roles].sort(),
});

export function createAccountsService(store: AccountStore, deps: AccountServiceDependencies = {}) {
  const hash = deps.hashPassword ?? hashPassword;
  const createId = deps.newId ?? randomId;
  async function assertActor(tx: AccountTransaction, actor: AdminActor) {
    const current = await tx.findAccount(actor.userId);
    if (!actor.isActive || !current?.isActive || !current.roles.includes("admin"))
      throw new Error("Se requiere administración vigente");
  }
  async function assertLastAdminRetained(
    tx: AccountTransaction,
    current: AccountRecord,
    nextActive: boolean,
    nextRoles: AccountRole[],
  ) {
    const wasAdmin = current.isActive && current.roles.includes("admin");
    const remainsAdmin = nextActive && nextRoles.includes("admin");
    if (wasAdmin && !remainsAdmin && (await tx.countActiveAdministrators()) <= 1)
      throw new Error("No se puede quitar la última cuenta administradora activa");
  }

  return {
    async create(
      actor: AdminActor,
      input: { name: string; email: string; password: string; roles: AccountRole[] },
    ) {
      const passwordHash = await hash(input.password);
      return store.transaction(async (tx) => {
        await tx.lockAdministrators();
        await assertActor(tx, actor);
        const id = createId();
        const roles = [...new Set(input.roles)].sort() as AccountRole[];
        await tx.insertAccount({
          id,
          name: input.name.trim(),
          email: input.email.trim().toLowerCase(),
          passwordHash,
          roles,
          actorUserId: actor.userId,
        });
        await tx.appendAudit({
          actorUserId: actor.userId,
          targetUserId: id,
          action: "created",
          versionBefore: null,
          versionAfter: 1,
          beforeState: null,
          afterState: { isActive: true, roles },
        });
        return { id };
      });
    },
    async list(actor: AdminActor) {
      return store.transaction(async (tx) => {
        await assertActor(tx, actor);
        return tx.listAccounts();
      });
    },
    async setRoles(
      actor: AdminActor,
      input: { userId: string; expectedVersion: number; roles: AccountRole[] },
    ) {
      return store.transaction(async (tx) => {
        await tx.lockAdministrators();
        await assertActor(tx, actor);
        const current = await tx.findAccount(input.userId);
        if (!current) throw new Error("No se encontró la cuenta");
        if (current.version !== input.expectedVersion)
          throw new Error("La cuenta cambió; actualiza la lista antes de continuar");
        const roles = [...new Set(input.roles)].sort() as AccountRole[];
        await assertLastAdminRetained(tx, current, current.isActive, roles);
        await tx.replaceRoles(current.id, actor.userId, roles);
        await tx.updateAccount(current.id, current.version, current.version + 1, current.isActive);
        await tx.appendAudit({
          actorUserId: actor.userId,
          targetUserId: current.id,
          action: "roles_changed",
          versionBefore: current.version,
          versionAfter: current.version + 1,
          beforeState: snapshot(current),
          afterState: { isActive: current.isActive, roles },
        });
      });
    },
    async setActive(
      actor: AdminActor,
      input: { userId: string; expectedVersion: number; isActive: boolean },
    ) {
      return store.transaction(async (tx) => {
        await tx.lockAdministrators();
        await assertActor(tx, actor);
        const current = await tx.findAccount(input.userId);
        if (!current) throw new Error("No se encontró la cuenta");
        if (current.version !== input.expectedVersion)
          throw new Error("La cuenta cambió; actualiza la lista antes de continuar");
        if (current.isActive === input.isActive) return;
        await assertLastAdminRetained(tx, current, input.isActive, current.roles);
        await tx.updateAccount(current.id, current.version, current.version + 1, input.isActive);
        if (!input.isActive) await tx.revokeSessions(current.id);
        await tx.appendAudit({
          actorUserId: actor.userId,
          targetUserId: current.id,
          action: input.isActive ? "reactivated" : "disabled",
          versionBefore: current.version,
          versionAfter: current.version + 1,
          beforeState: snapshot(current),
          afterState: { isActive: input.isActive, roles: current.roles },
        });
      });
    },
    async resetPassword(
      actor: AdminActor,
      input: { userId: string; expectedVersion: number; password: string },
    ) {
      const passwordHash = await hash(input.password);
      await store.transaction(async (tx) => {
        await tx.lockAdministrators();
        await assertActor(tx, actor);
        const current = await tx.findAccount(input.userId);
        if (!current) throw new Error("No se encontró la cuenta");
        if (current.version !== input.expectedVersion)
          throw new Error("La cuenta cambió; actualiza la lista antes de continuar");
        await tx.resetCredential(current.id, passwordHash);
        await tx.revokeSessions(current.id);
        await tx.updateAccount(current.id, current.version, current.version + 1, current.isActive);
        await tx.appendAudit({
          actorUserId: actor.userId,
          targetUserId: current.id,
          action: "password_reset",
          versionBefore: current.version,
          versionAfter: current.version + 1,
          beforeState: snapshot(current),
          afterState: snapshot(current),
        });
      });
      return { ok: true as const };
    },
  };
}

const drizzleStore: AccountStore = {
  async transaction(work) {
    return getDatabase().transaction(async (db) => {
      const tx: AccountTransaction = {
        lockAdministrators: async () => {
          await db.execute(sql`select pg_advisory_xact_lock(71420261)`);
        },
        async findAccount(userId) {
          const rows = await db
            .select({
              id: user.id,
              name: user.name,
              email: user.email,
              isActive: accountAccess.isActive,
              version: accountAccess.version,
              role: accountRoleGrant.role,
            })
            .from(user)
            .innerJoin(accountAccess, eq(accountAccess.userId, user.id))
            .leftJoin(accountRoleGrant, eq(accountRoleGrant.userId, user.id))
            .where(eq(user.id, userId));
          if (!rows.length) return null;
          return {
            id: rows[0]!.id,
            name: rows[0]!.name,
            email: rows[0]!.email,
            isActive: rows[0]!.isActive,
            version: rows[0]!.version,
            roles: rows.flatMap((row) => (row.role ? [row.role] : [])),
          };
        },
        async countActiveAdministrators() {
          const rows = await db
            .select({ userId: accountRoleGrant.userId })
            .from(accountRoleGrant)
            .innerJoin(accountAccess, eq(accountAccess.userId, accountRoleGrant.userId))
            .where(sql`${accountRoleGrant.role} = 'admin' and ${accountAccess.isActive} = true`);
          return rows.length;
        },
        async insertAccount(input) {
          const now = new Date();
          await db.insert(user).values({
            id: input.id,
            name: input.name,
            email: input.email,
            emailVerified: true,
            createdAt: now,
            updatedAt: now,
          });
          await db.insert(account).values({
            id: randomId(),
            accountId: input.id,
            providerId: "credential",
            userId: input.id,
            password: input.passwordHash,
            createdAt: now,
            updatedAt: now,
          });
          await db.insert(accountAccess).values({
            userId: input.id,
            isActive: true,
            version: 1,
            createdAt: now,
            updatedAt: now,
          });
          if (input.roles.length)
            await db.insert(accountRoleGrant).values(
              input.roles.map((role) => ({
                userId: input.id,
                role,
                grantedByUserId: input.actorUserId,
                grantedAt: now,
              })),
            );
        },
        async updateAccount(userId, expectedVersion, version, isActive) {
          const changed = await db
            .update(accountAccess)
            .set({ version, isActive, updatedAt: new Date() })
            .where(
              and(eq(accountAccess.userId, userId), eq(accountAccess.version, expectedVersion)),
            )
            .returning({ userId: accountAccess.userId });
          if (!changed.length)
            throw new Error("La cuenta cambió; actualizá la lista antes de continuar");
        },
        async replaceRoles(userId, actorId, roles) {
          await db.delete(accountRoleGrant).where(eq(accountRoleGrant.userId, userId));
          if (roles.length)
            await db
              .insert(accountRoleGrant)
              .values(roles.map((role) => ({ userId, role, grantedByUserId: actorId })));
        },
        async revokeSessions(userId) {
          await db.delete(session).where(eq(session.userId, userId));
        },
        async resetCredential(userId, passwordHash) {
          const changed = await db
            .update(account)
            .set({ password: passwordHash, updatedAt: new Date() })
            .where(sql`${account.userId} = ${userId} and ${account.providerId} = 'credential'`)
            .returning({ id: account.id });
          if (!changed.length) throw new Error("No se encontró la credencial de la cuenta");
        },
        async appendAudit(input) {
          await db.insert(accountAudit).values(input);
        },
        async listAccounts() {
          const rows = await db
            .select({
              id: user.id,
              name: user.name,
              email: user.email,
              isActive: accountAccess.isActive,
              version: accountAccess.version,
              role: accountRoleGrant.role,
            })
            .from(user)
            .innerJoin(accountAccess, eq(accountAccess.userId, user.id))
            .leftJoin(accountRoleGrant, eq(accountRoleGrant.userId, user.id))
            .orderBy(user.name);
          return mapAccountList(rows);
        },
      };
      return work(tx);
    });
  },
};

export const accounts = createAccountsService(drizzleStore);
