import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bootstrapAdminAccounts,
  commandMode,
  runBootstrap,
  validateInitialAdmins,
} from "./bootstrap-admin.mjs";

const initialAdmins = [1, 2, 3].map((index) => ({
  name: `Nurse ${index}`,
  email: `nurse${index}@example.test`,
  password: `Replacement-${index}-Password`,
}));

function fakePool({ existingAdmin = false, failOnUserInsert = false } = {}) {
  const statements = [];
  let insertedUsers = 0;
  const client = {
    async query(statement, values = []) {
      statements.push({ statement: String(statement), values });
      if (String(statement).includes("EXISTS (SELECT")) {
        return { rows: [{ has_active_admin: existingAdmin, has_admin_grant: existingAdmin }] };
      }
      if (failOnUserInsert && String(statement).includes('INSERT INTO "user"')) {
        insertedUsers += 1;
        if (insertedUsers === 2) throw new Error("simulated storage failure");
      }
      return { rows: [] };
    },
    release() {},
  };
  return {
    statements,
    pool: {
      async connect() {
        return client;
      },
    },
  };
}

test("accepts only explicit apply mode and permits a no-database help mode", async () => {
  assert.equal(commandMode(["--help"]), "help");
  assert.equal(commandMode(["--apply"]), "apply");
  assert.equal(commandMode([]), "invalid");
  const output = [];
  assert.deepEqual(
    await runBootstrap({ args: ["--help"], env: {}, print: (line) => output.push(line) }),
    { status: "help" },
  );
  assert.match(output[0], /DATABASE_URL/);
});

test("requires exactly three distinct, valid administrator inputs", () => {
  assert.equal(validateInitialAdmins(initialAdmins).length, 3);
  assert.throws(() => validateInitialAdmins(initialAdmins.slice(0, 2)), /exactly three/i);
  assert.throws(
    () =>
      validateInitialAdmins(
        initialAdmins.map((admin) => ({ ...admin, email: initialAdmins[0].email })),
      ),
    /distinct/i,
  );
  assert.throws(
    () => validateInitialAdmins(initialAdmins.map((admin) => ({ ...admin, password: "short" }))),
    /password/i,
  );
});

test("creates all three credential accounts with hashed passwords in one transaction", async () => {
  const { pool, statements } = fakePool();
  const ids = ["user-1", "user-2", "user-3"];
  let nextId = 0;
  const output = await bootstrapAdminAccounts({
    pool,
    admins: initialAdmins,
    hashPassword: async (password) => `hashed:${password}`,
    createId: () => ids[nextId++],
  });
  assert.equal(output.created, 3);
  assert.equal(statements[0].statement, "BEGIN");
  assert.match(statements[1].statement, /pg_advisory_xact_lock/);
  assert.equal(statements.at(-1).statement, "COMMIT");
  const userWrites = statements.filter(({ statement }) => statement.includes('INSERT INTO "user"'));
  const credentials = statements.filter(({ statement }) =>
    statement.includes('INSERT INTO "account"'),
  );
  const grants = statements.filter(({ statement }) =>
    statement.includes('INSERT INTO "account_role_grant"'),
  );
  const audits = statements.filter(({ statement }) =>
    statement.includes('INSERT INTO "account_audit"'),
  );
  assert.equal(userWrites.length, 3);
  assert.equal(credentials.length, 3);
  assert.equal(grants.length, 3);
  assert.equal(audits.length, 3);
  assert.ok(credentials.every(({ values }) => values.includes("credential")));
  assert.ok(
    credentials.every(({ values }) => values.some((value) => String(value).startsWith("hashed:"))),
  );
  assert.ok(
    credentials.every(
      ({ values }) => !initialAdmins.some((admin) => values.includes(admin.password)),
    ),
  );
  assert.ok(grants.every(({ values }) => values.includes("admin") && !values.includes("efa")));
  assert.ok(audits.every(({ statement }) => /VALUES \(NULL,/.test(statement)));
  assert.ok(
    audits.every(({ values }) => !initialAdmins.some((admin) => values.includes(admin.password))),
  );
});

test("refuses an existing admin before inserting accounts and rolls back", async () => {
  const { pool, statements } = fakePool({ existingAdmin: true });
  await assert.rejects(
    bootstrapAdminAccounts({ pool, admins: initialAdmins, hashPassword: async () => "hash" }),
    /already exists/i,
  );
  assert.equal(
    statements.filter(({ statement }) => statement.includes('INSERT INTO "user"')).length,
    0,
  );
  assert.equal(statements.at(-1).statement, "ROLLBACK");
});

test("rolls back if any insert fails, leaving the parent transaction uncommitted", async () => {
  const { pool, statements } = fakePool({ failOnUserInsert: true });
  await assert.rejects(
    bootstrapAdminAccounts({
      pool,
      admins: initialAdmins,
      hashPassword: async (password) => `hash:${password}`,
    }),
    /bootstrap transaction failed/i,
  );
  assert.equal(statements.at(-1).statement, "ROLLBACK");
  assert.ok(!statements.some(({ statement }) => statement === "COMMIT"));
});
