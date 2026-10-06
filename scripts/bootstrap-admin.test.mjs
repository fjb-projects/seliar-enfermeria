import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bootstrapAdminAccounts,
  commandMode,
  runBootstrap,
  validateInitialAdmins,
} from "./bootstrap-admin.mjs";

const initialAdmin = {
  name: "Initial Nurse Administrator",
  email: "initial-admin@example.test",
  password: "Replacement-Initial-Password",
};

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
        if (insertedUsers === 1) throw new Error("simulated storage failure");
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
      async end() {},
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

test("requires exactly one valid administrator and rejects zero, two, or three", () => {
  assert.equal(validateInitialAdmins([initialAdmin]).length, 1);
  assert.throws(() => validateInitialAdmins([]), /exactly one/i);
  assert.throws(() => validateInitialAdmins([initialAdmin, initialAdmin]), /exactly one/i);
  assert.throws(
    () => validateInitialAdmins([initialAdmin, initialAdmin, initialAdmin]),
    /exactly one/i,
  );
  assert.throws(() => validateInitialAdmins([{ ...initialAdmin, email: "invalid" }]), /email/i);
  assert.throws(() => validateInitialAdmins([{ ...initialAdmin, password: "short" }]), /password/i);
});

test("creates exactly one credential account with a hash in one transaction", async () => {
  const { pool, statements } = fakePool();
  const ids = ["user-1", "account-1"];
  let nextId = 0;
  const output = await bootstrapAdminAccounts({
    pool,
    admins: [initialAdmin],
    hashPassword: async (password) => `hashed:${password}`,
    createId: () => ids[nextId++],
  });
  assert.equal(output.created, 1);
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
  assert.equal(userWrites.length, 1);
  assert.equal(credentials.length, 1);
  assert.equal(grants.length, 1);
  assert.equal(audits.length, 1);
  assert.ok(credentials.every(({ values }) => values.includes("credential")));
  assert.ok(
    credentials.every(({ values }) => values.some((value) => String(value).startsWith("hashed:"))),
  );
  assert.ok(credentials.every(({ values }) => !values.includes(initialAdmin.password)));
  assert.ok(grants.every(({ values }) => values.includes("admin") && !values.includes("efa")));
  assert.ok(audits.every(({ statement }) => /VALUES \(NULL,/.test(statement)));
  assert.ok(audits.every(({ values }) => !values.includes(initialAdmin.password)));
});

test("refuses an existing admin before inserting accounts and rolls back", async () => {
  const { pool, statements } = fakePool({ existingAdmin: true });
  await assert.rejects(
    bootstrapAdminAccounts({ pool, admins: [initialAdmin], hashPassword: async () => "hash" }),
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
      admins: [initialAdmin],
      hashPassword: async (password) => `hash:${password}`,
    }),
    /bootstrap transaction failed/i,
  );
  assert.equal(statements.at(-1).statement, "ROLLBACK");
  assert.ok(!statements.some(({ statement }) => statement === "COMMIT"));
});

test("does not create a pool when bootstrap confirmation is rejected", async () => {
  let poolCount = 0;
  await assert.rejects(
    runBootstrap({
      args: ["--apply"],
      env: { DATABASE_URL: "postgres://fake" },
      promptLine: async () => "NO",
      promptSecret: async () => assert.fail("Secrets must not be requested before confirmation."),
      createPool: () => {
        poolCount += 1;
        throw new Error("pool must not be created");
      },
    }),
    /not confirmed/i,
  );
  assert.equal(poolCount, 0);
});

test("does not create a pool when the initial password confirmation differs", async () => {
  const lineResponses = ["CREATE THE INITIAL ADMINISTRATOR", initialAdmin.name, initialAdmin.email];
  const secretResponses = [initialAdmin.password, "Different-Replacement-Password"];
  let poolCount = 0;
  await assert.rejects(
    runBootstrap({
      args: ["--apply"],
      env: { DATABASE_URL: "postgres://fake" },
      promptLine: async () => lineResponses.shift(),
      promptSecret: async () => secretResponses.shift(),
      createPool: () => {
        poolCount += 1;
        throw new Error("pool must not be created");
      },
    }),
    /did not match/i,
  );
  assert.equal(poolCount, 0);
});

test("accepts one confirmed administrator and creates the database pool afterward", async () => {
  const lineResponses = ["CREATE THE INITIAL ADMINISTRATOR", initialAdmin.name, initialAdmin.email];
  const secretResponses = [initialAdmin.password, initialAdmin.password];
  const { pool, statements } = fakePool();
  let poolCount = 0;
  const result = await runBootstrap({
    args: ["--apply"],
    env: { DATABASE_URL: "postgres://fake" },
    promptLine: async () => lineResponses.shift(),
    promptSecret: async () => secretResponses.shift(),
    createPool: () => {
      poolCount += 1;
      return pool;
    },
    hashPassword: async (password) => `hashed:${password}`,
  });
  assert.deepEqual(result, { created: 1 });
  assert.equal(poolCount, 1);
  assert.equal(
    statements.filter(({ statement }) => statement.includes('INSERT INTO "user"')).length,
    1,
  );
});
