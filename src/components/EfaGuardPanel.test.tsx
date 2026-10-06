import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EfaGuardPanel, type GuardView } from "./EfaGuardPanel";

vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => vi.fn(async () => []),
}));
vi.mock("@/lib/efa-guards.functions", () => ({
  correctEfaGuardEnd: vi.fn(),
  endEfaGuard: vi.fn(),
  listActiveEfaGuardBases: vi.fn(),
  listEfaGuards: vi.fn(),
  setEfaGuardBases: vi.fn(),
  startEfaGuard: vi.fn(),
}));

describe("EfaGuardPanel", () => {
  it("initializes selected bases only from the current user's open guard", () => {
    const initialGuards: GuardView[] = [
      {
        id: "other-guard",
        ownerUserId: "other-user",
        startedAt: "2026-10-06T10:00:00.000Z",
        endedAt: null,
        declaredAtCentral: true,
        version: 1,
        bases: [{ id: "base-other", name: "Oeste", isActive: true }],
        baseEvents: [],
      },
      {
        id: "own-guard",
        ownerUserId: "current-user",
        startedAt: "2026-10-06T11:00:00.000Z",
        endedAt: null,
        declaredAtCentral: true,
        version: 2,
        bases: [
          { id: "base-a", name: "Central", isActive: true },
          { id: "base-b", name: "Norte", isActive: true },
        ],
        baseEvents: [],
      },
    ];
    const html = renderToStaticMarkup(
      <EfaGuardPanel
        initialGuards={initialGuards}
        activeBases={[
          { id: "base-a", name: "Central", isActive: true },
          { id: "base-b", name: "Norte", isActive: true },
          { id: "base-other", name: "Oeste", isActive: true },
        ]}
        currentUserId="current-user"
        isAdmin
      />,
    );
    const selectedBases = [
      ...html.matchAll(/<label[^>]*><input[^>]*checked=""[^>]*>\s*<span>(.*?)<\/span>/g),
    ].map((match) => match[1]);

    expect(selectedBases).toEqual(["Central", "Norte"]);
    expect(html).toContain("Oeste");
  });
});
