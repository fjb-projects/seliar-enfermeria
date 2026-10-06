import { describe, expect, it, vi } from "vitest";
import { verifyPassword } from "better-auth/crypto";
import { createAccountsService, mapAccountList, type AccountTransaction } from "./accounts.server";

function store(overrides: Record<string, unknown> = {}) {
  const tx = {
    lockAdministrators: vi.fn(),
    findAccount: vi.fn(async (userId: string) =>
      userId === "admin"
        ? {
            id: "admin",
            name: "Admin",
            email: "a@example.test",
            isActive: true,
            version: 1,
            roles: ["admin"],
          }
        : {
            id: "target",
            name: "Nurse",
            email: "n@example.test",
            isActive: true,
            version: 1,
            roles: ["efa"],
          },
    ),
    countActiveAdministrators: vi.fn(async () => 2),
    insertAccount: vi.fn(),
    updateAccount: vi.fn(),
    replaceRoles: vi.fn(),
    revokeSessions: vi.fn(),
    resetCredential: vi.fn(),
    appendAudit: vi.fn(),
    listAccounts: vi.fn(async () => [
      {
        id: "target",
        name: "Nurse",
        email: "n@example.test",
        isActive: true,
        version: 7,
        roles: ["efa"],
      },
    ]),
    ...overrides,
  };
  return {
    transaction: vi.fn(async (fn: (transaction: AccountTransaction) => Promise<unknown>) =>
      fn(tx as AccountTransaction),
    ),
    tx,
  };
}

const actor = { userId: "admin", isActive: true, roles: ["admin"] as const };

describe("account administration service", () => {
  it("rejects stale versions before mutation", async () => {
    const db = store();
    await expect(
      createAccountsService(db as never).setRoles(actor, {
        userId: "target",
        expectedVersion: 0,
        roles: [],
      }),
    ).rejects.toThrow("La cuenta cambió");
    expect(db.tx.updateAccount).not.toHaveBeenCalled();
  });

  it("rechecks that the actor is still an active administrator", async () => {
    const db = store({
      findAccount: vi.fn(async () => ({
        id: "admin",
        name: "Admin",
        email: "a@example.test",
        isActive: false,
        version: 1,
        roles: ["admin"],
      })),
    });
    await expect(createAccountsService(db as never).list(actor)).rejects.toThrow(
      "administración vigente",
    );
    expect(db.tx.listAccounts).not.toHaveBeenCalled();
  });

  it("hashes created credentials in the Better Auth compatible format", async () => {
    const db = store();
    const service = createAccountsService(db as never, { newId: () => "new-user" });
    await service.create(actor, {
      name: "New Nurse",
      email: "new@example.test",
      password: "long-test-password",
      roles: ["efa"],
    });
    const inserted = db.tx.insertAccount.mock.calls[0]![0] as { passwordHash: string };
    expect(
      await verifyPassword({ password: "long-test-password", hash: inserted.passwordHash }),
    ).toBe(true);
  });

  it("propagates an audit failure from the same transaction boundary", async () => {
    const db = store({
      appendAudit: vi.fn(async () => {
        throw new Error("audit-write-failed");
      }),
    });
    await expect(
      createAccountsService(db as never).setActive(actor, {
        userId: "target",
        expectedVersion: 1,
        isActive: false,
      }),
    ).rejects.toThrow("audit-write-failed");
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.tx.revokeSessions).toHaveBeenCalled();
  });

  it("locks and preserves the final active administrator", async () => {
    const db = store({
      findAccount: vi.fn(async (userId: string) =>
        userId === "admin"
          ? {
              id: "admin",
              name: "Admin",
              email: "a@example.test",
              isActive: true,
              version: 4,
              roles: ["admin"],
            }
          : {
              id: "target",
              name: "Admin",
              email: "t@example.test",
              isActive: true,
              version: 4,
              roles: ["admin"],
            },
      ),
      countActiveAdministrators: vi.fn(async () => 1),
    });
    await expect(
      createAccountsService(db as never).setRoles(actor, {
        userId: "target",
        expectedVersion: 4,
        roles: [],
      }),
    ).rejects.toThrow("última cuenta administradora");
    expect(db.tx.lockAdministrators).toHaveBeenCalledBefore(db.tx.countActiveAdministrators);
  });

  it("revokes sessions when disabling and audits only allowlisted state", async () => {
    const db = store();
    await createAccountsService(db as never).setActive(actor, {
      userId: "target",
      expectedVersion: 1,
      isActive: false,
    });
    expect(db.tx.revokeSessions).toHaveBeenCalledWith("target");
    expect(db.tx.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        beforeState: { isActive: true, roles: ["efa"] },
        afterState: { isActive: false, roles: ["efa"] },
      }),
    );
    expect(JSON.stringify(db.tx.appendAudit.mock.calls)).not.toMatch(/password|hash|token|secret/i);
  });

  it("hashes the supplied replacement and returns no password or hash", async () => {
    const db = store({ resetCredential: vi.fn(async () => undefined) });
    const replacement = "Replacement-Password-2026";
    const result = await createAccountsService(db as never).resetPassword(actor, {
      userId: "target",
      expectedVersion: 1,
      password: replacement,
    });
    expect(result).toEqual({ ok: true });
    const persistedHash = db.tx.resetCredential.mock.calls[0]![1] as string;
    expect(await verifyPassword({ password: replacement, hash: persistedHash })).toBe(true);
    const outward = JSON.stringify({ result, audit: db.tx.appendAudit.mock.calls });
    expect(outward).not.toContain(replacement);
    expect(outward).not.toContain(persistedHash);
    expect(db.tx.revokeSessions).toHaveBeenCalledWith("target");
  });

  it("returns account versions for optimistic mutations", async () => {
    const db = store();
    const listed = await createAccountsService(db as never).list(actor);
    expect(listed).toEqual([
      {
        id: "target",
        name: "Nurse",
        email: "n@example.test",
        isActive: true,
        version: 7,
        roles: ["efa"],
      },
    ]);
  });

  it("groups grant rows without dropping the current account version", () => {
    expect(
      mapAccountList([
        {
          id: "target",
          name: "Nurse",
          email: "n@example.test",
          isActive: true,
          version: 7,
          role: "efa",
        },
        {
          id: "target",
          name: "Nurse",
          email: "n@example.test",
          isActive: true,
          version: 7,
          role: "admin",
        },
      ]),
    ).toEqual([
      {
        id: "target",
        name: "Nurse",
        email: "n@example.test",
        isActive: true,
        version: 7,
        roles: ["admin", "efa"],
      },
    ]);
  });
});
