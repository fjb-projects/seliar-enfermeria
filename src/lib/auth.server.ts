import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import * as schema from "../db/schema";
import { accountAccess } from "../db/schema";
import { eq } from "drizzle-orm";
import { getDatabase } from "../db/index.server";
import { reportAuthFailure } from "./auth-diagnostics.server";

type AuthEnvironment = Record<string, string | undefined>;

export function authConfiguration(env: AuthEnvironment, database?: ReturnType<typeof getDatabase>) {
  const secret = env["BETTER_AUTH_SECRET"]?.trim();
  const baseURL = env["BETTER_AUTH_URL"]?.trim();
  if (!secret || secret.length < 32)
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
  if (!baseURL) throw new Error("BETTER_AUTH_URL must be configured");
  let parsed: URL;
  try {
    parsed = new URL(baseURL);
  } catch {
    throw new Error("BETTER_AUTH_URL must be a valid URL");
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost")
    throw new Error("BETTER_AUTH_URL must use HTTPS outside localhost");
  return {
    secret,
    baseURL,
    ...(database
      ? { database: drizzleAdapter(database, { provider: "pg", schema, transaction: true }) }
      : {}),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    onAPIError: {
      onError: (error: unknown) => reportAuthFailure(error, "better-auth-api"),
    },
    logger: {
      level: "error" as const,
      log: (_level: string, _message: string, ...details: unknown[]) =>
        reportAuthFailure(details, "better-auth-logger"),
    },
    plugins: [tanstackStartCookies()],
  };
}

function createAuth() {
  return betterAuth(
    authConfiguration(process.env, getDatabase()) as Parameters<typeof betterAuth>[0],
  );
}
type AuthInstance = ReturnType<typeof createAuth>;
let instance: AuthInstance | undefined;
export function getAuth() {
  return (instance ??= createAuth());
}

export function resetAuthForTests() {
  instance = undefined;
}

export async function isAccountActive(userId: string): Promise<boolean> {
  const rows = await getDatabase()
    .select({ isActive: accountAccess.isActive })
    .from(accountAccess)
    .where(eq(accountAccess.userId, userId))
    .limit(1);
  return rows[0]?.isActive === true;
}
