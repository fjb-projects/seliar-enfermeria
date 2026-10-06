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

function fakePool({
  existingAdmin = false,
  failOnUserInsert = false,
  failureAt,
  failure,
  failPoolEnd = false,
} = {}) {
  const statements = [];
  let insertedUsers = 0;
  const client = {
    async query(statement, values = []) {
      statements.push({ statement: String(statement), values });
      const query = String(statement);
      if (failureAt === "begin" && query === "BEGIN") throw failure;
      if (failureAt === "admin_check" && query.includes("EXISTS (SELECT")) throw failure;
      if (failureAt === "insert_user" && query.includes('INSERT INTO "user"')) throw failure;
      if (failureAt === "commit" && query === "COMMIT") throw failure;
      if (query.includes("EXISTS (SELECT")) {
        return { rows: [{ has_active_admin: existingAdmin, has_admin_grant: existingAdmin }] };
      }
      if (failOnUserInsert && query.includes('INSERT INTO "user"')) {
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
        if (failureAt === "connection") throw failure;
        return client;
      },
      async end() {
        if (failPoolEnd) throw failure;
      },
    },
  };
}

function unsafeFailure(code = "PRIVATE-CODE") {
  const error = new Error(
    `password=${initialAdmin.password}; DATABASE_URL=postgres://user:private@internal.example/db`,
  );
  error.code = code;
  error.cause = new Error(`token=PRIVATE-CAUSE-${initialAdmin.password}`);
  return error;
}

async function captureFailure(operation) {
  try {
    await operation();
    assert.fail("Expected operation to fail.");
  } catch (error) {
    return error;
  }
}

async function diagnostic(error) {
  const { formatBootstrapDiagnostic } = await import("./bootstrap-admin.mjs");
  return formatBootstrapDiagnostic(error);
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
  const existingError = await captureFailure(() =>
    bootstrapAdminAccounts({
      pool: fakePool({ existingAdmin: true }).pool,
      admins: [initialAdmin],
    }),
  );
  const message = await diagnostic(existingError);
  assert.match(message, /administrator already exists/i);
  assert.match(message, /sign in/i);
});

test("rolls back if any insert fails, leaving the parent transaction uncommitted", async () => {
  const { pool, statements } = fakePool({ failOnUserInsert: true });
  await assert.rejects(
    bootstrapAdminAccounts({
      pool,
      admins: [initialAdmin],
      hashPassword: async (password) => `hash:${password}`,
    }),
    /user_write/i,
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
  assert.deepEqual(result, { created: 1, committed: true });
  assert.equal(poolCount, 1);
  assert.equal(
    statements.filter(({ statement }) => statement.includes('INSERT INTO "user"')).length,
    1,
  );
});

test("reports an actionable connection failure with an allowlisted network code", async () => {
  const { pool } = fakePool({ failureAt: "connection", failure: unsafeFailure("ECONNREFUSED") });
  const error = await captureFailure(() =>
    runBootstrap({
      args: ["--apply"],
      env: { DATABASE_URL: "postgres://user:private@internal.example/db" },
      promptLine: promptLineForInitialAdmin(),
      promptSecret: promptSecretsForInitialAdmin(),
      createPool: () => pool,
      hashPassword: async () => "fake-hash",
    }),
  );
  const message = await diagnostic(error);
  assert.match(message, /connection/i);
  assert.match(message, /ECONNREFUSED/);
  assert.match(message, /check/i);
  assert.doesNotMatch(
    message,
    /private|internal\.example|PRIVATE-CODE|PRIVATE-CAUSE|Replacement-Initial-Password/i,
  );
});

test("reports a known SQLSTATE at its write stage without leaking driver details", async () => {
  const { pool } = fakePool({ failureAt: "insert_user", failure: unsafeFailure("23505") });
  const error = await captureFailure(() =>
    bootstrapAdminAccounts({ pool, admins: [initialAdmin], hashPassword: async () => "fake-hash" }),
  );
  const message = await diagnostic(error);
  assert.match(message, /user_write/i);
  assert.match(message, /23505/);
  assert.match(message, /email|account/i);
  assert.doesNotMatch(
    message,
    /private|internal\.example|PRIVATE-CAUSE|Replacement-Initial-Password/i,
  );
});

test("hides arbitrary error codes, messages, and causes", async () => {
  const { pool } = fakePool({ failureAt: "admin_check", failure: unsafeFailure("PRIVATE-CODE") });
  const error = await captureFailure(() =>
    bootstrapAdminAccounts({ pool, admins: [initialAdmin], hashPassword: async () => "fake-hash" }),
  );
  const message = await diagnostic(error);
  assert.match(message, /admin_check/i);
  assert.match(message, /BOOTSTRAP_ERROR/);
  assert.doesNotMatch(
    message,
    /PRIVATE-CODE|password=|DATABASE_URL=|postgres:\/\/|internal\.example|PRIVATE-CAUSE|Replacement-Initial-Password/i,
  );
});

test("marks a failed commit as uncertain and advises checking before retry", async () => {
  const { pool, statements } = fakePool({
    failureAt: "commit",
    failure: unsafeFailure("ECONNRESET"),
  });
  const error = await captureFailure(() =>
    bootstrapAdminAccounts({ pool, admins: [initialAdmin], hashPassword: async () => "fake-hash" }),
  );
  const message = await diagnostic(error);
  assert.match(error.message, /uncertain|unknown/i);
  assert.match(error.message, /verify|check/i);
  assert.match(message, /commit/i);
  assert.match(message, /uncertain|unknown/i);
  assert.match(message, /check|verify/i);
  assert.doesNotMatch(message, /no accounts were created|private|Replacement-Initial-Password/i);
  assert.ok(statements.some(({ statement }) => statement === "ROLLBACK"));
});

test("reports pool cleanup failure after confirmed commit as created, not retryable", async () => {
  const { pool, statements } = fakePool({
    failPoolEnd: true,
    failure: unsafeFailure("PRIVATE-CODE"),
  });
  const result = await runBootstrap({
    args: ["--apply"],
    env: { DATABASE_URL: "postgres://user:private@internal.example/db" },
    promptLine: promptLineForInitialAdmin(),
    promptSecret: promptSecretsForInitialAdmin(),
    createPool: () => pool,
    hashPassword: async () => "fake-hash",
  });
  assert.equal(result.created, 1);
  assert.equal(result.committed, true);
  assert.equal(result.cleanupWarning.stage, "pool_cleanup");
  const message = await diagnostic(result.cleanupWarning);
  assert.match(message, /created|committed/i);
  assert.match(message, /sign in|login/i);
  assert.doesNotMatch(
    message,
    /PRIVATE-CODE|password=|DATABASE_URL=|private|Replacement-Initial-Password/i,
  );
  assert.equal(statements.at(-1).statement, "COMMIT");
});

function promptLineForInitialAdmin() {
  const responses = ["CREATE THE INITIAL ADMINISTRATOR", initialAdmin.name, initialAdmin.email];
  return async () => responses.shift();
}

function promptSecretsForInitialAdmin() {
  const responses = [initialAdmin.password, initialAdmin.password];
  return async () => responses.shift();
}
