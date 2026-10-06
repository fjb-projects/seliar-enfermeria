import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { Pool } from "@neondatabase/serverless";
import { hashPassword as betterAuthHashPassword } from "better-auth/crypto";

export const ADMIN_LOCK_KEY = 71420261;
export const BOOTSTRAP_CONFIRMATION = "CREATE THE INITIAL ADMINISTRATOR";
const passwordMinLength = 12;
const passwordMaxLength = 128;

export function commandMode(args) {
  if (args.length === 1 && args[0] === "--help") return "help";
  if (args.length === 1 && args[0] === "--apply") return "apply";
  return "invalid";
}

const stageNames = new Set([
  "arguments",
  "configuration",
  "confirmation",
  "credentials",
  "password_input",
  "connection",
  "transaction_begin",
  "advisory_lock",
  "admin_check",
  "password_hash",
  "user_write",
  "credential_write",
  "access_write",
  "grant_write",
  "audit_write",
  "commit",
  "rollback",
  "client_cleanup",
  "pool_cleanup",
  "unknown",
]);
const categories = new Set([
  "invalid_arguments",
  "missing_database_url",
  "confirmation_rejected",
  "invalid_admin_count",
  "invalid_name",
  "invalid_email",
  "invalid_password",
  "password_mismatch",
  "interactive_terminal_required",
  "administrator_exists",
  "duplicate_account",
  "database_authentication",
  "database_missing",
  "database_permissions",
  "schema_missing",
  "schema_mismatch",
  "connection_unavailable",
  "operation_failure",
  "transaction_uncertain",
]);
const knownCodes = new Map([
  ["23505", "duplicate_account"],
  ["28P01", "database_authentication"],
  ["3D000", "database_missing"],
  ["42501", "database_permissions"],
  ["42P01", "schema_missing"],
  ["42703", "schema_mismatch"],
  ["08000", "connection_unavailable"],
  ["08001", "connection_unavailable"],
  ["08006", "connection_unavailable"],
  ["ECONNREFUSED", "connection_unavailable"],
  ["ECONNRESET", "connection_unavailable"],
  ["ETIMEDOUT", "connection_unavailable"],
  ["ENOTFOUND", "connection_unavailable"],
  ["EAI_AGAIN", "connection_unavailable"],
]);
const categoryActions = {
  invalid_arguments: "Use --help for the supported command syntax.",
  missing_database_url: "Set DATABASE_URL in the approved local process environment.",
  confirmation_rejected:
    "The confirmation was not confirmed. No connection was opened; confirm explicitly when ready.",
  invalid_admin_count: "Provide exactly one initial administrator.",
  invalid_name: "Provide a name between 1 and 120 characters.",
  invalid_email: "Provide a valid email address up to 255 characters.",
  invalid_password: "Provide a password between 12 and 128 characters.",
  password_mismatch: "The password entries did not match; restart and enter them consistently.",
  interactive_terminal_required:
    "Run the command in an interactive terminal so passwords remain hidden.",
  administrator_exists:
    "An administrator already exists. Sign in with that account; do not rerun bootstrap.",
  duplicate_account:
    "A database uniqueness rule rejected the account. Verify the email and existing account state before retrying.",
  database_authentication:
    "Check the database role and local connection configuration without sharing secrets.",
  database_missing: "Check that the selected database exists and the local connection targets it.",
  database_permissions:
    "Check the database role permissions and that authorized migrations were applied.",
  schema_missing: "Check that the required migrations were applied to the selected database.",
  schema_mismatch: "Check that the selected database has the expected application schema.",
  connection_unavailable:
    "Check the approved local database configuration and connectivity, without sharing the connection URL.",
  operation_failure:
    "Check the selected database schema and configuration through an authorized channel.",
  transaction_uncertain:
    "Verify whether the initial administrator exists before any retry; do not rerun blindly.",
};

