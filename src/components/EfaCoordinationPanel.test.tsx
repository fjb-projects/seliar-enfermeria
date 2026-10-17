import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type {
  EfaOversightEpisodeView,
  EfaOversightGuardView,
} from "@/lib/efa-guard-oversight.functions";
import { EfaCoordinationPanel } from "./EfaCoordinationPanel";
import {
  EfaCoordinationGuardDetail,
  EfaCoordinationServiceList,
} from "./EfaCoordinationGuardDetail";
import { EfaCoordinationGuardCard } from "./EfaCoordinationGuardCard";

const now = new Date("2026-10-09T15:00:00.000Z");

vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn(async () => []) }));
vi.mock("@/lib/efa-guards.functions", () => ({ correctEfaGuardEnd: vi.fn() }));
vi.mock("@/lib/efa-guard-oversight.functions", () => ({
  listEfaGuardOversight: vi.fn(),
  listEfaGuardServices: vi.fn(),
}));

const totals = (value: Partial<EfaOversightGuardView["totals"]> = {}) => ({
  episodes: { draft: 0, closed: 0, cancelled: 0 },
  dispatches: { total: 0, cancelled: 0 },
  mobileArrivals: 0,
  hygienePeriods: 0,
  ...value,
});

const guard = (
  id: string,
  ownerUserId: string,
  name: string,
  startedAt: string,
  endedAt: string | null,
  guardTotals = totals(),
): EfaOversightGuardView => ({
  id,
  ownerUserId,
  owner: { name, email: `${ownerUserId}@example.test` },
  startedAt: new Date(startedAt),
  endedAt: endedAt ? new Date(endedAt) : null,
  declaredAtCentral: true,
  version: 1,
  bases: [{ id: "base-a", name: "Móvil 3", isActive: true }],
  totals: guardTotals,
});

const guards = [
  guard(
    "g-open",
    "ana",
    "Ana Pérez",
    "2026-10-09T11:00:00.000Z",
    null,
    totals({
      episodes: { draft: 1, closed: 2, cancelled: 0 },
      dispatches: { total: 3, cancelled: 1 },
      mobileArrivals: 2,
      hygienePeriods: 1,
    }),
  ),
  guard("g-bruno", "bruno", "Bruno Díaz", "2026-10-08T11:00:00.000Z", "2026-10-08T19:30:00.000Z"),
  guard("g-ana-old", "ana", "Ana Pérez", "2026-10-07T11:00:00.000Z", "2026-10-07T19:00:00.000Z"),
];

function render(children: ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>,
  );
}

