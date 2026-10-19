import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  EfaMobileArrivalPanel,
  createSecureOperationId,
  getMobileCrewState,
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
        onBaseSelectionChange={vi.fn()}
        onArrivalsChange={vi.fn()}
      />,
    );

    expect(html).toContain("Central");
    expect(html.match(/aria-label="Registrar ingreso de /g)).toHaveLength(3);
    expect(html).toContain("Registrar ingreso de Enfermería en Central");
    expect(html).toContain("Registrar ingreso de Conducción en Central");
    expect(html).toContain("Registrar ingreso de Medicina en Central");
    expect(html).toContain("min-h-11");
  });

  it("keeps the three role cells side by side without repeating empty-state copy", () => {
    const html = renderToStaticMarkup(
      <EfaMobileArrivalPanel
        guardId="guard-a"
        bases={[base]}
        arrivals={[]}
        canWrite
        defaultExpandedBaseIds={[base.id]}
        onArrivalsChange={vi.fn()}
      />,
    );

    expect(mobileArrivalEditClasses.cells).toContain("grid-cols-3");
    expect(mobileArrivalEditClasses.cells).not.toContain("sm:grid-cols-");
    expect(html).not.toContain("Sin ingreso");
    expect(html.match(/\+ Ingreso/g)).toHaveLength(3);
    expect(html).not.toContain("min-h-11 w-full sm:w-auto");
  });

  describe("mobile card", () => {
    const mobile2 = { id: "mobile-2", name: "Móvil 2", isActive: true };
    const arrivedAt = "2026-10-07T10:05:00.000Z";
    const shortTime = new Date(arrivedAt).toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const arrivalFor = (
      role: MobileArrivalView["role"],
      overrides: Partial<MobileArrivalView> = {},
    ): MobileArrivalView => ({
      id: `arrival-${role}`,
      guardId: "guard-a",
      baseId: "mobile-2",
      baseNameSnapshot: "Móvil 2",
      role,
      arrivedAt,
      deletedAt: null,
      version: 1,
      canEdit: true,
      ...overrides,
    });
    const renderCard = (arrivals: MobileArrivalView[], canWrite = true, expanded = true) =>
      renderToStaticMarkup(
        <EfaMobileArrivalPanel
          guardId="guard-a"
          bases={[mobile2]}
          arrivals={arrivals}
          canWrite={canWrite}
          {...(expanded ? { defaultExpandedBaseIds: [mobile2.id] } : {})}
          onArrivalsChange={vi.fn()}
        />,
      );
    const toggle = (html: string) =>
      /<button[^>]*aria-expanded="(?:true|false)"[^>]*>[\s\S]*?<\/button>/.exec(card(html))?.[0] ??
      "";
    const card = (html: string) =>
      /<article[^>]*aria-label="Móvil Móvil 2"[\s\S]*?<\/article>/.exec(html)?.[0] ?? "";
    const cells = (html: string) =>
      [
        ...card(html).matchAll(
          /<(div|button)[^>]*data-role="(nurse|driver|doctor)"[\s\S]*?<\/\1>/g,
        ),
      ].map(([cell, , role = ""]) => ({ cell, role }));

    it("heads the card with the mobile name in display type and a text state badge", () => {
      const html = card(renderCard([]));

      expect(html).toMatch(
        /<span[^>]*class="[^"]*\bfont-display\b[^"]*\btext-sm\b[^"]*\bfont-semibold\b[^"]*"[^>]*>Móvil 2<\/span>/,
      );
      expect(html).toMatch(
        /<span[^>]*class="[^"]*\brounded-full\b[^"]*"[^>]*>Sin tripulación<\/span>/,
      );
      expect(html.indexOf("Móvil 2</span>")).toBeLessThan(html.indexOf("Sin tripulación"));
    });

    it("collapses the card by default to one summary row without cells or hygiene", () => {
      const html = renderToStaticMarkup(
        <EfaMobileArrivalPanel
          guardId="guard-a"
          bases={[mobile2]}
          arrivals={[arrivalFor("nurse")]}
          hygienePeriods={[]}
          onHygieneChange={vi.fn()}
          canWrite
          onArrivalsChange={vi.fn()}
        />,
      );
      const summary = toggle(html);

      expect(card(html)).toBeTruthy();
      expect(summary).toContain('aria-expanded="false"');
      expect(summary).toContain("Móvil 2");
      expect(summary).toContain("Falta Conducción");
      expect(summary).toMatch(/<svg[^>]*lucide-syringe/);
      expect(summary).toMatch(/<svg[^>]*data-icon="steering-wheel"/);
      expect(summary).toMatch(/<svg[^>]*lucide-stethoscope/);
      expect(summary).toMatch(/<svg[^>]*lucide-chevron-down/);
      expect(summary).toMatch(
        new RegExp(
          `<time[^>]*class="[^"]*\\btext-xs\\b[^"]*\\btabular-nums\\b[^"]*"[^>]*>${shortTime}</time>`,
        ),
      );
      expect(summary.match(/>—</g)).toHaveLength(2);
      // The body is not rendered while collapsed: no role cells, no actions, no hygiene.
      expect(card(html)).not.toContain("data-role=");
      expect(card(html)).not.toContain("+ Ingreso");
      expect(card(html)).not.toContain("Higiene y reposición");
      expect(html).not.toContain('aria-label="Registrar ingreso de ');
    });

    it("expands the card to show the cells it controls", () => {
      const html = renderCard([]);
      const summary = toggle(html);
      const controls = /aria-controls="([^"]+)"/.exec(summary)?.[1];

      expect(summary).toContain('aria-expanded="true"');
      expect(card(html)).toContain(`id="${controls}"`);
      expect(cells(html)).toHaveLength(3);
    });

    it("uses the same collapsed card for read-only users", () => {
      const html = renderCard([arrivalFor("driver")], false, false);
      const summary = toggle(html);

      expect(summary).toContain('aria-expanded="false"');
      expect(summary).toContain(`>${shortTime}</time>`);
      expect(card(html)).not.toContain("data-role=");
    });

    it("shows the operational state when nurse and driver are on board", () => {
      const html = card(renderCard([arrivalFor("nurse"), arrivalFor("driver")]));

      expect(html).toMatch(/<span[^>]*class="[^"]*var\(--success\)[^"]*"[^>]*>Operativo<\/span>/);
    });

    it("lays out three role cells in role order, each with an icon and its full label", () => {
      const html = renderCard([]);
      const rendered = cells(html);

      expect(card(html)).toMatch(/class="[^"]*\bgrid\b[^"]*\bgrid-cols-3\b[^"]*\bgap-2\b/);
      expect(rendered.map(({ role }) => role)).toEqual(["nurse", "driver", "doctor"]);
      expect(rendered[0]?.cell).toContain("Enfermería");
      expect(rendered[0]?.cell).toMatch(/<svg[^>]*lucide-syringe[^>]*aria-hidden="true"/);
      expect(rendered[1]?.cell).toContain("Conducción");
      expect(rendered[1]?.cell).toMatch(/<svg[^>]*data-icon="steering-wheel"/);
      expect(rendered[1]?.cell).toMatch(/<svg[^>]*viewBox="0 0 24 24"[^>]*>/);
      expect(rendered[1]?.cell).toMatch(/<svg[^>]*aria-hidden="true"/);
      expect(rendered[2]?.cell).toContain("Medicina");
      expect(rendered[2]?.cell).toMatch(/<svg[^>]*lucide-stethoscope[^>]*aria-hidden="true"/);
    });

    it("registers each role from its empty cell with a named one-tap button", () => {
      const rendered = cells(renderCard([]));

      expect(rendered.map(({ cell }) => /aria-label="([^"]+)"/.exec(cell)?.[1])).toEqual([
        "Registrar ingreso de Enfermería en Móvil 2",
        "Registrar ingreso de Conducción en Móvil 2",
        "Registrar ingreso de Medicina en Móvil 2",
      ]);
      for (const { cell } of rendered) {
        expect(cell).toMatch(/^<button[^>]*type="button"/);
        expect(cell).toContain("min-h-11");
        expect(cell).toContain("+ Ingreso");
      }
    });

    it("marks the Medicina cell as optional with a dashed border", () => {
      const [nurse, driver, doctor] = cells(renderCard([]));

      expect(doctor?.cell).toMatch(/^<button[^>]*class="[^"]*\bborder-dashed\b/);
      expect(doctor?.cell).toContain("opcional");
      expect(nurse?.cell).not.toContain("border-dashed");
      expect(nurse?.cell).not.toContain("opcional");
      expect(driver?.cell).not.toContain("border-dashed");
    });

    it("turns editable filled cells into collapsed option toggles without permanent actions", () => {
      const html = renderCard([arrivalFor("nurse")]);
      const [nurse] = cells(html);

      expect(nurse?.cell).toMatch(/^<button[^>]*type="button"/);
      expect(nurse?.cell).toContain('aria-expanded="false"');
      expect(nurse?.cell).toContain(`aria-label="Enfermería, ingreso ${shortTime}. Opciones"`);
      expect(nurse?.cell).toMatch(/<time[^>]*class="[^"]*\bfont-display\b[^"]*\btext-lg\b/);
      expect(nurse?.cell).toContain(`>${shortTime}</time>`);
      expect(html).not.toContain("Editar");
      expect(html).not.toContain("Eliminar");
    });

    it("keeps filled cells static when the server does not allow changes", () => {
      const [nurse] = cells(renderCard([arrivalFor("nurse", { canEdit: false })]));

      expect(nurse?.cell).toMatch(/^<div/);
      expect(nurse?.cell).not.toContain("aria-expanded");
      expect(nurse?.cell).toContain(`>${shortTime}</time>`);
    });

    it("shows read-only users static cells with the time or no arrival", () => {
      const html = renderCard([arrivalFor("driver")], false);
      const [nurse, driver, doctor] = cells(html);

      // Only the card's disclosure toggle is a button.
      expect(card(html).match(/<button/g)).toHaveLength(1);
      expect(nurse?.cell).toContain("Sin ingreso");
      expect(driver?.cell).toContain(`>${shortTime}</time>`);
      expect(doctor?.cell).toContain("Sin ingreso");
    });

    it("leaves the mobiles region to the guard panel and keeps its own empty message", () => {
      const html = renderToStaticMarkup(
        <EfaMobileArrivalPanel
          guardId="guard-a"
          bases={[]}
          availableBases={[]}
          arrivals={[]}
          canWrite
          onArrivalsChange={vi.fn()}
        />,
      );

      expect(html).not.toContain('aria-label="Móviles"');
      expect(html).not.toContain("<section");
      expect(html).toContain("No hay móviles disponibles para esta guardia.");
    });
  });

  describe("getMobileCrewState", () => {
    const arrival = (role: MobileArrivalView["role"], overrides: Partial<MobileArrivalView> = {}) =>
      ({
        id: `arrival-${role}`,
        guardId: "guard-a",
        baseId: "base-a",
        baseNameSnapshot: "Central",
        role,
        arrivedAt: "2026-10-14T10:00:00.000Z",
        deletedAt: null,
        version: 1,
        canEdit: true,
        ...overrides,
      }) satisfies MobileArrivalView;
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
    const state = (arrivals: MobileArrivalView[], hygienePeriods: MobileHygieneView[] = []) =>
      getMobileCrewState({ guardId: "guard-a", baseId: "base-a", arrivals, hygienePeriods });

    it("has no crew without nurse and driver, even with a doctor alone", () => {
      expect(state([])).toEqual({ tone: "empty", label: "Sin tripulación" });
      expect(state([arrival("doctor")])).toEqual({ tone: "empty", label: "Sin tripulación" });
    });

    it("names the missing required role", () => {
      expect(state([arrival("nurse")])).toEqual({ tone: "partial", label: "Falta Conducción" });
      expect(state([arrival("driver")])).toEqual({ tone: "partial", label: "Falta Enfermería" });
      expect(state([arrival("doctor"), arrival("nurse")])).toEqual({
        tone: "partial",
        label: "Falta Conducción",
      });
    });

    it("is operational with nurse and driver and adds the doctor when present", () => {
      expect(state([arrival("nurse"), arrival("driver")])).toEqual({
        tone: "operational",
        label: "Operativo",
      });
      expect(state([arrival("nurse"), arrival("driver"), arrival("doctor")])).toEqual({
        tone: "operational",
        label: "Operativo · con médico",
      });
    });

    it("ignores deleted arrivals and records of other mobiles or guards", () => {
      expect(
        state([
          arrival("nurse", { deletedAt: "2026-10-14T11:00:00.000Z" }),
          arrival("driver", { baseId: "base-b" }),
          arrival("driver", { guardId: "guard-b" }),
        ]),
      ).toEqual({ tone: "empty", label: "Sin tripulación" });
    });

    it("reports an open hygiene period over the crew state", () => {
      expect(state([arrival("nurse"), arrival("driver")], [period])).toEqual({
        tone: "hygiene",
        label: "En higiene desde 11:00",
      });
    });

    it("ignores closed, not-informed, deleted and foreign hygiene periods", () => {
      expect(
        state(
          [arrival("nurse"), arrival("driver")],
          [
            { ...period, availableAt: "2026-10-14T14:30:00.000Z" },
            { ...period, notInformed: true },
            { ...period, deletedAt: "2026-10-14T14:10:00.000Z" },
            { ...period, baseId: "base-b" },
          ],
        ),
      ).toEqual({ tone: "operational", label: "Operativo" });
    });
  });

  describe("mobile toggle chips", () => {
    const catalog = [
      { id: "mobile-10", name: "Móvil 10", isActive: true },
      { id: "mobile-2", name: "Móvil 2", isActive: true },
      { id: "mobile-1", name: "Móvil 1", isActive: true },
    ];
    // From the chip group to the first card (or the end): the group nests one pill per selection.
    const chipGroup = (html: string) => {
      const start = html.search(/<div[^>]*role="group"[^>]*aria-label="Móviles de la guardia"/);
      if (start < 0) return "";
      const end = html.indexOf("<article", start);
      return html.slice(start, end < 0 ? undefined : end);
    };
    const pill = (html: string, name: string) =>
      new RegExp(`<div[^>]*role="group"[^>]*aria-label="${name}"[^>]*>[\\s\\S]*?</div>`).exec(
        chipGroup(html),
      )?.[0] ?? "";
    const roleButtons = (html: string) =>
      [...html.matchAll(/<button[^>]*aria-label="(Registrar ingreso de [^"]+)"[^>]*>/g)].map(
        ([tag, label = ""]) => ({ tag, label }),
      );
    const arrival = (
      role: MobileArrivalView["role"],
      overrides: Partial<MobileArrivalView> = {},
    ): MobileArrivalView => ({
      id: `arrival-${role}`,
      guardId: "guard-a",
      baseId: "mobile-2",
      baseNameSnapshot: "Móvil 2",
      role,
      arrivedAt: "2026-10-07T11:10:00.000Z",
      deletedAt: null,
      version: 1,
      canEdit: true,
      ...overrides,
    });
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

      expect(pill(renderChips(), "Móvil 2")).toMatch(/^<div[^>]*class="[^"]*\bbg-primary\b/);
      expect(icon(selected?.content, "check")).toContain('aria-hidden="true"');
      expect(unselected?.tag).toContain("border-dashed");
      expect(icon(unselected?.content, "plus")).toContain('aria-hidden="true"');
    });

    it("renders the role rows only for selected mobiles, headed by the mobile name", () => {
      const html = renderChips();

      expect(html).toMatch(/<article[^>]*aria-label="Móvil Móvil 2"/);
      expect(html).not.toContain('aria-label="Móvil Móvil 1"');
      expect(html).not.toContain('aria-label="Móvil Móvil 10"');
      expect(html).toMatch(/<article[^>]*aria-label="Móvil Móvil 2"[^>]*><h4[^>]*><button/);
      expect(html.match(/aria-label="Registrar ingreso de /g)).toHaveLength(3);
      expect(html).toMatch(/<button[^>]*aria-label="Registrar ingreso de Enfermería en Móvil 2"/);
      expect(html.indexOf("Móviles de la guardia")).toBeLessThan(html.indexOf("<article"));
    });

    it("grows a selected chip into a labelled group with the toggle and three role buttons", () => {
      const group = pill(renderChips(), "Móvil 2");
      const buttons = [...group.matchAll(/<button[^>]*>/g)].map(([tag]) => tag);

      expect(group).toBeTruthy();
      expect(group).toMatch(/^<div[^>]*class="[^"]*\brounded-full\b/);
      expect(buttons).toHaveLength(4);
      expect(buttons[0]).toContain('aria-pressed="true"');
      expect(roleButtons(group).map(({ label }) => label)).toEqual([
        "Registrar ingreso de Enfermería en Móvil 2",
        "Registrar ingreso de Conducción en Móvil 2",
        "Registrar ingreso de Medicina en Móvil 2",
      ]);
      for (const { tag } of roleButtons(group)) {
        expect(tag).toContain('type="button"');
        expect(tag).toMatch(/class="[^"]*\bsize-8\b/);
        expect(tag).not.toContain("aria-pressed");
      }
      // Role icons in role order, never a button inside a button.
      const icons = [
        ...group.matchAll(/lucide-syringe|data-icon="steering-wheel"|lucide-stethoscope/g),
      ];
      expect(icons.map(([match]) => match)).toEqual([
        "lucide-syringe",
        'data-icon="steering-wheel"',
        "lucide-stethoscope",
      ]);
      expect(group).not.toMatch(/<button(?:(?!<\/button>)[\s\S])*<button/);
    });

    it("paints a registered role and stops offering it as a button", () => {
      const html = renderChips({ arrivals: [arrival("nurse")] });
      const group = pill(html, "Móvil 2");
      const time = new Date("2026-10-07T11:10:00.000Z").toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      expect(roleButtons(group).map(({ label }) => label)).toEqual([
        "Registrar ingreso de Conducción en Móvil 2",
        "Registrar ingreso de Medicina en Móvil 2",
      ]);
      expect(group).toMatch(
        new RegExp(
          `<span[^>]*role="img"[^>]*aria-label="Enfermería ingresó a las ${time}"[^>]*class="[^"]*bg-\\[var\\(--brand-orange\\)\\]`,
        ),
      );
      expect(html.match(/aria-label="Registrar ingreso de /g)).toHaveLength(2);
    });

    it("blocks the role buttons while the mobile's membership is pending", () => {
      const group = pill(renderChips({ membershipPendingBaseIds: ["mobile-2"] }), "Móvil 2");

      expect(roleButtons(group)).toHaveLength(3);
      expect(roleButtons(group).every(({ tag }) => tag.includes('disabled=""'))).toBe(true);
    });

    it("counts one role button per empty role on each selected mobile", () => {
      const html = renderChips({
        bases: catalog.filter((mobile) => mobile.id !== "mobile-10"),
        requestedBaseIds: ["mobile-1", "mobile-2"],
        arrivals: [arrival("driver"), arrival("doctor")],
      });

      expect(html.match(/aria-label="Registrar ingreso de /g)).toHaveLength(4);
      expect(roleButtons(pill(html, "Móvil 1"))).toHaveLength(3);
      expect(roleButtons(pill(html, "Móvil 2"))).toHaveLength(1);
    });

    it("keeps unselected chips as single buttons without role buttons", () => {
      const html = renderChips();
      const group = chipGroup(html);

      expect(group).not.toContain('aria-label="Móvil 1"');
      expect(group).not.toContain('aria-label="Móvil 10"');
      expect(group).not.toContain("Registrar ingreso de Enfermería en Móvil 1");
      expect(group).not.toContain("Registrar ingreso de Enfermería en Móvil 10");
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
      expect(html).not.toContain('aria-label="Registrar ingreso de ');
      expect(html).not.toContain('role="img"');
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

  it("keeps the role cells, the actions row and the datetime control shrinkable", () => {
    expect(mobileArrivalEditClasses.cells).toContain("min-w-0");
    expect(mobileArrivalEditClasses.cell).toContain("min-w-0");
    expect(mobileArrivalEditClasses.actions).toContain("min-w-0");
    expect(mobileArrivalEditClasses.form).toContain("grid-cols-1");
    expect(mobileArrivalEditClasses.form).toContain("min-w-0");
    expect(mobileArrivalEditClasses.label).toContain("min-w-0");
    expect(mobileArrivalEditClasses.input).toContain("w-full min-w-0 max-w-full");
    expect(mobileArrivalEditClasses.input).toContain("min-h-11");
  });

  it("shows all selected role controls in the chips without opening a card", () => {
    const html = renderToStaticMarkup(
      <EfaMobileArrivalPanel
        guardId="guard-a"
        bases={[base, { id: "base-b", name: "Norte", isActive: true }]}
        arrivals={[]}
        canWrite
        onBaseSelectionChange={vi.fn()}
        onArrivalsChange={vi.fn()}
      />,
    );

    expect(html).toContain("Enfermería");
    expect(html.match(/aria-label="Registrar ingreso de /g)).toHaveLength(6);
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(2);
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
        defaultExpandedBaseIds={[base.id]}
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
          defaultExpandedBaseIds={[base.id, "base-b"]}
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
          defaultExpandedBaseIds={[base.id]}
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
          defaultExpandedBaseIds={[base.id]}
          onArrivalsChange={vi.fn()}
        />,
      );
      expect(html).not.toContain("Higiene y reposición");
    });

    it("shows a period left open at close as not informed and read-only once expanded", () => {
      const html = renderToStaticMarkup(
        <EfaMobileArrivalPanel
          guardId="guard-a"
          bases={[base]}
          arrivals={[]}
          hygienePeriods={[{ ...hygiene, notInformed: true, canEdit: false }]}
          onHygieneChange={vi.fn()}
          canWrite={false}
          defaultExpandedBaseIds={[base.id]}
          onArrivalsChange={vi.fn()}
        />,
      );
      const central = article(html, "Central");

      expect(central).toContain("No informado");
      expect(central).not.toContain("Solicitó higiene y reposición");
      expect(central).not.toContain("Disponible (handy)");
    });

    it("hides the block while the card is collapsed", () => {
      const html = renderToStaticMarkup(
        <EfaMobileArrivalPanel
          guardId="guard-a"
          bases={[base]}
          arrivals={[]}
          hygienePeriods={[hygiene]}
          onHygieneChange={vi.fn()}
          canWrite
          onArrivalsChange={vi.fn()}
        />,
      );
      const central = article(html, "Central");

      expect(central).toContain("En higiene desde 11:00");
      expect(central).not.toContain("Higiene y reposición");
      expect(central).not.toContain("Solicitó higiene y reposición");
    });
  });
});
