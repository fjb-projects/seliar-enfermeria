#!/usr/bin/env node
const { randomBytes } = require("node:crypto");
const path = require("node:path");
const { Pool } = require("pg");
const { drizzle } = require("drizzle-orm/node-postgres");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "../..");
const cacheDir = path.join(root, "node_modules", ".cache");
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("Set DATABASE_URL explicitly in the process environment.");
const hostname = new URL(databaseUrl).hostname.toLowerCase();
if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname))
  throw new Error("The database probe is restricted to loopback PostgreSQL.");

const schemaName = `comp_lifecycle_probe_${randomBytes(6).toString("hex")}`;
const quotedSchema = `"${schemaName}"`;
const adminPool = new Pool({ connectionString: databaseUrl });
let testPool;
const bundlePath = path.join(cacheDir, "lifecycle.db.js");
const serviceBundlePath = path.join(cacheDir, "lifecycle.service.js");
const schemaBundlePath = path.join(cacheDir, "lifecycle.schema.js");
const ddl = `
CREATE TABLE "user" ("id" text PRIMARY KEY, "name" text NOT NULL, "email" text NOT NULL, "email_verified" boolean NOT NULL DEFAULT false, "image" text, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now());
CREATE TABLE "account_access" ("user_id" text NOT NULL, "is_active" boolean NOT NULL DEFAULT true);
CREATE TABLE "account_role_grant" ("user_id" text NOT NULL, "role" text NOT NULL);
CREATE TABLE "compensatory_staff" ("id" uuid PRIMARY KEY, "dni" text NOT NULL, "name" text NOT NULL, "email" text, "registration_number" text, "employment_status" text, "job_role" text, "region" text, "contact_phone" text, "workplace" text, "operational_status" text, "operational_role" text, "is_active" boolean NOT NULL, "monthly_limit_minutes" integer NOT NULL, "version" integer NOT NULL, "balance_minutes" integer NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now());
CREATE TABLE "compensatory_request" ("id" uuid PRIMARY KEY, "client_operation_id" uuid NOT NULL, "staff_id" uuid NOT NULL, "created_by_user_id" text NOT NULL, "submitted_at" text NOT NULL, "requester_name" text NOT NULL, "requester_mobile" text NOT NULL, "compensatory_date" text NOT NULL, "hours" text NOT NULL, "phase" text NOT NULL DEFAULT 'unclassified', "version" integer NOT NULL DEFAULT 1, "requested_date" text, "requested_minutes" integer, "classified_at" timestamptz, "classified_by_user_id" text, "decision_at" timestamptz, "decision_by_user_id" text, "decision_reason" text, "cancelled_at" timestamptz, "cancellation_by_user_id" text, "cancellation_reason" text, "consumed_at" timestamptz, "consumption_ledger_id" uuid, "created_at" timestamptz NOT NULL DEFAULT now());
CREATE TABLE "compensatory_operation" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "actor_user_id" text NOT NULL, "client_operation_id" uuid NOT NULL, "action" text NOT NULL, "payload_hash" text NOT NULL, "result_id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), UNIQUE("actor_user_id","client_operation_id"));
CREATE TABLE "compensatory_request_audit" ("id" uuid PRIMARY KEY, "request_id" uuid NOT NULL, "actor_user_id" text, "actor_name" text NOT NULL, "actor_kind" text NOT NULL, "action" text NOT NULL, "occurred_at" timestamptz NOT NULL, "reason" text NOT NULL, "version_before" integer NOT NULL, "version_after" integer NOT NULL, "detail" jsonb NOT NULL DEFAULT '{}');
CREATE TABLE "compensatory_ledger" ("id" uuid PRIMARY KEY, "staff_id" uuid NOT NULL, "kind" text NOT NULL, "minutes" integer NOT NULL, "effective_date" text NOT NULL, "reason" text NOT NULL, "actor_user_id" text, "actor_name" text NOT NULL, "actor_kind" text NOT NULL DEFAULT 'admin', "created_at" timestamptz NOT NULL, "balance_before_minutes" integer NOT NULL, "balance_after_minutes" integer NOT NULL, "reverses_entry_id" uuid, "request_id" uuid UNIQUE);
`;
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  try {
    await adminPool.query(`CREATE SCHEMA ${quotedSchema}`);
    testPool = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${schemaName},public`,
    });
    await testPool.query(ddl);
    const adminId = "lifecycle-probe-admin";
    const staffId = "f0eb295f-1fc1-4320-ae9c-82dca65f2539";
    const futureRequestId = "8a367d11-29dc-47e1-ae5d-d7f7e2654121";
    const dueRequestId = "141e2f94-2cdc-48ec-9f5e-b11abf53a8f7";
    const competingRequestId = "52f2c50b-a44b-4ef1-b7ea-dca90d90e6a7";
    const creditEntryId = "83796dc6-c2dd-4dbc-83a0-5b81836c16fa";
    await testPool.query(
      `INSERT INTO "user" ("id","name","email") VALUES ($1,'Probe Admin','probe@example.invalid')`,
      [adminId],
    );
    await testPool.query(`INSERT INTO "account_access" ("user_id","is_active") VALUES ($1,true)`, [
      adminId,
    ]);
    await testPool.query(
      `INSERT INTO "account_role_grant" ("user_id","role") VALUES ($1,'admin')`,
      [adminId],
    );
    await testPool.query(
      `INSERT INTO "compensatory_staff" ("id","dni","name","is_active","monthly_limit_minutes","version","balance_minutes") VALUES ($1,'12345678','Probe Staff',true,1440,1,120)`,
      [staffId],
    );
    await testPool.query(
      `INSERT INTO "compensatory_request" ("id","client_operation_id","staff_id","created_by_user_id","submitted_at","requester_name","requester_mobile","compensatory_date","hours") VALUES ($1,$2,$3,$4,'raw submitted','Raw Name','Raw Mobile','raw date','raw hours')`,
      [futureRequestId, "6c22f61f-b37a-42ed-8a7a-4ba4f01f4fd0", staffId, adminId],
    );
    await testPool.query(
      `INSERT INTO "compensatory_request" ("id","client_operation_id","staff_id","created_by_user_id","submitted_at","requester_name","requester_mobile","compensatory_date","hours","phase","requested_date","requested_minutes","classified_at","classified_by_user_id") VALUES ($1,$2,$3,$4,'raw submitted','Raw Name','Raw Mobile','raw date','raw hours','approved',to_char((clock_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date - 1,'YYYY-MM-DD'),30,clock_timestamp(),$4)`,
      [dueRequestId, "8d1b887d-086c-4da7-9f1e-181997fd6bdb", staffId, adminId],
    );
    await testPool.query(
      `INSERT INTO "compensatory_request" ("id","client_operation_id","staff_id","created_by_user_id","submitted_at","requester_name","requester_mobile","compensatory_date","hours") VALUES ($1,$2,$3,$4,'raw submitted','Raw Name','Raw Mobile','raw date','raw hours')`,
      [competingRequestId, "9333c833-5a52-4b2e-b0b8-6148d45f3ef0", staffId, adminId],
    );
    await testPool.query(
      `INSERT INTO "compensatory_ledger" ("id","staff_id","kind","minutes","effective_date","reason","actor_user_id","actor_name","actor_kind","created_at","balance_before_minutes","balance_after_minutes") VALUES ($1,$2,'credit',31,'2026-10-27','Probe credit', $3,'Probe Admin','admin',clock_timestamp(),0,31), ($4,$2,'credit',89,'2026-10-27','Probe credit', $3,'Probe Admin','admin',clock_timestamp(),31,120)`,
      [creditEntryId, staffId, adminId, "dfbf587b-452b-47cf-a26f-ce3a209ce968"],
    );

    await esbuild.build({
      entryPoints: [path.join(root, "src/lib/compensatory-lifecycle.server.db.ts")],
      outfile: bundlePath,
      bundle: true,
      packages: "external",
      platform: "node",
      format: "cjs",
      target: "node20",
    });
    await esbuild.build({
      entryPoints: [path.join(root, "src/lib/compensatory-lifecycle.server.ts")],
      outfile: serviceBundlePath,
      bundle: true,
      packages: "external",
      platform: "node",
      format: "cjs",
      target: "node20",
    });
    await esbuild.build({
      entryPoints: [path.join(root, "src/db/schema.ts")],
      outfile: schemaBundlePath,
      bundle: true,
      packages: "external",
      platform: "node",
      format: "cjs",
      target: "node20",
    });
    const { createCompensatoryLifecycleStore } = require(bundlePath);
    const { createCompensatoryLifecycleService } = require(serviceBundlePath);
    const bankDbBundlePath = path.join(cacheDir, "bank.db.js");
    const bankServiceBundlePath = path.join(cacheDir, "bank.service.js");
    await esbuild.build({
      entryPoints: [path.join(root, "src/lib/compensatory-bank.server.db.ts")],
      outfile: bankDbBundlePath,
      bundle: true,
      packages: "external",
      platform: "node",
      format: "cjs",
      target: "node20",
    });
    await esbuild.build({
      entryPoints: [path.join(root, "src/lib/compensatory-bank.server.ts")],
      outfile: bankServiceBundlePath,
      bundle: true,
      packages: "external",
      platform: "node",
      format: "cjs",
      target: "node20",
    });
    const { createCompensatoryBankStore } = require(bankDbBundlePath);
    const { createCompensatoryBankService } = require(bankServiceBundlePath);
    const schema = require(schemaBundlePath);
    const db = drizzle(testPool, { schema });
    const service = createCompensatoryLifecycleService(createCompensatoryLifecycleStore(db));
    const bank = createCompensatoryBankService(createCompensatoryBankStore(db));
    const initial = await service.getWorkspace(adminId);
    const day = initial.serviceDay;
    const future = new Date(`${day}T00:00:00.000Z`);
    future.setUTCDate(future.getUTCDate() + 1);
    const futureDate = future.toISOString().slice(0, 10);
    await service.classify(adminId, {
      requestId: futureRequestId,
      expectedVersion: 1,
      requestedDate: futureDate,
      minutes: 60,
      reason: "Probe classification",
      clientOperationId: "ed03cfe7-f804-44fc-ab33-f03561d1e945",
    });
    await service.decide(adminId, {
      requestId: futureRequestId,
      expectedVersion: 2,
      decision: "approve",
      reason: "Probe approval",
      clientOperationId: "5d3d8a41-5600-4e6f-b0d1-c2c9cb854180",
    });
    const reserved = await service.getWorkspace(adminId);
    assert(
      reserved.staff[0].reservedMinutes === 90 && reserved.staff[0].availableMinutes === 30,
      "Overdue and future approvals were not both reserved.",
    );
    const serviceDay = day;
    await service.classify(adminId, {
      requestId: competingRequestId,
      expectedVersion: 1,
      requestedDate: futureDate,
      minutes: 31,
      reason: "Competing approval probe",
      clientOperationId: "fb9296e4-93ec-4df2-bcbe-a1950700e9bd",
    });
    const hashState = async () => {
      const tableNames = [
        "compensatory_staff",
        "compensatory_request",
        "compensatory_request_audit",
        "compensatory_ledger",
        "compensatory_operation",
      ];
      const rows = await Promise.all(
        tableNames.map(async (table) => {
          const result = await testPool.query(
            `SELECT md5(COALESCE(string_agg(row_to_json(t)::text, E'\\n' ORDER BY row_to_json(t)::text), '')) AS hash FROM "${table}" t`,
          );
          return [table, result.rows[0].hash];
        }),
      );
      return JSON.stringify(rows);
    };
    let beforeRejected = await hashState();
    try {
      await service.decide(adminId, {
        requestId: competingRequestId,
        expectedVersion: 2,
        decision: "approve",
        reason: "Must not overbook",
        clientOperationId: "97426dc0-0906-4e07-8797-e2e02d98f94c",
      });
      throw new Error("Competing approval unexpectedly succeeded.");
    } catch (error) {
      assert(
        error.message.includes("disponible"),
        "Competing approval failed for an unexpected reason.",
      );
    }
    assert(
      (await hashState()) === beforeRejected,
      "Rejected competing approval changed durable database state.",
    );
    beforeRejected = await hashState();
    try {
      await bank.recordMovement(adminId, {
        staffId,
        kind: "debit",
        minutes: 50,
        reason: "Must preserve reservation",
        effectiveDate: serviceDay,
        clientOperationId: "6bc5cc9c-c871-416e-b3c5-89052bb5bcac",
      });
      throw new Error("Reservation-conflicting debit unexpectedly succeeded.");
    } catch (error) {
      assert(error.message.includes("reservas"), "Manual debit failed for an unexpected reason.");
    }
    assert(
      (await hashState()) === beforeRejected,
      "Rejected manual debit changed durable database state.",
    );
    beforeRejected = await hashState();
    try {
      await bank.reverseMovement(adminId, {
        staffId,
        entryId: creditEntryId,
        reason: "Must preserve reservation",
        effectiveDate: serviceDay,
        clientOperationId: "cc9293f6-a713-44db-9534-6001028bd4e4",
      });
      throw new Error("Reservation-conflicting credit reversal unexpectedly succeeded.");
    } catch (error) {
      assert(
        error.message.includes("reservas"),
        "Credit reversal failed for an unexpected reason.",
      );
    }
    assert(
      (await hashState()) === beforeRejected,
      "Rejected credit reversal changed durable database state.",
    );
    const due = await service.processDue();
    assert(due.consumed === 1, "Overdue request was not consumed exactly once.");
    assert(
      (await service.processDue()).consumed === 0,
      "Repeated due pass attempted duplicate consumption.",
    );
    const final = await service.getWorkspace(adminId);
    assert(
      final.requests.find((request) => request.id === dueRequestId).phase === "consumed",
      "Due request did not transition to consumed.",
    );
    assert(
      final.staff[0].balanceMinutes === 90 && final.staff[0].reservedMinutes === 60,
      "Settlement did not retain the unrelated future reservation.",
    );

    const ledger = await testPool.query(
      `SELECT "actor_user_id", "actor_kind", "request_id", "minutes" FROM "compensatory_ledger" WHERE "request_id" = $1`,
      [dueRequestId],
    );
    assert(
      ledger.rowCount === 1 &&
        ledger.rows[0].actor_user_id === null &&
        ledger.rows[0].actor_kind === "system" &&
        ledger.rows[0].minutes === -30,
      "Settlement ledger attribution or amount was incorrect.",
    );
    process.stdout.write("Isolated Drizzle lifecycle and bank adapter probe passed.\n");
  } finally {
    if (testPool) await testPool.end();
    await adminPool.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`).catch(() => undefined);
    await adminPool.end();
  }
})().catch((error) => {
  process.stderr.write("The isolated compensatory database probe failed.\n");
  process.exitCode = 1;
});
