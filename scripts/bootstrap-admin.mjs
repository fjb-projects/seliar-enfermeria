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

export function validateInitialAdmins(input) {
  if (!Array.isArray(input) || input.length !== 1) {
    throw new Error("Bootstrap requires exactly one administrator entry.");
  }
  const normalized = input.map(({ name, email, password }) => ({
    name: typeof name === "string" ? name.trim() : "",
    email: typeof email === "string" ? email.trim().toLowerCase() : "",
    password: typeof password === "string" ? password : "",
  }));
  if (normalized.some(({ name }) => name.length < 1 || name.length > 120)) {
    throw new Error("Each administrator name must contain 1–120 characters.");
  }
  if (
    normalized.some(({ email }) => email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  ) {
    throw new Error("Each administrator email must be valid.");
  }
  if (
    normalized.some(
      ({ password }) => password.length < passwordMinLength || password.length > passwordMaxLength,
    )
  ) {
    throw new Error(
      `Each password must contain ${passwordMinLength}–${passwordMaxLength} characters.`,
    );
  }
  return normalized;
}

export async function collectInitialAdmins({ promptLine, promptSecret }) {
  const confirmation = await promptLine(
    `This creates the first administrator account. Type ${BOOTSTRAP_CONFIRMATION} to continue: `,
  );
  if (confirmation !== BOOTSTRAP_CONFIRMATION) {
    throw new Error("Initial administrator bootstrap was not confirmed.");
  }

  const name = await promptLine("Administrator name: ");
  const email = await promptLine("Administrator email: ");
  const password = await promptSecret("Administrator password (hidden): ");
  const passwordConfirmation = await promptSecret("Administrator password again (hidden): ");
  if (password !== passwordConfirmation) {
    throw new Error("The administrator passwords did not match.");
  }
  return validateInitialAdmins([{ name, email, password }]);
}

export async function readHidden(prompt, { input = stdin, output = stdout } = {}) {
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("Run this command in an interactive terminal to enter hidden passwords.");
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
          reject(new Error("Password entry was cancelled."));
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
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    await client.query("SELECT pg_advisory_xact_lock($1)", [ADMIN_LOCK_KEY]);
    const existing = await client.query(
      `SELECT
         EXISTS (SELECT 1 FROM account_role_grant WHERE role = $1) AS has_admin_grant,
         EXISTS (
           SELECT 1 FROM account_role_grant AS grants
           INNER JOIN account_access AS access ON access.user_id = grants.user_id
           WHERE grants.role = $1 AND access.is_active = true
         ) AS has_active_admin`,
      ["admin"],
    );
    const state = existing.rows?.[0];
    if (state?.has_admin_grant || state?.has_active_admin) {
      throw new Error("Initial administrator bootstrap already exists; no accounts were changed.");
    }

    for (const admin of admins) {
      const userId = createId();
      const passwordHash = await hashPassword(admin.password);
      await client.query(
        'INSERT INTO "user" ("id", "name", "email", "email_verified") VALUES ($1, $2, $3, true)',
        [userId, admin.name, admin.email],
      );
      await client.query(
        'INSERT INTO "account" ("id", "account_id", "provider_id", "user_id", "password") VALUES ($1, $2, $3, $4, $5)',
        [createId(), userId, "credential", userId, passwordHash],
      );
      await client.query(
        'INSERT INTO "account_access" ("user_id", "is_active", "version") VALUES ($1, true, 1)',
        [userId],
      );
      await client.query(
        'INSERT INTO "account_role_grant" ("user_id", "role", "granted_by_user_id") VALUES ($1, $2, NULL)',
        [userId, "admin"],
      );
      await client.query(
        `INSERT INTO "account_audit"
          ("actor_user_id", "target_user_id", "action", "version_before", "version_after", "before_state", "after_state")
         VALUES (NULL, $1, 'created', NULL, 1, NULL, $2::jsonb)`,
        [userId, JSON.stringify({ isActive: true, roles: ["admin"] })],
      );
    }
    await client.query("COMMIT");
    transactionStarted = false;
    return { created: 1 };
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original failure without exposing driver diagnostics.
      }
    }
    if (
      error instanceof Error &&
      error.message.startsWith("Initial administrator bootstrap already exists")
    ) {
      throw error;
    }
    throw new Error("Initial administrator bootstrap transaction failed.");
  } finally {
    client.release();
  }
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
    throw new Error("Choose --help or --apply; no accounts were changed.");
  }
  const connectionString =
    typeof env["DATABASE_URL"] === "string" ? env["DATABASE_URL"].trim() : "";
  if (!connectionString) throw new Error("DATABASE_URL is required when using --apply.");

  const admins = await collectInitialAdmins({ promptLine, promptSecret });
  const pool = createPool(connectionString);
  try {
    return await bootstrapAdminAccounts({ pool, admins, hashPassword });
  } finally {
    for (const admin of admins) admin.password = "";
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBootstrap()
    .then((result) => {
      if (result.status === "help") return;
      stdout.write(
        "The initial administrator account was created. No account details are displayed.\n",
      );
    })
    .catch(() => {
      process.stderr.write(
        "Bootstrap did not complete. No account or database details are displayed.\n",
      );
      process.exitCode = 1;
    });
}
