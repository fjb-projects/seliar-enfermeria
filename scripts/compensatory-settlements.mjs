#!/usr/bin/env node
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const usage = `Usage: node scripts/compensatory-settlements.mjs <once|watch|help>

Runs the compensatory settlement service against DATABASE_URL from the process environment.
The database URL must target a loopback PostgreSQL server. No .env files are loaded.
`;
const mode = process.argv[2] ?? "help";
if (!["once", "watch", "help"].includes(mode)) {
  process.stderr.write(usage);
  process.exitCode = 2;
} else if (mode === "help") {
  process.stdout.write(usage);
} else {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("Set DATABASE_URL explicitly in the process environment.");
  const hostname = new URL(databaseUrl).hostname.toLowerCase();
  if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname)) {
    throw new Error(
      "Settlement execution is restricted to an explicitly configured loopback database.",
    );
  }
  const root = path.resolve(import.meta.dirname, "..");
  const outputDir = path.join(root, "node_modules", ".cache");
  const bundlePath = path.join(outputDir, `compensatory-settlement-${process.pid}.mjs`);
  await mkdir(outputDir, { recursive: true });
  let closeDatabase = async () => {};
  try {
    const esbuild = await import("esbuild");
    await esbuild.build({
      entryPoints: [path.join(root, "src/jobs/compensatory-settlements.server.ts")],
      outfile: bundlePath,
      bundle: true,
      packages: "external",
      platform: "node",
      format: "esm",
      target: "node20",
      sourcemap: false,
    });
    const {
      closeCompensatorySettlementDatabase,
      runDueCompensatorySettlements,
      watchCompensatorySettlements,
    } = await import(pathToFileURL(bundlePath).href);
    closeDatabase = closeCompensatorySettlementDatabase;
    const service = { processDue: runDueCompensatorySettlements };
    if (mode === "once") await runDueCompensatorySettlements();
    else {
      const controller = new AbortController();
      process.once("SIGINT", () => controller.abort());
      process.once("SIGTERM", () => controller.abort());
      await watchCompensatorySettlements(service, { signal: controller.signal }).catch((error) => {
        if (!controller.signal.aborted) throw error;
      });
    }
    process.stdout.write("Settlement pass completed.\n");
  } catch {
    process.stderr.write("Settlement execution failed; inspect protected server logs.\n");
    process.exitCode = 1;
  } finally {
    await closeDatabase().catch(() => undefined);
    await rm(bundlePath, { force: true });
  }
}