function propertyValue(value, key) {
  if (!value || typeof value !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

export function formatBootstrapDiagnostic(value) {
  const stageValue = propertyValue(value, "stage");
  const categoryValue = propertyValue(value, "category");
  const outcomeValue = propertyValue(value, "outcome");
  const rawCode = propertyValue(value, "safeCode");
  const stage = stageNames.has(stageValue) ? stageValue : "unknown";
  const category = categories.has(categoryValue) ? categoryValue : "operation_failure";
  const outcome = ["not_committed", "unknown", "committed"].includes(outcomeValue)
    ? outcomeValue
    : "not_committed";
  const code = typeof rawCode === "string" && knownCodes.has(rawCode) ? rawCode : "BOOTSTRAP_ERROR";
  if (outcome === "committed") {
    return `The initial administrator was created and committed, but cleanup failed at ${stage} [${code}]. Sign in with the chosen email; do not rerun bootstrap.`;
  }
  if (outcome === "unknown") {
    return `The bootstrap outcome is unknown at ${stage} [${code}]. ${categoryActions.transaction_uncertain}`;
  }
  return `Bootstrap could not complete at ${stage} [${code}]. ${categoryActions[category]}`;
}

function bootstrapFailure(stage, category, { safeCode, outcome = "not_committed" } = {}) {
  const safeStage = stageNames.has(stage) ? stage : "unknown";
  const safeCategory = categories.has(category) ? category : "operation_failure";
  const failure = new Error("Bootstrap operation failed.");
  failure.stage = safeStage;
  failure.category = safeCategory;
  failure.safeCode =
    typeof safeCode === "string" && knownCodes.has(safeCode) ? safeCode : undefined;
  failure.outcome = ["not_committed", "unknown", "committed"].includes(outcome)
    ? outcome
    : "unknown";
  failure.message = formatBootstrapDiagnostic(failure);
  return failure;
}

function failureFor(stage, error, outcome = "not_committed") {
  if (propertyValue(error, "stage") && stageNames.has(propertyValue(error, "stage"))) {
    if (outcome === "unknown") error.outcome = outcome;
    return error;
  }
  const rawCode = propertyValue(error, "code");
  const safeCode = typeof rawCode === "string" && knownCodes.has(rawCode) ? rawCode : undefined;
  const category = safeCode ? knownCodes.get(safeCode) : "operation_failure";
  return bootstrapFailure(stage, category, { safeCode, outcome });
}

async function atStage(stage, operation) {
  try {
    return await operation();
  } catch (error) {
    throw failureFor(stage, error);
  }
}

export function validateInitialAdmins(input) {
  if (!Array.isArray(input) || input.length !== 1) {
    throw bootstrapFailure("credentials", "invalid_admin_count");
  }
  const normalized = input.map(({ name, email, password }) => ({
    name: typeof name === "string" ? name.trim() : "",
    email: typeof email === "string" ? email.trim().toLowerCase() : "",
    password: typeof password === "string" ? password : "",
  }));
  if (normalized.some(({ name }) => name.length < 1 || name.length > 120)) {
    throw bootstrapFailure("credentials", "invalid_name");
  }
  if (
    normalized.some(({ email }) => email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  ) {
    throw bootstrapFailure("credentials", "invalid_email");
  }
  if (
    normalized.some(
      ({ password }) => password.length < passwordMinLength || password.length > passwordMaxLength,
    )
  ) {
    throw bootstrapFailure("credentials", "invalid_password");
  }
  return normalized;
}

export async function collectInitialAdmins({ promptLine, promptSecret }) {
  const confirmation = await atStage("confirmation", () =>
    promptLine(
      `This creates the first administrator account. Type ${BOOTSTRAP_CONFIRMATION} to continue: `,
    ),
  );
  if (confirmation !== BOOTSTRAP_CONFIRMATION) {
    throw bootstrapFailure("confirmation", "confirmation_rejected");
  }

  const name = await atStage("credentials", () => promptLine("Administrator name: "));
  const email = await atStage("credentials", () => promptLine("Administrator email: "));
  const password = await atStage("password_input", () =>
    promptSecret("Administrator password (hidden): "),
  );
  const passwordConfirmation = await atStage("password_input", () =>
    promptSecret("Administrator password again (hidden): "),
  );
  if (password !== passwordConfirmation) {
    throw bootstrapFailure("credentials", "password_mismatch");
  }
  return validateInitialAdmins([{ name, email, password }]);
}

export async function readHidden(prompt, { input = stdin, output = stdout } = {}) {
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    throw bootstrapFailure("password_input", "interactive_terminal_required");
  }
  output.write(prompt);
  input.resume();
  input.setRawMode(true);
  return new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      input.setRawMode(false);
      input.pause();
      input.removeListener("data", onData);
      output.write("\n");
    };
    const onData = (chunk) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") {
          cleanup();
          reject(bootstrapFailure("password_input", "confirmation_rejected"));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = Array.from(value).slice(0, -1).join("");
        } else if (character >= " ") {
          value += character;
        }
      }
    };
    input.on("data", onData);
  });
}

