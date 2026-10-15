import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  EfaMobileHygienePanel,
  clearConfirmedHygieneOperation,
  getStableHygieneOperation,
  mobileHygieneClasses,
  parseLocalHygieneTimestamp,
  toLocalHygieneInputValue,
  type MobileHygieneView,
} from "./EfaMobileHygienePanel";

vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => vi.fn(async () => []),
}));
vi.mock("@/lib/efa-mobile-hygiene.functions", () => ({
  deleteEfaMobileHygiene: vi.fn(),
  markEfaMobileHygieneAvailable: vi.fn(),
  requestEfaMobileHygiene: vi.fn(),
  updateEfaMobileHygiene: vi.fn(),
}));

const period = (overrides: Partial<MobileHygieneView> = {}): MobileHygieneView => ({
  id: "period-a",
  guardId: "guard-a",
  baseId: "base-a",
  baseNameSnapshot: "Central",
  requestedAt: "2026-10-14T14:00:00.000Z",
  availableAt: null,
  notInformed: false,
  note: null,
  deletedAt: null,
  version: 1,
  canEdit: true,
  ...overrides,
});

const render = (periods: MobileHygieneView[], canWrite = true) =>
  renderToStaticMarkup(
    <EfaMobileHygienePanel
      guardId="guard-a"
      baseId="base-a"
      baseName="Central"
      periods={periods}
      canWrite={canWrite}
      onPeriodChange={vi.fn()}
    />,
  );

const buttonTag = (html: string, label: string) =>
  new RegExp(`<button[^>]*>${label}</button>`).exec(html)?.[0] ?? "";

describe("EfaMobileHygienePanel", () => {
  it("offers the two actions with large touch targets and a manual time that defaults to now", () => {
    const html = render([]);

    expect(html).toContain("Higiene y reposición");
    expect(html).toContain("Solicitó higiene y reposición");
    expect(html).toContain("Disponible (handy)");
    expect(html).toContain('type="datetime-local"');
    expect(html).toContain("vacío = ahora");
    expect(html.match(/min-h-11/g)!.length).toBeGreaterThanOrEqual(3);
    expect(html).toContain("Sin registros de higiene y reposición.");
    expect(mobileHygieneClasses.input).toContain("min-h-11");
    expect(mobileHygieneClasses.input).toContain("w-full min-w-0 max-w-full");
  });

  it("allows a request only without an open period and the available mark only with one", () => {
    const withoutOpen = render([]);
    expect(buttonTag(withoutOpen, "Solicitó higiene y reposición")).not.toContain('disabled=""');
    expect(buttonTag(withoutOpen, "Disponible \\(handy\\)")).toContain('disabled=""');

    const withOpen = render([period()]);
    expect(buttonTag(withOpen, "Solicitó higiene y reposición")).toContain('disabled=""');
    expect(buttonTag(withOpen, "Disponible \\(handy\\)")).not.toContain('disabled=""');
    expect(withOpen).toContain("En higiene y reposición");
    expect(withOpen).toContain("Editar");
    expect(withOpen).toContain("Eliminar");
  });

  it("shows requested time, available time and duration for a closed period", () => {
    const html = render([period({ availableAt: "2026-10-14T14:45:00.000Z" })]);

    expect(html).toContain("Solicitó:");
    expect(html).toContain("14/10/2026 11:00");
    expect(html).toContain("Disponible:");
    expect(html).toContain("14/10/2026 11:45");
    expect(html).toContain("Duración: 45 min");
    expect(html).not.toContain("No informado");
    expect(buttonTag(html, "Solicitó higiene y reposición")).not.toContain('disabled=""');
    expect(buttonTag(html, "Disponible \\(handy\\)")).toContain('disabled=""');
  });

  it("marks a not-informed period with text and an icon, never by color alone", () => {
    const html = render([period({ notInformed: true, canEdit: false })], false);

    expect(html).toContain("No informado");
    expect(html).toContain("<svg");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("la guardia terminó con el período abierto");
    expect(html).not.toContain("Duración:");
  });

  it("keeps historical and administrator views read-only", () => {
    const html = render(
      [period({ canEdit: false, availableAt: "2026-10-14T14:30:00.000Z" })],
      false,
    );

    expect(html).toContain("Duración: 30 min");
    expect(html).not.toContain("Solicitó higiene y reposición");
    expect(html).not.toContain("Disponible (handy)");
    expect(html).not.toContain("datetime-local");
    expect(html).not.toContain("Editar");
    expect(html).not.toContain("Eliminar");
  });

  it("hides edit and delete when the server does not permit changes and ignores other mobiles and deleted rows", () => {
    const html = render([
      period({ canEdit: false }),
      period({ id: "other-base", baseId: "base-b", note: "Otro móvil" }),
      period({ id: "deleted", deletedAt: "2026-10-14T15:00:00.000Z", note: "Eliminado" }),
      period({ id: "other-guard", guardId: "guard-b", note: "Otra guardia" }),
    ]);

    expect(html).not.toContain("Editar");
    expect(html).not.toContain("Otro móvil");
    expect(html).not.toContain("Eliminado");
    expect(html).not.toContain("Otra guardia");
  });

  it("lists the newest period first and shows the note", () => {
    const html = render([
      period({
        id: "old",
        requestedAt: "2026-10-14T10:00:00.000Z",
        availableAt: "2026-10-14T10:20:00.000Z",
      }),
      period({ id: "new", requestedAt: "2026-10-14T14:00:00.000Z", note: "Falta de oxígeno" }),
    ]);

    expect(html.indexOf("14/10/2026 11:00")).toBeLessThan(html.indexOf("14/10/2026 07:00"));
    expect(html).toContain("Falta de oxígeno");
  });

  it("reuses the same operation identity for an unchanged retry payload", () => {
    let nextId = 0;
    const pending = new Map();
    const createId = () => `operation-${++nextId}`;
    const payload = { guardId: "guard-a", baseId: "base-a" };

    const first = getStableHygieneOperation(pending, "request", payload, createId);
    const retry = getStableHygieneOperation(pending, "request", payload, createId);
    const changed = getStableHygieneOperation(
      pending,
      "request",
      { ...payload, requestedAt: "2026-10-14T14:00:00.000Z" },
      createId,
    );

    expect(retry).toBe(first);
    expect(changed).not.toBe(first);
    clearConfirmedHygieneOperation(pending, "request", first);
    expect(pending.get("request")?.id).toBe(changed);
    clearConfirmedHygieneOperation(pending, "request", changed);
    expect(pending.size).toBe(0);
  });

  it("converts datetime-local values and rejects dates that would be normalized", () => {
    const iso = parseLocalHygieneTimestamp("2026-10-14T11:09");
    expect(iso).toBe(new Date(2026, 9, 14, 11, 9).toISOString());
    expect(toLocalHygieneInputValue(iso!)).toBe("2026-10-14T11:09");
    expect(parseLocalHygieneTimestamp("2026-02-31T09:30")).toBeNull();
    expect(parseLocalHygieneTimestamp("2026-10-14T25:00")).toBeNull();
    expect(parseLocalHygieneTimestamp("2026-10-14")).toBeNull();
    expect(parseLocalHygieneTimestamp("")).toBeNull();
  });
});