describe("EfaCoordinationPanel", () => {
  it("groups guards under collapsible owner headers with a summary", () => {
    const html = render(
      <EfaCoordinationPanel
        guards={guards}
        search={{}}
        onSearchChange={() => {}}
        onGuardsChanged={async () => {}}
        now={now}
      />,
    );

    expect(html).toContain('aria-label="Guardias de Ana Pérez"');
    expect(html).toMatch(
      /<th colSpan="9" scope="rowgroup"[^>]*><button type="button" aria-expanded="true"/,
    );
    expect(html).toContain("ana@example.test");
    expect(html).toContain("2 guardias · 1 en curso · 3 servicios");
    expect(html).toContain("1 guardia · 0 servicios");
    expect(html.indexOf("Guardias de Ana Pérez")).toBeLessThan(
      html.indexOf("Guardias de Bruno Díaz"),
    );
    expect(html).not.toContain(">Usuario</th>");
    expect(html).toContain("3 guardias");
  });

  it("shows one dense row per guard with status, span and numeric totals", () => {
    const html = render(
      <EfaCoordinationPanel
        guards={guards}
        search={{ group: 0 }}
        onSearchChange={() => {}}
        onGuardsChanged={async () => {}}
        now={now}
      />,
    );

    expect(html).toContain(">Usuario</th>");
    expect(html).toContain("Ana P.");
    expect(html).toContain(">AP</span>");
    expect(html).toContain("En curso · hace 4 h");
    expect(html).toContain("Finalizada");
    expect(html).toContain("09/10 08:00 → …");
    expect(html).toContain("08/10 08:00 → 16:30");
    expect(html).toContain("8 h 30 min");
    expect(html).toContain('title="Móvil 3"');
    expect(html).toContain('title="1 en borrador · 2 cerrados · 0 cancelados"');
    expect(html).toContain('title="1 cancelado"');
    expect(html).toContain('<span aria-hidden="true">—</span><span class="sr-only">0</span>');
    expect(html).not.toContain("Sin servicios");
    expect(html).not.toContain("border-l-");
    // Open guards come first, then the newest start.
    const rowOrder = ["09/10 08:00 → …", "08/10 08:00 → 16:30", "07/10 08:00 → 16:00"].map((span) =>
      html.indexOf(span),
    );
    expect(rowOrder).toEqual([...rowOrder].sort((left, right) => left - right));
    // Rows start collapsed; the detail and its services load only once expanded.
    expect(html).toMatch(/aria-expanded="false" aria-controls="guard-detail-g-open"/);
    expect(html).not.toContain('id="guard-detail-g-open"');
    expect(html).not.toContain("Cargando servicios");
  });

  it("renders compact phone cards with a 4-up metric row", () => {
    const html = render(
      <EfaCoordinationGuardCard guard={guards[0]!} now={now} onGuardChanged={async () => {}} />,
    );

    expect(html).toContain('aria-label="Guardia de Ana Pérez"');
    expect(html).toContain("grid-cols-4");
    expect(html).toMatch(/Servicios<\/dt><dd[^>]*><span[^>]*>3/);
    expect(html).toContain("09/10 08:00 → … · Móvil 3");
    expect(html).toMatch(/aria-expanded="false"[^>]*>Ver servicios y detalle/);
  });

  it("applies the URL filters and offers to clear them", () => {
    const html = render(
      <EfaCoordinationPanel
        guards={guards}
        search={{ user: "bruno", status: "closed" }}
        onSearchChange={() => {}}
        onGuardsChanged={async () => {}}
      />,
    );

    expect(html).toContain("Bruno Díaz");
    expect(html).not.toContain('aria-label="Guardias de Ana Pérez"');
    expect(html).toContain("1 guardia de 3");
    expect(html).toContain("Limpiar filtros (2)");
    expect(html).toContain('<option value="ana">Ana Pérez</option>');
  });

  it("renders the area with its sections, sidebar filters and mobile entry points", () => {
    const html = render(
      <EfaCoordinationPanel
        guards={guards}
        search={{ status: "open", from: "2026-10-01" }}
        onSearchChange={() => {}}
        onGuardsChanged={async () => {}}
        now={new Date("2026-10-09T15:00:00.000Z")}
      />,
    );

    expect(html).toContain('aria-label="Coordinación EFA"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("<span>Guardias</span>");
    expect(html).not.toContain("Estadísticas");
    expect(html).toMatch(/role="radio" aria-checked="true"[^>]*>En curso</);
    expect(html).toContain('id="sidebar-filter-from"');
    expect(html).toContain('value="2026-10-01"');
    expect(html).toMatch(/role="switch" aria-checked="true"/);
    expect(html).toContain("2 activos");
    expect(html).toContain('aria-label="Mostrar filtros (2)"');
    expect(html).toContain('aria-label="Secciones de Coordinación EFA"');
    expect(html).toContain("Filtros (2)");
    expect(html).toContain("1 guardia de 3");
  });

  it("shows the table from md once the main column has room and keeps phone cards below", () => {
    const html = render(
      <EfaCoordinationPanel
        guards={guards}
        search={{}}
        onSearchChange={() => {}}
        onGuardsChanged={async () => {}}
        now={now}
      />,
    );

    expect(html).toContain("@container/main");
    expect(html).toContain('class="hidden md:@[44rem]/main:block"');
    expect(html).toContain('class="md:@[44rem]/main:hidden"');
    expect(html).not.toContain("lg:block");
    // The sidebar is a full-height sticky column, pinned once the top nav scrolls away.
    expect(html).toContain("sticky top-0 h-svh");
  });

  it("summarizes today's guards above the list", () => {
    const html = render(
      <EfaCoordinationPanel
        guards={guards}
        search={{}}
        onSearchChange={() => {}}
        onGuardsChanged={async () => {}}
        now={new Date("2026-10-09T15:00:00.000Z")}
      />,
    );

    expect(html).toContain('aria-label="Resumen de hoy"');
    expect(html).toMatch(/En curso ahora<\/dt><dd[^>]*><span[^>]*><\/span>1<\/dd>/);
    expect(html).toMatch(/Guardias hoy<\/dt><dd[^>]*>1<\/dd>/);
    expect(html).toMatch(/Servicios hoy<\/dt><dd[^>]*>3<\/dd>/);
  });

  it("lists guards without owner groups when grouping is off", () => {
    const html = render(
      <EfaCoordinationPanel
        guards={guards}
        search={{ group: 0 }}
        onSearchChange={() => {}}
        onGuardsChanged={async () => {}}
      />,
    );

    expect(html).not.toContain('aria-label="Guardias de Ana Pérez"');
    expect(html).toMatch(/role="switch" aria-checked="false"/);
    expect(html).toContain("Limpiar filtros</button>");
  });

  it("explains an empty filtered list", () => {
    const html = render(
      <EfaCoordinationPanel
        guards={guards}
        search={{ from: "2026-11-01" }}
        onSearchChange={() => {}}
        onGuardsChanged={async () => {}}
      />,
    );

    expect(html).toContain("No hay guardias con estos filtros.");
  });
});

describe("coordination guard detail", () => {
  it("offers the end-time correction only on closed guards", () => {
    const openHtml = render(
      <EfaCoordinationGuardDetail guard={guards[0]!} onGuardChanged={async () => {}} />,
    );
    const closedHtml = render(
      <EfaCoordinationGuardDetail guard={guards[1]!} onGuardChanged={async () => {}} />,
    );

    expect(openHtml).not.toContain("Corregir hora de cierre");
    expect(openHtml).toContain("Cargando servicios…");
    expect(closedHtml).toContain("Bruno Díaz · bruno@example.test");
    expect(closedHtml).toContain("08/10/2026 16:30");
    expect(closedHtml).toContain("Corregir hora de cierre");
    expect(closedHtml).toContain('id="guard-end-g-bruno"');
    expect(closedHtml).toContain('type="datetime-local"');
    expect(closedHtml).toMatch(/<button[^>]*disabled=""[^>]*>Guardar corrección<\/button>/);
  });

  it("lists services with their state and dispatches", () => {
    const episodes: EfaOversightEpisodeView[] = [
      {
        id: "episode-1",
        originGuardId: "g-open",
        eventAt: new Date("2026-10-09T12:15:00.000Z"),
        motive: "Dolor torácico",
        address: "Calle 1 234",
        interventionNumber: "A-77",
        state: "closed",
        closedAt: new Date("2026-10-09T13:00:00.000Z"),
        cancelledAt: null,
        dispatches: [
          {
            id: "dispatch-1",
            episodeId: "episode-1",
            baseId: "base-a",
            baseName: "Móvil 3",
            priority: "red",
            result: "transported",
            state: "finalized",
            t0At: new Date("2026-10-09T12:16:00.000Z"),
            t1At: new Date("2026-10-09T12:18:00.000Z"),
            t2At: null,
            t3At: null,
            t4At: null,
            finalizedAt: new Date("2026-10-09T13:00:00.000Z"),
            cancelledAt: null,
          },
        ],
      },
      {
        id: "episode-2",
        originGuardId: "g-open",
        eventAt: new Date("2026-10-09T14:00:00.000Z"),
        motive: null,
        address: null,
        interventionNumber: null,
        state: "draft",
        closedAt: null,
        cancelledAt: new Date("2026-10-09T14:10:00.000Z"),
        dispatches: [],
      },
    ];
    const html = render(<EfaCoordinationServiceList episodes={episodes} />);

    expect(html).toContain("09/10/2026 09:15");
    expect(html).toContain("Cerrado");
    expect(html).toContain("Cancelado");
    expect(html).toContain("Intervención A-77");
    expect(html).toContain("Dolor torácico");
    expect(html).toContain("Calle 1 234");
    expect(html).toContain("Prioridad roja");
    expect(html).toContain("Con traslado");
    expect(html).toContain("Finalizado");
    expect(html).toContain("Despacho 09:16 · En camino 09:18 · Llegada a escena —");
    expect(html).toContain("Sin motivo registrado");
    expect(html).toContain("Sin despachos.");
  });

  it("explains a guard without services", () => {
    expect(render(<EfaCoordinationServiceList episodes={[]} />)).toContain(
      "No hubo servicios en esta guardia.",
    );
  });
});
