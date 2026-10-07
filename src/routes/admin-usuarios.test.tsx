import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("administrator institutional catalog route wiring", () => {
  it("loads the server-authorized shared catalog and renders its maintenance UI", () => {
    const source = readFileSync(resolve(process.cwd(), "src/routes/admin-usuarios.tsx"), "utf8");
    expect(source).toContain("listAdminInstitutions()");
    expect(source).toContain("<AdminInstitutionCatalog initialInstitutions={data.institutions} />");
    expect(source).toContain("isAdministrator(session.roles)");
  });
});
