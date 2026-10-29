const { randomUUID, randomBytes } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { Client } = require("pg");
const esbuild = require("esbuild");

const root = path.resolve(__dirname, "../..");
const connectionString = process.env.COMPENSATORY_STAFF_DELETE_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "Set COMPENSATORY_STAFF_DELETE_TEST_DATABASE_URL to an explicitly local PostgreSQL instance.",
  );
}

const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(databaseUrl.hostname)) {
  throw new Error("The deletion database probe refuses non-local PostgreSQL hosts.");
}

const schema = `compensatory_delete_test_${randomBytes(6).toString("hex")}`;
const schemaSql = `"${schema}"`;
const actorId = `delete-probe-${randomUUID()}`;

function staffRecord(id, dni) {
  return {
    id,
    dni,
    name: "Synthetic Staff",
    email: null,
    registration_number: null,
    employment_status: null,
    job_role: null,
    region: null,
    contact_phone: null,
    workplace: null,
    operational_status: null,
    operational_role: null,
    is_active: true,
    monthly_limit_minutes: 1440,
    version: 1,
    balance_minutes: 0,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function mapStaff(row) {
  return {
    id: row.id,
    dni: row.dni,
    name: row.name,
    email: row.email,
    registrationNumber: row.registration_number,
    employmentStatus: row.employment_status,
    jobRole: row.job_role,
    region: row.region,
    contactPhone: row.contact_phone,
    workplace: row.workplace,
    operationalStatus: row.operational_status,
    operationalRole: row.operational_role,
    isActive: row.is_active,
    monthlyLimitMinutes: row.monthly_limit_minutes,
    version: row.version,
    balanceMinutes: row.balance_minutes,
    createdAt: row.created_at,
  };
}

function mapAudit(row) {
  return {
    id: row.id,
    staffId: row.staff_id,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    operationId: row.operation_id,
    action: row.action,
    versionBefore: row.version_before,
    versionAfter: row.version_after,
    createdAt: row.occurred_at,
    reason: row.reason,
    before: row.before_state,
    after: row.after_state,
  };
}

function loadDeleteService() {
  const entry = path.join(root, "src/lib/compensatory-staff-delete.server.ts");
  const result = esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "cjs",
    packages: "external",
    write: false,
  });
  const compiled = new Module(entry, module);
  compiled.filename = entry;
  compiled.paths = Module._nodeModulePaths(path.dirname(entry));
  compiled._compile(result.outputFiles[0].text, entry);
  return compiled.exports.createCompensatoryStaffDeleteService;
}

function createSqlStore(client) {
  return {
    async transaction(work) {
      await client.query("BEGIN");
      try {
        const result = await work({
          async findActor(userId) {
            const { rows } = await client.query(
              `SELECT aa.is_active AS "isActive", u.name, EXISTS (
                SELECT 1 FROM account_role_grant AS grant_row
                WHERE grant_row.user_id = aa.user_id AND grant_row.role = 'admin'
              ) AS "isAdmin"
              FROM account_access AS aa JOIN "user" AS u ON u.id = aa.user_id
              WHERE aa.user_id = $1`,
              [userId],
            );
            return rows[0] ?? null;
          },
          async lockOperation(userId, operationId) {
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
              `${userId}:${operationId}`,
            ]);
          },
          async findOperation(userId, operationId) {
            const { rows } = await client.query(
              'SELECT payload_hash AS "payloadHash", result_id AS "resultId" FROM compensatory_operation WHERE actor_user_id = $1 AND client_operation_id = $2 LIMIT 1',
              [userId, operationId],
            );
            return rows[0] ?? null;
          },
          async insertOperation(userId, operationId, payloadHash, resultId) {
            await client.query(
              "INSERT INTO compensatory_operation (actor_user_id, client_operation_id, action, payload_hash, result_id) VALUES ($1, $2, 'delete_staff', $3, $4)",
              [userId, operationId, payloadHash, resultId],
            );
          },
          async lockStaff(staffId) {
            const { rows } = await client.query(
              "SELECT * FROM compensatory_staff WHERE id = $1 FOR UPDATE",
              [staffId],
            );
            return rows[0] ? mapStaff(rows[0]) : null;
          },
          async hasRequests(staffId) {
            const { rowCount } = await client.query(
              "SELECT 1 FROM compensatory_request WHERE staff_id = $1 LIMIT 1",
              [staffId],
            );
            return rowCount > 0;
          },
          async hasLedgerEntries(staffId) {
            const { rowCount } = await client.query(
              "SELECT 1 FROM compensatory_ledger WHERE staff_id = $1 LIMIT 1",
              [staffId],
            );
            return rowCount > 0;
          },
          async listAudits(staffId) {
            const { rows } = await client.query(
              `SELECT id, staff_id, actor_user_id, actor_name, operation_id, action,
                      version_before, version_after, occurred_at, reason, before_state, after_state
               FROM compensatory_staff_audit WHERE staff_id = $1
               ORDER BY occurred_at, id`,
              [staffId],
            );
            return rows.map(mapAudit);
          },
          async insertDeletionArchive(archive) {
            await client.query(
              `INSERT INTO compensatory_staff_deletion_audit
                (staff_id, staff_snapshot, prior_audits, actor_user_id, actor_name, operation_id, occurred_at, reason)
               VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, $7, $8)`,
              [
                archive.staffId,
                JSON.stringify(archive.staffSnapshot),
                JSON.stringify(archive.priorAudits),
                archive.actorUserId,
                archive.actorName,
                archive.operationId,
                archive.occurredAt,
                archive.reason,
              ],
            );
          },
          async deleteAudits(staffId) {
            await client.query(
              "SELECT set_config('app.allow_compensatory_staff_audit_delete', 'on', true)",
            );
            await client.query("DELETE FROM compensatory_staff_audit WHERE staff_id = $1", [
              staffId,
            ]);
          },
          async deleteStaff(staffId, expectedVersion) {
            const { rowCount } = await client.query(
              "DELETE FROM compensatory_staff WHERE id = $1 AND version = $2",
              [staffId, expectedVersion],
            );
            if (rowCount !== 1) throw new Error("The staff version changed during deletion.");
          },
          async databaseNow() {
            const { rows } = await client.query("SELECT clock_timestamp() AS now");
            return rows[0].now;
          },
        });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    },
  };
}

