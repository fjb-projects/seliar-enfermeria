import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = resolve(root, "drizzle/0005_seed_efa_base_catalog.sql");
const migrationExists = () => {
  try {
    return readFileSync(migrationPath, "utf8");
  } catch {
    return null;
  }
};

const mobileChoices = [
  "Móvil 1",
  "Móvil 2",
  "Móvil 3",
  "Móvil 4",
  "Móvil 5",
  "Móvil 6",
  "Móvil 7",
  "Móvil 9",
  "Móvil 11",
  "Móvil 12",
  "Móvil 15",
  "Móvil 26",
  "Móvil Flotante",
  "Otro Movil no Nomenclado",
] as const;

function readChoices(sourcePath: string) {
  const source = readFileSync(resolve(root, sourcePath), "utf8");
  const choices = source.match(/const MOBILE_CHOICES = \[([\s\S]*?)\] as const/)?.[1];
  if (!choices) throw new Error(`MOBILE_CHOICES not found in ${sourcePath}`);
  return [...choices.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

describe("EFA mobile catalog migration", () => {
  it("matches both existing mobile option catalogs verbatim", () => {
    expect(readChoices("src/lib/compensatorio.functions.ts")).toEqual(mobileChoices);
    expect(readChoices("src/routes/compensatorio.tsx")).toEqual(mobileChoices);
  });

  it("seeds every literal option with its locale-independent normalized name", () => {
    const sql = migrationExists();
    expect(sql).not.toBeNull();
    const values = sql!.match(
      /INSERT INTO public\.efa_base[\s\S]*?VALUES([\s\S]*?)ON CONFLICT/i,
    )?.[1];
    expect(values).toBeDefined();
    const inserted = [
      ...values!.matchAll(/^\s*\('([^']+)', '([^']+)', true, 1, 'system:efa-base-catalog'\)/gmu),
    ];
    expect(inserted.map((row) => row[1])).toEqual(mobileChoices);

    for (const [index, name] of mobileChoices.entries()) {
      const normalizedName = name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
      expect(inserted[index]?.[2]).toBe(normalizedName);
    }
    expect(sql).toContain("Móvil Flotante");
    expect(sql).toContain("Otro Movil no Nomenclado");
  });

  it("journals one monotonic data migration without a schema snapshot", () => {
    const journal = JSON.parse(
      readFileSync(resolve(root, "drizzle/meta/_journal.json"), "utf8"),
    ) as { entries: Array<{ idx: number; when: number; tag: string }> };
    const matching = journal.entries.filter((entry) => entry.tag === "0005_seed_efa_base_catalog");
    expect(matching).toHaveLength(1);
    expect(matching[0]).toMatchObject({ idx: 5, tag: "0005_seed_efa_base_catalog" });
    expect(matching[0]!.when).toBeGreaterThan(journal.entries[4]!.when);
    expect(journal.entries.map((entry) => entry.idx)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(() => readFileSync(resolve(root, "drizzle/meta/0005_snapshot.json"))).toThrow();
  });

  it("uses a guarded system actor without credentials or enabled account privileges", () => {
    const sql = migrationExists();
    expect(sql).not.toBeNull();
    expect(sql).toMatch(/system:efa-base-catalog/);
    expect(sql).toMatch(/efa-base-catalog@system\.invalid/);
    expect(sql).toMatch(/WHERE id = system_user_id OR email = system_user_email/);
    expect(sql).toMatch(/RAISE EXCEPTION/);
    const authenticationGuards = [
      /public\.account\s+WHERE user_id = system_user_id OR account_id = system_user_id/i,
      /public\.session WHERE user_id = system_user_id/i,
      /public\.account_access WHERE user_id = system_user_id/i,
      /public\.account_role_grant\s+WHERE user_id = system_user_id OR granted_by_user_id = system_user_id/i,
      /public\.verification WHERE identifier = system_user_email/i,
    ];
    for (const guard of authenticationGuards) {
      expect(sql).toMatch(guard);
    }
    for (const table of ["account", "session", "account_access", "account_role_grant"]) {
      expect(sql).not.toMatch(new RegExp(`INSERT INTO public\\.${table}`, "i"));
    }

    const accounts = readFileSync(resolve(root, "src/lib/accounts.server.ts"), "utf8");
    expect(accounts).toMatch(/innerJoin\(accountAccess, eq\(accountAccess\.userId, user\.id\)\)/);
    expect(accounts).toMatch(/const id = createId\(\)/);
    const auth = readFileSync(resolve(root, "src/lib/auth.server.ts"), "utf8");
    expect(auth).toContain("disableSignUp: true");
  });

  it("skips existing normalized names and audits only rows returned as newly inserted", () => {
    const sql = migrationExists();
    expect(sql).not.toBeNull();
    expect(sql).toMatch(/ON CONFLICT\s*\(normalized_name\)\s*DO NOTHING/i);
    expect(sql).toMatch(
      /WITH inserted_bases AS \([\s\S]*?INSERT INTO public\.efa_base[\s\S]*?RETURNING id, name, is_active, version\s*\)\s*INSERT INTO public\.efa_base_audit[\s\S]*?FROM inserted_bases/i,
    );
    expect(sql).toMatch(/'created',\s*NULL,\s*version,\s*NULL/);
    expect(sql).toMatch(/jsonb_build_object\('name', name, 'isActive', is_active\)/);
  });
});
