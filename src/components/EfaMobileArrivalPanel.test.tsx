import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  EfaMobileArrivalPanel,
  createSecureOperationId,
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

  it("places sorted catalog checkboxes and selected mobile roles in one pending-aware list", () => {
    const html = renderToStaticMarkup(
      <EfaMobileArrivalPanel
        guardId="guard-a"
        bases={[{ id: "mobile-2", name: "Móvil 2", isActive: true }]}
        availableBases={[
          { id: "mobile-10", name: "Móvil 10", isActive: true },
          { id: "mobile-2", name: "Móvil 2", isActive: true },
          { id: "mobile-1", name: "Móvil 1", isActive: true },
        ]}
        requestedBaseIds={["mobile-2"]}
        membershipPendingBaseIds={["mobile-2"]}
        membershipErrors={{ "mobile-2": "No se pudo confirmar; sincroniza." }}
        arrivals={[]}
        canWrite
        onBaseSelectionChange={vi.fn()}
        onArrivalsChange={vi.fn()}
      />,
    );

    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(3);
    expect(html.indexOf("Móvil 1")).toBeLessThan(html.indexOf("Móvil 2"));
    expect(html.indexOf("Móvil 2")).toBeLessThan(html.indexOf("Móvil 10"));
    expect(html).toContain("Guardando móvil…");
    expect(html).toContain("No se pudo confirmar; sincroniza.");
    expect(html.match(/Registrar ingreso/g)).toHaveLength(3);
    expect(html).toMatch(/Registrar ingreso<\/button>/);
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