export async function bootstrapAdminAccounts({
  pool,
  admins: inputAdmins,
  hashPassword = betterAuthHashPassword,
  createId = () => crypto.randomUUID(),
}) {
  const admins = validateInitialAdmins(inputAdmins);
  let client;
  let transactionStarted = false;
  let committed = false;
  let failure;
  let cleanupWarning;
  let stage = "connection";
  try {
    client = await atStage("connection", () => pool.connect());
    stage = "transaction_begin";
    await atStage(stage, () => client.query("BEGIN"));
    transactionStarted = true;
    stage = "advisory_lock";
    await atStage(stage, () => client.query("SELECT pg_advisory_xact_lock($1)", [ADMIN_LOCK_KEY]));
    stage = "admin_check";
    const existing = await atStage(stage, () =>
      client.query(
        `SELECT
             EXISTS (SELECT 1 FROM account_role_grant WHERE role = $1) AS has_admin_grant,
             EXISTS (
               SELECT 1 FROM account_role_grant AS grants
               INNER JOIN account_access AS access ON access.user_id = grants.user_id
               WHERE grants.role = $1 AND access.is_active = true
             ) AS has_active_admin`,
        ["admin"],
      ),
    );
    const state = existing.rows?.[0];
    if (state?.has_admin_grant || state?.has_active_admin) {
      throw bootstrapFailure(stage, "administrator_exists");
    }

    for (const admin of admins) {
      const userId = createId();
      stage = "password_hash";
      const passwordHash = await atStage(stage, () => hashPassword(admin.password));
      stage = "user_write";
      await atStage(stage, () =>
        client.query(
          'INSERT INTO "user" ("id", "name", "email", "email_verified") VALUES ($1, $2, $3, true)',
          [userId, admin.name, admin.email],
        ),
      );
      stage = "credential_write";
      await atStage(stage, () =>
        client.query(
          'INSERT INTO "account" ("id", "account_id", "provider_id", "user_id", "password") VALUES ($1, $2, $3, $4, $5)',
          [createId(), userId, "credential", userId, passwordHash],
        ),
      );
      stage = "access_write";
      await atStage(stage, () =>
        client.query(
          'INSERT INTO "account_access" ("user_id", "is_active", "version") VALUES ($1, true, 1)',
          [userId],
        ),
      );
      stage = "grant_write";
      await atStage(stage, () =>
        client.query(
          'INSERT INTO "account_role_grant" ("user_id", "role", "granted_by_user_id") VALUES ($1, $2, NULL)',
          [userId, "admin"],
        ),
      );
      stage = "audit_write";
      await atStage(stage, () =>
        client.query(
          `INSERT INTO "account_audit"
            ("actor_user_id", "target_user_id", "action", "version_before", "version_after", "before_state", "after_state")
           VALUES (NULL, $1, 'created', NULL, 1, NULL, $2::jsonb)`,
          [userId, JSON.stringify({ isActive: true, roles: ["admin"] })],
        ),
      );
    }
    stage = "commit";
    await atStage(stage, () => client.query("COMMIT"));
    committed = true;
    transactionStarted = false;
  } catch (error) {
    failure = failureFor(stage, error);
    if (stage === "commit") {
      failure.outcome = "unknown";
      failure.message = formatBootstrapDiagnostic(failure);
    }
    if (transactionStarted && !committed) {
      try {
        await client.query("ROLLBACK");
        transactionStarted = false;
      } catch (rollbackError) {
        failure = failureFor("rollback", rollbackError, "unknown");
        failure.category = "transaction_uncertain";
        failure.message = formatBootstrapDiagnostic(failure);
      }
    }
  }

  if (client) {
    try {
      await client.release();
    } catch (error) {
      if (committed) cleanupWarning = failureFor("client_cleanup", error, "committed");
      else if (!failure) failure = failureFor("client_cleanup", error, "unknown");
    }
  }
  if (failure) throw failure;
  return cleanupWarning
    ? { created: 1, committed: true, cleanupWarning }
    : { created: 1, committed: true };
}

export async function runBootstrap({
  args = process.argv.slice(2),
  env = process.env,
  promptLine = async (prompt) => {
    const interface_ = createInterface({ input: stdin, output: stdout });
    try {
      return await interface_.question(prompt);
    } finally {
      interface_.close();
    }
  },
  promptSecret = readHidden,
  createPool = (connectionString) => new Pool({ connectionString }),
  hashPassword = betterAuthHashPassword,
  print = (message) => stdout.write(`${message}\n`),
} = {}) {
  const mode = commandMode(args);
  if (mode === "help") {
    print(
      "Usage: node --env-file=.env scripts/bootstrap-admin.mjs --apply\nCreates exactly one initial administrator; additional accounts can be created after login. Requires an authorized migrated database, DATABASE_URL, an interactive terminal, and explicit confirmation. Never run against an unapproved database.",
    );
    return { status: "help" };
  }
  if (mode !== "apply") {
    throw bootstrapFailure("arguments", "invalid_arguments");
  }
  const connectionString =
    typeof env["DATABASE_URL"] === "string" ? env["DATABASE_URL"].trim() : "";
  if (!connectionString) throw bootstrapFailure("configuration", "missing_database_url");

  const admins = await collectInitialAdmins({ promptLine, promptSecret });
  const pool = await atStage("connection", () => createPool(connectionString));
  let result;
  let failure;
  let cleanupWarning;
  try {
    result = await bootstrapAdminAccounts({ pool, admins, hashPassword });
  } catch (error) {
    failure = error;
  }
  cleanupWarning = result?.cleanupWarning;
  for (const admin of admins) admin.password = "";
  try {
    await pool.end();
  } catch (error) {
    if (!failure && result?.committed)
      cleanupWarning = failureFor("pool_cleanup", error, "committed");
    else if (!failure) failure = failureFor("pool_cleanup", error, "unknown");
  }
  if (failure) throw failure;
  return cleanupWarning ? { ...result, cleanupWarning } : result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBootstrap()
    .then((result) => {
      if (result.status === "help") return;
      if (result.cleanupWarning) {
        process.stderr.write(`${formatBootstrapDiagnostic(result.cleanupWarning)}\n`);
        process.exitCode = 1;
        return;
      }
      stdout.write(
        "The initial administrator account was created. No account details are displayed.\n",
      );
    })
    .catch((error) => {
      process.stderr.write(`${formatBootstrapDiagnostic(error)}\n`);
      process.exitCode = 1;
    });
}
