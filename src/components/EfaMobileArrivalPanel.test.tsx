import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  EfaMobileArrivalPanel,
  createSecureOperationId,
  getMobileRemovalConfirmation,
  getStableArrivalOperation,
  mobileArrivalEditClasses,
  parseLocalArrivalTimestamp,
  setBusyArrivalOperation,
  type MobileArrivalView,
} from "./EfaMobileArrivalPanel";
import type { MobileHygieneView } from "./EfaMobileHygienePanel";

vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => vi.fn(async () => []),
}));
vi.mock("@/lib/efa-mobile-arrivals.functions", () => ({
  createEfaMobileArrival: vi.fn(),
  deleteEfaMobileArrival: vi.fn(),
  updateEfaMobileArrival: vi.fn(),
}));

vi.mock("@/lib/efa-mobile-hygiene.functions", () => ({
  deleteEfaMobileHygiene: vi.fn(),
  listEfaMobileHygieneForGuard: vi.fn(),
  markEfaMobileHygieneAvailable: vi.fn(),
  requestEfaMobileHygiene: vi.fn(),
  updateEfaMobileHygiene: vi.fn(),
}));

const base = { id: "base-a", name: "Central", isActive: true };

describe("EfaMobileArrivalPanel", () => {
  it("offers one-tap registration for each role on a selected mobile", () => {
    const html = renderToStaticMarkup(
      <EfaMobileArrivalPanel
        guardId="guard-a"
        bases={[base]}
        arrivals={[]}
        canWrite
        onArrivalsChange={vi.fn()}
      />,
    );

    expect(html).toContain("Central");
    expect(html.match(/Registrar ingreso/g)).toHaveLength(3);
    expect(html).toContain("Enfermería");
    expect(html).toContain("Conducción");
    expect(html).toContain("Medicina");
    expect(html).toContain("min-h-11");
    expect(html).toContain("px-2 sm:px-4");
  });

  it("keeps mobile capture actions beside the role without repeating empty-state copy", () => {
    const html = renderToStaticMarkup(
      <EfaMobileArrivalPanel
        guardId="guard-a"
        bases={[base]}
        arrivals={[]}
        canWrite
        onArrivalsChange={vi.fn()}
      />,
    );

    expect(mobileArrivalEditClasses.row).toContain("grid-cols-[minmax(0,1fr)_auto]");
    expect(mobileArrivalEditClasses.row).not.toContain("sm:grid-cols-");
    expect(html).not.toContain("Sin ingreso registrado");
    expect(html).toContain("Registrar ingreso");
    expect(html).not.toContain("min-h-11 w-full sm:w-auto");
  });

  describe("mobile toggle chips", () => {
    const catalog = [
      { id: "mobile-10", name: "Móvil 10", isActive: true },
      { id: "mobile-2", name: "Móvil 2", isActive: true },
      { id: "mobile-1", name: "Móvil 1", isActive: true },
    ];
    const chipGroup = (html: string) =>
      /<div[^>]*role="group"[^>]*aria-label="Móviles de la guardia"[^>]*>[\s\S]*?<\/div>/.exec(
        html,
      )?.[0] ?? "";
    const chips = (html: string) =>
      [
        ...chipGroup(html).matchAll(
          /<button[^>]*aria-pressed="(true|false)"[^>]*>([\s\S]*?)<\/button>/g,
        ),
      ].map(([tag, pressed = "", content = ""]) => ({ tag, pressed, content }));
    const renderChips = (props: Partial<Parameters<typeof EfaMobileArrivalPanel>[0]> = {}) =>
      renderToStaticMarkup(
        <EfaMobileArrivalPanel
          guardId="guard-a"
          bases={catalog.filter((mobile) => mobile.id === "mobile-2")}
          availableBases={catalog}
          requestedBaseIds={["mobile-2"]}
          arrivals={[]}
          canWrite
          onBaseSelectionChange={vi.fn()}
          onArrivalsChange={vi.fn()}
          {...props}
        />,
      );

    it("lists the catalog as pressed or unpressed chips in catalog order", () => {
      const html = renderChips();
      const rendered = chips(html);

      expect(
        rendered.map(({ content, pressed }) => [content.replace(/<[^>]+>/g, ""), pressed]),
      ).toEqual([
        ["Móvil 1", "false"],
        ["Móvil 2", "true"],
        ["Móvil 10", "false"],
      ]);
      expect(rendered.every(({ tag }) => tag.includes('type="button"'))).toBe(true);
      expect(rendered.every(({ tag }) => tag.includes("min-h-11"))).toBe(true);
      expect(html).not.toContain('type="checkbox"');
    });

    it("marks state with an icon, not only with color", () => {
      const [unselected, selected] = chips(renderChips());

      const icon = (content = "", name: string) =>
        new RegExp(`<svg[^>]*\\blucide-${name}\\b[^>]*>`).exec(content)?.[0] ?? "";

      expect(selected?.tag).toContain("bg-primary");
      expect(icon(selected?.content, "check")).toContain('aria-hidden="true"');
      expect(unselected?.tag).toContain("border-dashed");
      expect(icon(unselected?.content, "plus")).toContain('aria-hidden="true"');
    });

    it("renders the role rows only for selected mobiles, headed by the mobile name", () => {
      const html = renderChips();

      expect(html).toMatch(/<article[^>]*aria-label="Móvil Móvil 2"/);
      expect(html).not.toContain('aria-label="Móvil Móvil 1"');
      expect(html).not.toContain('aria-label="Móvil Móvil 10"');
      expect(html).toMatch(/<article[^>]*aria-label="Móvil Móvil 2"[^>]*><h4[^>]*>Móvil 2<\/h4>/);
      expect(html.match(/Registrar ingreso/g)).toHaveLength(3);
      expect(html).toMatch(/Registrar ingreso<\/button>/);
      expect(html.indexOf("Móviles de la guardia")).toBeLessThan(html.indexOf("<article"));
    });

    it("keeps a pending chip busy and disabled and names the mobile in membership errors", () => {
      const html = renderChips({
        membershipPendingBaseIds: ["mobile-2"],
        membershipErrors: { "mobile-2": "No se pudo confirmar; sincroniza." },
      });
      const pending = chips(html)[1];

      expect(pending?.tag).toContain('aria-busy="true"');
      expect(pending?.tag).toContain('disabled=""');
      expect(pending?.content).toContain("Guardando…");
      expect(html).toMatch(/role="alert"[^>]*>Móvil 2: No se pudo confirmar; sincroniza\.</);
      expect(html.indexOf("Móviles de la guardia")).toBeLessThan(
        html.indexOf("No se pudo confirmar; sincroniza."),
      );
    });

    it("disables an unavailable mobile that is not in the guard", () => {
      const html = renderChips({
        availableBases: [...catalog, { id: "mobile-3", name: "Móvil 3", isActive: false }],
      });
      const unavailable = chips(html).find(({ content }) => content.includes("Móvil 3"));

      expect(unavailable?.pressed).toBe("false");
      expect(unavailable?.tag).toContain('disabled=""');
      expect(unavailable?.content).toContain("No disponible");
      expect(chips(html)[0]?.tag).not.toContain('disabled=""');
    });

    it("blocks every chip while the selection cannot change", () => {
      const blocked = chips(renderChips({ baseSelectionBlocked: true }));

      expect(blocked).toHaveLength(3);
      expect(blocked.every(({ tag }) => tag.includes('disabled=""'))).toBe(true);
    });

    it("says choosing mobiles is optional while none is selected", () => {
      const html = renderChips({ bases: [], requestedBaseIds: [] });

      expect(html).toContain("Elegir móviles es opcional.");
      expect(html).not.toContain("<article");
      expect(renderChips()).not.toContain("Elegir móviles es opcional.");
    });

    it("shows read-only users the guard's mobiles as static tags", () => {
      const html = renderChips({ canWrite: false });

      expect(html).not.toContain("aria-pressed");
      expect(html).not.toContain("Elegir móviles es opcional.");
      expect(html).toMatch(
        /<ul[^>]*aria-label="Móviles de la guardia"[^>]*><li[^>]*>Móvil 2<\/li><\/ul>/,
      );
      expect(html).not.toContain("Móvil 10");
      expect(html).not.toContain("Móvil 1<");
    });
  });

  describe("removal confirmation", () => {
    const central = { id: "base-a", name: "Central", isActive: true };
    const arrival: MobileArrivalView = {
      id: "arrival-a",
      guardId: "guard-a",
      baseId: "base-a",
      baseNameSnapshot: "Central",
      role: "nurse",
      arrivedAt: "2026-10-07T12:00:00.000Z",
      deletedAt: null,
      version: 1,
      canEdit: true,
    };
    const period: MobileHygieneView = {
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
    };

    it("removes a mobile without records immediately", () => {
      expect(
        getMobileRemovalConfirmation({
          guardId: "guard-a",
          base: central,
          arrivals: [
            { ...arrival, deletedAt: "2026-10-07T12:30:00.000Z" },
            { ...arrival, id: "other-guard", guardId: "guard-b" },
            { ...arrival, id: "other-base", baseId: "base-b" },
          ],
          hygienePeriods: [{ ...period, deletedAt: "2026-10-14T15:00:00.000Z" }],
        }),
      ).toBeNull();
    });

    it("explains that arrivals become read-only history", () => {
      const description = getMobileRemovalConfirmation({
        guardId: "guard-a",
        base: central,
        arrivals: [arrival],
      });

      expect(description).toContain("Móvil Central tiene ingresos registrados en esta guardia.");
      expect(description).toContain("Ingresos históricos");
      expect(description).toContain("solo lectura");
      expect(description).toContain("Nada se borra");
    });

    it("asks before removing a mobile with only hygiene periods", () => {
      const description = getMobileRemovalConfirmation({
        guardId: "guard-a",
        base: central,
        arrivals: [],
        hygienePeriods: [period],
      });

      expect(description).toContain("higiene y reposición");
      expect(description).not.toContain("Ingresos históricos");
    });

    it("warns that an unavailable mobile cannot be added back", () => {
      const description = getMobileRemovalConfirmation({
        guardId: "guard-a",
        base: { ...central, isActive: false },
        arrivals: [arrival],
        hygienePeriods: [period],
      });

      expect(description).toContain("ingresos y períodos de higiene");
      expect(description).toContain("no vas a poder volver a sumarlo");
    });
  });

  it("keeps the mobile edit grid and datetime control shrinkable", () => {
    expect(mobileArrivalEditClasses.row).toContain("min-w-0");
    expect(mobileArrivalEditClasses.editingRow).toContain("grid-cols-1");
    expect(mobileArrivalEditClasses.content).toContain("min-w-0");
    expect(mobileArrivalEditClasses.form).toContain("grid-cols-1");
    expect(mobileArrivalEditClasses.form).toContain("min-w-0");
    expect(mobileArrivalEditClasses.label).toContain("min-w-0");
    expect(mobileArrivalEditClasses.input).toContain("w-full min-w-0 max-w-full");
    expect(mobileArrivalEditClasses.input).toContain("min-h-11");
  });

  it("shows all selected role controls without a second disclosure click", () => {
    const html = renderToStaticMarkup(
      <EfaMobileArrivalPanel
        guardId="guard-a"
        bases={[base, { id: "base-b", name: "Norte", isActive: true }]}
        arrivals={[]}
        canWrite
        onArrivalsChange={vi.fn()}
      />,
    );

    expect(html).toContain("Enfermería");
    expect(html.match(/Registrar ingreso/g)).toHaveLength(6);
    expect(html).not.toContain("<details");
  });

  it("shows saved time with edit and delete actions only when the server permits changes", () => {
    const arrival: MobileArrivalView = {
      id: "arrival-a",
      guardId: "guard-a",
      baseId: "base-a",
      baseNameSnapshot: "Central",
      role: "nurse",
      arrivedAt: "2026-10-07T12:00:00.000Z",
      deletedAt: null,
      version: 1,
      canEdit: false,
    };
    const html = renderToStaticMarkup(
      <EfaMobileArrivalPanel
        guardId="guard-a"
        bases={[]}
        arrivals={[arrival]}
        canWrite
        onArrivalsChange={vi.fn()}
      />,
    );

    expect(html).toContain("Ingresos históricos");
    expect(html).toContain("Central · Enfermería");
    expect(html).toContain("2026-10-07T12:00:00.000Z");
    expect(html).not.toContain("Editar");
    expect(html).not.toContain("Eliminar");
    expect(html).not.toContain("Registrar ingreso");
  });

  it("shows a short active-role time with the full date available to assistive technology", () => {
    const arrivedAt = "2026-10-07T12:08:00.000Z";
    const arrival: MobileArrivalView = {
      id: "arrival-a",
      guardId: "guard-a",
      baseId: base.id,
      baseNameSnapshot: base.name,
      role: "nurse",
      arrivedAt,
      deletedAt: null,
      version: 1,
      canEdit: false,
    };
    const html = renderToStaticMarkup(
      <EfaMobileArrivalPanel
        guardId="guard-a"
        bases={[base]}
        arrivals={[arrival]}
        canWrite
        onArrivalsChange={vi.fn()}
      />,
    );

    const date = new Date(arrivedAt);
    const shortTime = date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    const fullDate = date.toLocaleString("es-AR");
    expect(html).toContain(
      `dateTime="${arrivedAt}" aria-label="Ingreso registrado el ${fullDate}"`,
    );
    expect(html).toContain(`>${shortTime}</time>`);
  });

  it("reuses the same operation identity for an unchanged retry payload", () => {
    let nextId = 0;
    const pending = new Map();
    const createId = () => `operation-${++nextId}`;
    const payload = { guardId: "guard-a", baseId: "base-a", role: "nurse" };

    const first = getStableArrivalOperation(pending, "create:base-a:nurse", payload, createId);
    const retry = getStableArrivalOperation(pending, "create:base-a:nurse", payload, createId);
    const changed = getStableArrivalOperation(
      pending,
      "create:base-a:nurse",
      { ...payload, role: "doctor" },
      createId,
    );

    expect(retry).toBe(first);
    expect(changed).not.toBe(first);
  });

  it("uses secure random bytes when randomUUID is unavailable", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.fill(0);
      return bytes;
    });

    expect(createSecureOperationId({ getRandomValues } as unknown as Crypto)).toBe(
      "00000000-0000-4000-8000-000000000000",
    );
    expect(getRandomValues).toHaveBeenCalledOnce();
  });

  it("fails closed when secure randomness is unavailable", () => {
    expect(() => createSecureOperationId({} as Crypto)).toThrow(/secure random/i);
  });

  it("rejects invalid local datetimes instead of allowing date normalization", () => {
    expect(parseLocalArrivalTimestamp("2026-02-31T09:30")).toBeNull();
    expect(parseLocalArrivalTimestamp("not-a-date")).toBeNull();
  });

  it("keeps each row busy state independent while another operation completes", () => {
    let busy = new Set<string>();
    busy = setBusyArrivalOperation(busy, "row-a", true);
    busy = setBusyArrivalOperation(busy, "row-b", true);
    busy = setBusyArrivalOperation(busy, "row-a", false);

    expect([...busy]).toEqual(["row-b"]);
  });

  describe("hygiene and restocking block", () => {
    const hygiene: MobileHygieneView = {
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
    };
    const article = (html: string, name: string) =>
      new RegExp(`<article[^>]*aria-label="Móvil ${name}"[\\s\\S]*?</article>`).exec(html)?.[0] ??
      "";

    it("shows the block inside each selected mobile card after the role rows", () => {
      const html = renderToStaticMarkup(
        <EfaMobileArrivalPanel
          guardId="guard-a"
          bases={[base, { id: "base-b", name: "Norte", isActive: true }]}
          arrivals={[]}
          hygienePeriods={[hygiene]}
          onHygieneChange={vi.fn()}
          canWrite
          onArrivalsChange={vi.fn()}
        />,
      );

      const central = article(html, "Central");
      expect(central).toContain("Solicitó higiene y reposición");
      expect(central).toContain("Disponible (handy)");
      expect(central).toContain("En higiene y reposición");
      expect(central.indexOf("Medicina")).toBeLessThan(central.indexOf("Higiene y reposición"));
      const north = article(html, "Norte");
      expect(north).toContain("Solicitó higiene y reposición");
      expect(north).not.toContain("En higiene y reposición");
      expect(html.match(/Solicitó higiene y reposición/g)).toHaveLength(2);
    });

    it("keeps the block out of unselected mobiles and read-only for non-writers", () => {
      const html = renderToStaticMarkup(
        <EfaMobileArrivalPanel
          guardId="guard-a"
          bases={[base]}
          availableBases={[base, { id: "base-b", name: "Norte", isActive: true }]}
          requestedBaseIds={[base.id]}
          arrivals={[]}
          hygienePeriods={[{ ...hygiene, availableAt: "2026-10-14T14:30:00.000Z", canEdit: false }]}
          onHygieneChange={vi.fn()}
          canWrite={false}
          onArrivalsChange={vi.fn()}
        />,
      );

      expect(article(html, "Norte")).not.toContain("Higiene y reposición");
      const central = article(html, "Central");
      expect(central).toContain("Duración: 30 min");
      expect(central).not.toContain("Solicitó higiene y reposición");
    });

    it("does not render the block when the caller does not provide hygiene data", () => {
      const html = renderToStaticMarkup(
        <EfaMobileArrivalPanel
          guardId="guard-a"
          bases={[base]}
          arrivals={[]}
          canWrite
          onArrivalsChange={vi.fn()}
        />,
      );
      expect(html).not.toContain("Higiene y reposición");
    });
  });
});
