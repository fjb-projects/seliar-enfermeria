import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useRouteContext: () => ({
      session: {
        user: { id: "admin-1", name: "Admin", email: "admin@example.test" },
        roles: ["admin"],
        expiresAt: "2030-01-01T00:00:00Z",
      },
    }),
    useLoaderData: () => ({ accounts: [], bases: [], institutions: [] }),
  }),
  redirect: vi.fn(),
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/SeliarNavigationProvider", () => ({
  useSeliarNavigation: () => ({ requestLogout: vi.fn(), logoutPending: false, logoutError: "" }),
}));
vi.mock("@/lib/accounts.functions", () => ({ listAccounts: vi.fn() }));
vi.mock("@/lib/efa-bases.functions", () => ({ listAdminBases: vi.fn() }));
vi.mock("@/lib/efa-institutions.functions", () => ({ listAdminInstitutions: vi.fn() }));
vi.mock("@/lib/auth.functions", () => ({ readSession: vi.fn() }));
vi.mock("@/components/AccountAdminForm", () => ({ AccountAdminForm: () => <p>Account form</p> }));
vi.mock("@/components/AccountAdminList", () => ({ AccountAdminList: () => <p>Account list</p> }));
vi.mock("@/components/AdminBaseCatalog", () => ({ AdminBaseCatalog: () => null }));
vi.mock("@/components/AdminStaffingPlan", () => ({ AdminStaffingPlan: () => null }));
vi.mock("@/components/AdminInstitutionCatalog", () => ({ AdminInstitutionCatalog: () => null }));

import { Route } from "./admin-usuarios";

describe("administrator institutional catalog route wiring", () => {
  it("loads the server-authorized shared catalog and renders its maintenance UI", () => {
    const source = readFileSync(resolve(process.cwd(), "src/routes/admin-usuarios.tsx"), "utf8");
    expect(source).toContain("listAdminInstitutions()");
    expect(source).toContain("<AdminInstitutionCatalog initialInstitutions={data.institutions} />");
    expect(source).toContain("isAdministrator(session.roles)");
  });
});

describe("accounts coordination layout", () => {
  it("retains the coordination sidebar and accounts content at the existing URL", () => {
    const Page = Route.options.component!;
    const html = renderToStaticMarkup(<Page />);
    expect(html.includes('<aside aria-label="Coordinación"')).toBe(true);
    expect(html).toMatch(/href="\/admin-usuarios"[^>]*aria-current="page"/);
    expect(html.includes('href="/coordinacion/compensatorios"')).toBe(true);
    expect(html.includes("Account form")).toBe(true);
    expect(html.includes("Account list")).toBe(true);
  });
});
