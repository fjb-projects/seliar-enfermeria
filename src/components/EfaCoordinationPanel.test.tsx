import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type {
  EfaOversightEpisodeView,
  EfaOversightGuardView,
} from "@/lib/efa-guard-oversight.functions";
import { EfaCoordinationPanel } from "./EfaCoordinationPanel";
import { EfaCoordinationServiceList, guardTotalBadges } from "./EfaCoordinationGuardCard";

vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn(async () => []) }));
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
  it("groups every guard by owner with name, email and guard count", () => {
    const html = render(
      <EfaCoordinationPanel guards={guards} search={{}} onSearchChange={() => {}} />,
    );

    expect(html).toContain("Coordinación EFA");
    expect(html).toContain("Todas las guardias de todos los usuarios");
    expect(html).toContain('aria-label="Guardias de Ana Pérez"');
    expect(html).toContain("ana@example.test · 2 guardias");
    expect(html).toContain("bruno@example.test · 1 guardia");
    expect(html.indexOf("Guardias de Ana Pérez")).toBeLessThan(
      html.indexOf("Guardias de Bruno Díaz"),
    );
    expect(html).toContain("3 guardias");
  });

  it("shows status, times, duration, bases and totals on each guard", () => {
    const html = render(
      <EfaCoordinationPanel guards={guards} search={{}} onSearchChange={() => {}} />,
    );

    expect(html).toContain("En curso");
    expect(html).toContain("Finalizada");
    expect(html).toContain("border-l-primary");
    expect(html).toContain("Inicio: 08/10/2026 08:00");
    expect(html).toContain("Fin: 08/10/2026 16:30");
    expect(html).toContain("Duración: 8 h 30 min");
    expect(html).toContain("Bases: Móvil 3");
    expect(html).toContain("Servicios: 3");
    expect(html).toContain("1 en borrador · 2 cerrados · 0 cancelados");
    expect(html).toContain("Despachos: 3");
    expect(html).toContain("Arribos: 2");
    expect(html).toContain("Higiene: 1");
    expect(html).toContain("Sin servicios");
    expect(html).toContain("Sin despachos");
    expect(html).toContain("Ver servicios");
    expect(html).not.toMatch(/<details[^>]*\bopen/);
  });

  it("applies the URL filters and offers to clear them", () => {
    const html = render(
      <EfaCoordinationPanel
        guards={guards}
        search={{ user: "bruno", status: "closed" }}
        onSearchChange={() => {}}
      />,
    );

    expect(html).toContain("Bruno Díaz");
    expect(html).not.toContain('aria-label="Guardias de Ana Pérez"');
    expect(html).toContain("1 guardia de 3");
    expect(html).toContain("Limpiar filtros");
    expect(html).toContain('<option value="ana">Ana Pérez</option>');
  });

  it("explains an empty filtered list", () => {
    const html = render(
      <EfaCoordinationPanel
        guards={guards}
        search={{ from: "2026-11-01" }}
        onSearchChange={() => {}}
      />,
    );

    expect(html).toContain("No hay guardias con estos filtros.");
  });
});

describe("coordination guard details", () => {
  it("reads zero totals as plain sentences", () => {
    expect(guardTotalBadges(totals()).map((badge) => badge.label)).toEqual([
      "Sin servicios",
      "Sin despachos",
      "Sin arribos",
      "Sin higiene",
    ]);
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