async function expectRejected(client, sql, parameters = []) {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.allow_compensatory_staff_audit_delete', 'on', true)");
  try {
    await client.query(sql, parameters);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code !== "P0001") throw error;
    return;
  }
  await client.query("ROLLBACK");
  throw new Error("Expected the deletion archive guard to reject this operation.");
}

async function addStaffAndAudit(client, dni) {
  const staff = staffRecord(randomUUID(), dni);
  await client.query(
    `INSERT INTO compensatory_staff
      (id, dni, name, email, registration_number, employment_status, job_role, region,
       contact_phone, workplace, operational_status, operational_role, is_active,
       monthly_limit_minutes, version, balance_minutes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [
      staff.id,
      staff.dni,
      staff.name,
      staff.email,
      staff.registration_number,
      staff.employment_status,
      staff.job_role,
      staff.region,
      staff.contact_phone,
      staff.workplace,
      staff.operational_status,
      staff.operational_role,
      staff.is_active,
      staff.monthly_limit_minutes,
      staff.version,
      staff.balance_minutes,
      staff.created_at,
      staff.updated_at,
    ],
  );
  const audit = {
    id: randomUUID(),
    staff_id: staff.id,
    actor_user_id: actorId,
    actor_name: "Synthetic Admin",
    operation_id: randomUUID(),
    action: "created",
    version_before: null,
    version_after: 1,
    reason: "Synthetic creation",
    before_state: null,
    after_state: { dni: staff.dni, name: staff.name, version: 1 },
  };
  await client.query(
    `INSERT INTO compensatory_staff_audit
      (id, staff_id, actor_user_id, actor_name, operation_id, action, version_before,
       version_after, reason, before_state, after_state)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)`,
    [
      audit.id,
      audit.staff_id,
      audit.actor_user_id,
      audit.actor_name,
      audit.operation_id,
      audit.action,
      audit.version_before,
      audit.version_after,
      audit.reason,
      audit.before_state,
      audit.after_state,
    ],
  );
  return { staff, audit };
}

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  let schemaCreated = false;
  try {
    await client.query(`CREATE SCHEMA ${schemaSql}`);
    schemaCreated = true;
    await client.query(`SET search_path TO ${schemaSql}, public`);
    await client.query('CREATE TABLE "user" (id text PRIMARY KEY, name text NOT NULL)');
    await client.query(
      'CREATE TABLE account_access (user_id text PRIMARY KEY REFERENCES "user"(id), is_active boolean NOT NULL)',
    );
    await client.query(
      'CREATE TABLE account_role_grant (user_id text NOT NULL REFERENCES "user"(id), role text NOT NULL)',
    );
    await client.query('INSERT INTO "user" (id, name) VALUES ($1, $2)', [
      actorId,
      "Synthetic Admin",
    ]);
    await client.query("INSERT INTO account_access (user_id, is_active) VALUES ($1, true)", [
      actorId,
    ]);
    await client.query("INSERT INTO account_role_grant (user_id, role) VALUES ($1, 'admin')", [
      actorId,
    ]);

    for (const file of [
      "0024_free_magus.sql",
      "0025_lethal_nova.sql",
      "0026_compensatory_requests.sql",
      "0027_tiresome_brother_voodoo.sql",
    ]) {
      const migration = fs
        .readFileSync(path.join(root, "drizzle", file), "utf8")
        .replaceAll('"public".', `${schemaSql}.`);
      await client.query(migration);
    }

    const noArchive = await addStaffAndAudit(client, "12345001");
    await expectRejected(client, "DELETE FROM compensatory_staff_audit WHERE id = $1", [
      noArchive.audit.id,
    ]);
    const noArchiveCount = await client.query(
      "SELECT count(*)::int AS count FROM compensatory_staff_audit WHERE id = $1",
      [noArchive.audit.id],
    );
    if (noArchiveCount.rows[0].count !== 1) throw new Error("GUC-only deletion changed history.");

    const wrongMembership = await addStaffAndAudit(client, "12345002");
    await client.query(
      `INSERT INTO compensatory_staff_deletion_audit
        (staff_id, staff_snapshot, prior_audits, actor_user_id, actor_name, operation_id, reason)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, $7)`,
      [
        wrongMembership.staff.id,
        JSON.stringify({ id: wrongMembership.staff.id }),
        JSON.stringify([{ id: randomUUID() }]),
        actorId,
        "Synthetic Admin",
        randomUUID(),
        "Synthetic mismatched archive",
      ],
    );
    await expectRejected(client, "DELETE FROM compensatory_staff_audit WHERE id = $1", [
      wrongMembership.audit.id,
    ]);

    const wrongStaff = await addStaffAndAudit(client, "12345005");
    await client.query(
      `INSERT INTO compensatory_staff_deletion_audit
        (staff_id, staff_snapshot, prior_audits, actor_user_id, actor_name, operation_id, reason)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, $7)`,
      [
        randomUUID(),
        JSON.stringify({ id: wrongStaff.staff.id }),
        JSON.stringify([{ id: wrongStaff.audit.id }]),
        actorId,
        "Synthetic Admin",
        randomUUID(),
        "Synthetic mismatched archive staff id",
      ],
    );
    await expectRejected(client, "DELETE FROM compensatory_staff_audit WHERE id = $1", [
      wrongStaff.audit.id,
    ]);

    const wrongSnapshot = await addStaffAndAudit(client, "12345003");
    await client.query(
      `INSERT INTO compensatory_staff_deletion_audit
        (staff_id, staff_snapshot, prior_audits, actor_user_id, actor_name, operation_id, reason)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, $7)`,
      [
        wrongSnapshot.staff.id,
        JSON.stringify({ id: randomUUID() }),
        JSON.stringify([{ id: wrongSnapshot.audit.id }]),
        actorId,
        "Synthetic Admin",
        randomUUID(),
        "Synthetic mismatched staff snapshot",
      ],
    );
    await expectRejected(client, "DELETE FROM compensatory_staff_audit WHERE id = $1", [
      wrongSnapshot.audit.id,
    ]);

    const valid = await addStaffAndAudit(client, "12345004");
    const service = loadDeleteService()(createSqlStore(client));
    const operationId = randomUUID();
    const result = await service.deleteStaff(actorId, {
      staffId: valid.staff.id,
      expectedVersion: 1,
      reason: "Synthetic verified deletion",
      clientOperationId: operationId,
    });
    if (result.id !== valid.staff.id) throw new Error("The service returned the wrong staff id.");
    const archive = await client.query(
      "SELECT staff_snapshot, prior_audits FROM compensatory_staff_deletion_audit WHERE staff_id = $1",
      [valid.staff.id],
    );
    if (
      archive.rowCount !== 1 ||
      archive.rows[0].staff_snapshot.id !== valid.staff.id ||
      !archive.rows[0].prior_audits.some((entry) => entry.id === valid.audit.id)
    ) {
      throw new Error("The service did not retain matching staff and profile-audit snapshots.");
    }
    for (const sql of [
      "UPDATE compensatory_staff_deletion_audit SET reason = 'tampered' WHERE staff_id = $1",
      "DELETE FROM compensatory_staff_deletion_audit WHERE staff_id = $1",
    ]) {
      await expectRejected(client, sql, [valid.staff.id]);
    }
    const removedAudit = await client.query(
      "SELECT count(*)::int AS count FROM compensatory_staff_audit WHERE id = $1",
      [valid.audit.id],
    );
    const removedStaff = await client.query(
      "SELECT count(*)::int AS count FROM compensatory_staff WHERE id = $1",
      [valid.staff.id],
    );
    if (removedAudit.rows[0].count !== 0 || removedStaff.rows[0].count !== 0) {
      throw new Error(
        "The actual deletion service did not remove the staff and archived profile audit.",
      );
    }

    console.log(
      "Compensatory staff deletion database probe passed in an isolated synthetic schema.",
    );
  } finally {
    if (schemaCreated) {
      await client.query("RESET search_path");
      await client.query(`DROP SCHEMA ${schemaSql} CASCADE`);
    }
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
