import { renderToStaticMarkup as renderMarkup } from "react-dom/server";
import type { ComponentProps, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { getOperationalDateRange } from "@/lib/efa-staffing-plan.date";
import {
  clearConfirmedStaffingOperation,
  EfaGuardPanel,
  getStableStaffingOperationId,
  type GuardView,
  type PendingStaffingOperation,
} from "./EfaGuardPanel";

// The panel reads the query client for summary invalidation, so every render needs a provider.
function renderToStaticMarkup(node: ReactNode) {
  return renderMarkup(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
}

vi.mock("@tanstack/react-start", () => ({
  createClientOnlyFn: (fn: () => unknown) => fn,
  useServerFn: () => vi.fn(async () => []),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: ComponentProps<"a"> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/efa-guards.functions", () => ({
  endEfaGuard: vi.fn(),
  listActiveEfaGuardBases: vi.fn(),
  listEfaGuards: vi.fn(),
  setEfaGuardBases: vi.fn(),
  startEfaGuard: vi.fn(),
}));
vi.mock("@/lib/efa-staffing.functions", () => ({
  arriveEfaStaffing: vi.fn(),
  departEfaStaffing: vi.fn(),
  enterEfaStaffing: vi.fn(),
  exitEfaStaffing: vi.fn(),
  listEfaStaffing: vi.fn(),
}));
vi.mock("@/lib/efa-mobile-arrivals.functions", () => ({
  createEfaMobileArrival: vi.fn(),
  deleteEfaMobileArrival: vi.fn(),
  listEfaMobileArrivalsForGuard: vi.fn(),
  updateEfaMobileArrival: vi.fn(),
}));
vi.mock("@/lib/efa-mobile-hygiene.functions", () => ({
  deleteEfaMobileHygiene: vi.fn(),
  listEfaMobileHygieneForGuard: vi.fn(),
  markEfaMobileHygieneAvailable: vi.fn(),
  requestEfaMobileHygiene: vi.fn(),
  updateEfaMobileHygiene: vi.fn(),
}));
vi.mock("@/lib/efa-staffing-plan.functions", () => ({ previewEfaStaffingPlan: vi.fn() }));
vi.mock("@/lib/efa-observations.functions", () => ({
  createEfaObservation: vi.fn(),
  getEfaObservation: vi.fn(),
  getEfaObservationCatalog: vi.fn(),
  getEfaObservationHistory: vi.fn(),
  listEfaObservationNotices: vi.fn(),
  listEfaObservationsForEpisode: vi.fn(),
  listEfaObservationsForGuard: vi.fn(),
  markEfaObservationNoticeRead: vi.fn(),
  updateEfaObservation: vi.fn(),
}));

describe("planned coverage date defaults", () => {
  it("uses the Buenos Aires operational day when UTC is already on the next date", () => {
    expect(getOperationalDateRange(new Date("2026-10-07T02:00:00.000Z"), 6)).toEqual({
      from: "2026-10-06",
      to: "2026-10-12",
    });
  });
});
vi.mock("@/lib/efa-episodes.functions", () => ({ listEfaEpisodes: vi.fn() }));
vi.mock("@/lib/efa-communications.functions", () => ({ listEfaCommunicationsForEpisode: vi.fn() }));
vi.mock("@/lib/efa-dispatches.functions", () => ({ listEfaDispatchesForEpisode: vi.fn() }));
vi.mock("@/lib/efa-police-coordination.functions", () => ({
  getEfaPoliceCoordination: vi.fn(),
  listEfaPoliceCoordinationsForEpisode: vi.fn(),
}));

describe("EfaGuardPanel", () => {
  it("keeps guard history summaries compact and exposes existing details on demand", () => {
    const html = renderToStaticMarkup(
      <EfaGuardPanel
        initialGuards={[
          {
            id: "closed-guard",
            ownerUserId: "current-user",
            startedAt: "2026-10-07T08:00:00.000Z",
            endedAt: "2026-10-07T12:00:00.000Z",
            declaredAtCentral: true,
            version: 3,
            bases: [{ id: "base-a", name: "Central", isActive: true }],
            baseEvents: [
              {
                baseId: "base-a",
                baseName: "Central",
                actorUserId: "admin-user",
                action: "added",
                occurredAt: "2026-10-07T08:05:00.000Z",
              },
              {
                baseId: "base-a",
                baseName: "Central",
                actorUserId: "current-user",
                action: "removed",
                occurredAt: "2026-10-07T09:05:00.000Z",
              },
            ],
          },
        ]}
        activeBases={[]}
        initialStaffing={{}}
        currentUserId="current-user"
        isAdmin
        canWrite
      />,
    );

    expect(html).toContain("Finalizada");
    expect(html).toContain("Mis guardias");
    expect(html).toContain("Solo se muestran guardias propias.");
    expect(html).not.toContain("Historial de guardias");
    expect(html).toContain("Inicio: 07/10/2026 05:00 · Fin: 07/10/2026 09:00");
    expect(html).toContain('<details class="min-w-0 space-y-3">');
    expect(html).not.toMatch(/<details[^>]*\bopen(?:="")?[^>]*>/);
    expect(html).toContain("Ver detalles");
    expect(html).toContain("Presencia declarada en Central · versión 3");
    expect(html).toContain("Historial de cambios de base");
    expect(html).toContain("por otra cuenta");
    expect(html).toContain("por vos");
    expect(html).not.toContain("admin-user");
    expect(html).not.toContain("Responsable");
    expect(html).not.toContain("Corregir hora de cierre");
    expect(html).toContain("Dotación observada");
    expect(html).toContain('aria-label="Móviles"');
    expect(html).not.toContain("Registrar ingreso");
  });

  it("shows the single unified mobile manager for the active guard", () => {
    const html = renderToStaticMarkup(
      <EfaGuardPanel
        initialGuards={[
          {
            id: "open-guard",
            ownerUserId: "current-user",
            startedAt: "2026-10-07T08:00:00.000Z",
            endedAt: null,
            declaredAtCentral: true,
            version: 2,
            bases: [{ id: "base-a", name: "Central", isActive: true }],
            baseEvents: [],
          },
        ]}
        activeBases={[{ id: "base-a", name: "Central", isActive: true }]}
        initialStaffing={{}}
        currentUserId="current-user"
        isAdmin={false}
        canWrite
      />,
    );
    const activeGuard = html.slice(0, html.indexOf("Mis guardias"));

    expect(activeGuard).toContain("Gestionar móviles");
    expect(activeGuard).not.toContain("Guardar bases");
    expect(activeGuard).toContain("Guardia en curso · Inicio:");
    expect(activeGuard).not.toContain("El inicio y el cierre son manuales");
    expect(activeGuard).not.toContain("Después de iniciar la guardia");
    expect(activeGuard).not.toContain("Presencia declarada en Central");
    expect(activeGuard.match(/Registrar ingreso/g)).toHaveLength(3);
    expect(activeGuard).not.toMatch(/<details[^>]*\bopen(?:="")?/);
    expect((html.match(/aria-label="Móviles"/g) ?? []).length).toBe(1);
  });

  it("shows one confirmed mobile summary and a collapsed unified manager for an active selection", () => {
    const html = renderToStaticMarkup(
      <EfaGuardPanel
        initialGuards={[
          {
            id: "open-guard",
            ownerUserId: "current-user",
            startedAt: "2026-10-07T08:00:00.000Z",
            endedAt: null,
            declaredAtCentral: true,
            version: 3,
            bases: [
              { id: "mobile-10", name: "Móvil 10", isActive: true },
              { id: "mobile-2", name: "Móvil 2", isActive: true },
            ],
            baseEvents: [],
          },
        ]}
        activeBases={[
          { id: "mobile-10", name: "Móvil 10", isActive: true },
          { id: "mobile-2", name: "Móvil 2", isActive: true },
          { id: "mobile-1", name: "Móvil 1", isActive: true },
        ]}
        initialStaffing={{}}
        currentUserId="current-user"
        isAdmin={false}
        canWrite
      />,
    );
    const activeGuard = html.slice(0, html.indexOf("Mis guardias"));

    expect(activeGuard).toContain("Móviles activos");
    expect(activeGuard.indexOf("Móvil 2")).toBeLessThan(activeGuard.indexOf("Móvil 10"));
    expect(activeGuard).toContain("Gestionar móviles");
    expect(activeGuard).not.toContain("Guardar bases");
    expect((html.match(/Registrar atenciones/g) ?? []).length).toBe(1);
    expect((html.match(/aria-label="Móviles"/g) ?? []).length).toBe(1);
    expect(activeGuard).not.toMatch(/<details[^>]*\bopen(?:="")?[^>]*>/);
  });

  it("opens the unified mobile manager when an active guard has no selected mobiles", () => {
    const html = renderToStaticMarkup(
      <EfaGuardPanel
        initialGuards={[
          {
            id: "open-guard",
            ownerUserId: "current-user",
            startedAt: "2026-10-07T08:00:00.000Z",
            endedAt: null,
            declaredAtCentral: true,
            version: 1,
            bases: [],
            baseEvents: [],
          },
        ]}
        activeBases={[]}
        initialStaffing={{}}
        currentUserId="current-user"
        isAdmin={false}
        canWrite
      />,
    );

    expect(html).toContain("Gestionar móviles");
    expect(html).toContain("Elegir móviles es opcional.");
    expect(html).not.toContain(
      "Después de iniciar la guardia, registra las atenciones en episodios",
    );
    expect(html.match(/<details[^>]*open=""/)).not.toBeNull();
  });

  it("makes an open guard status obvious without hiding the episode action", () => {
    const html = renderToStaticMarkup(
      <EfaGuardPanel
        initialGuards={[
          {
            id: "open-guard",
            ownerUserId: "current-user",
            startedAt: "2026-10-07T08:00:00.000Z",
            endedAt: null,
            declaredAtCentral: false,
            version: 1,
            bases: [],
            baseEvents: [],
          },
          {
            id: "other-open-guard",
            ownerUserId: "other-user",
            startedAt: "2026-10-07T09:00:00.000Z",
            endedAt: null,
            declaredAtCentral: true,
            version: 1,
            bases: [],
            baseEvents: [],
          },
        ]}
        activeBases={[]}
        initialStaffing={{}}
        currentUserId="current-user"
        isAdmin
        canWrite
      />,
    );

    expect(html).toContain("Guardia en curso");
    expect(html).toContain("/episodios-efa");
    expect(html).toContain("Registrar atenciones");
    expect(
      [...html.matchAll(/<details[^>]*>/g)].map(([tag]) => /\bopen(?:="")?/.test(tag)),
    ).toEqual([true, false, false]);
    expect(html).toContain("Ver detalles");
  });

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
        initialStaffing={{}}
        isAdmin
        canWrite
      />,
    );
    expect(html).toContain("Móviles activos (2)");
    expect(html).toContain(">Central</button>");
    expect(html).toContain(">Norte</button>");
    expect(html).toContain("Oeste");
    expect(html).toContain("/episodios-efa");
    expect(html).toContain("Ver conductas observadas");
    expect(html).toContain("Planificación futura (solo lectura)");
    expect(html).toContain("La planificación no confirma la dotación observada");
    expect(html).not.toContain(
      "Después de iniciar la guardia, registra las atenciones en episodios",
    );
    expect(html).toContain("Presencia declarada en Central");
  });

  it("keeps guard history visible without exposing write controls to revoked EFA", () => {
    const html = renderToStaticMarkup(
      <EfaGuardPanel
        initialGuards={[]}
        activeBases={[]}
        initialStaffing={{}}
        currentUserId="current-user"
        isAdmin={false}
        canWrite={false}
      />,
    );

    expect(html).toContain("Mis guardias");
    expect(html).toContain("Solo se muestran guardias propias.");
    expect(html).not.toContain("Iniciar guardia");
    expect(html).not.toContain("Registrar atenciones");
  });

  it("keeps open-guard episodes consultable but does not label them as registration when access is revoked", () => {
    const html = renderToStaticMarkup(
      <EfaGuardPanel
        initialGuards={[
          {
            id: "own-open-guard",
            ownerUserId: "current-user",
            startedAt: "2026-10-07T08:00:00.000Z",
            endedAt: null,
            declaredAtCentral: false,
            version: 1,
            bases: [],
            baseEvents: [],
          },
        ]}
        activeBases={[]}
        initialStaffing={{}}
        currentUserId="current-user"
        isAdmin={false}
        canWrite={false}
      />,
    );

    expect(html).toContain('href="/episodios-efa"');
    expect(html).toContain("Consultar atenciones de la guardia abierta");
    expect(html).not.toContain("Registrar atenciones");
  });

  describe("start block as a shift time clock", () => {
    const renderStart = (canWrite: boolean) =>
      renderToStaticMarkup(
        <EfaGuardPanel
          initialGuards={[]}
          activeBases={[]}
          initialStaffing={{}}
          currentUserId="current-user"
          isAdmin={false}
          canWrite={canWrite}
        />,
      );
    const startBlock = (html: string) => html.slice(0, html.indexOf("Mis guardias"));

    it("leads with a punch-in eyebrow and a display clock that renders a stable placeholder", () => {
      const html = startBlock(renderStart(true));

      expect(html).toContain("Fichar entrada");
      expect(html).toMatch(/<[^>]*class="[^"]*\bfont-display\b[^"]*"[^>]*>--:--</);
      expect(html.indexOf("Fichar entrada")).toBeLessThan(html.indexOf("--:--"));
      expect(html).not.toContain('aria-live="polite">--:--');
    });

    it("puts the start action before the legal notice and the episodes link", () => {
      const html = startBlock(renderStart(true));
      const button = html.indexOf("Iniciar guardia");

      expect(html).toContain("Guardia EFA");
      expect(button).toBeGreaterThan(-1);
      expect(button).toBeLessThan(
        html.indexOf("El inicio y el cierre son manuales. La presencia es declarada"),
      );
      expect(button).toBeLessThan(html.indexOf("Ver episodios de atención"));
      expect(html.indexOf("Guardia EFA")).toBeLessThan(html.indexOf("Ver episodios de atención"));
      expect(html).toContain("no usa GPS ni verifica ubicación");
      expect(html).toContain('href="/episodios-efa"');
    });

    it("drops the nested start box and the old helper copy for a voseo next step", () => {
      const html = startBlock(renderStart(true));

      expect(html).not.toContain("rounded-lg border p-3");
      expect(html).not.toContain("Iniciar una guardia");
      expect(html).not.toContain("Después de iniciar la guardia, registra las atenciones");
      expect(html).not.toContain("Elegir bases es opcional");
      expect(html).toContain("Después vas a poder elegir los móviles y registrar las atenciones.");
      expect(html).not.toContain("Ir a episodios de atención");
    });

    it("presents the presence declaration as a signed statement the button refers to", () => {
      const html = startBlock(renderStart(true));
      const describedBy = html.match(/<button[^>]*aria-describedby="([^"]+)"[^>]*>Iniciar guardia/);

      expect(html).toContain("Declaro que estoy en la Central al iniciar esta guardia.");
      expect(html).toContain("border-[var(--brand-orange)]");
      expect(describedBy).not.toBeNull();
      expect(html).toContain(
        `id="${describedBy?.[1]}">Declaro que estoy en la Central al iniciar esta guardia.`,
      );
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Iniciar guardia/);
    });

    it("keeps the episodes link and the notice for read-only users without a start action", () => {
      const html = startBlock(renderStart(false));

      expect(html).toContain('href="/episodios-efa"');
      expect(html).toContain("Ver episodios de atención");
      expect(html).toContain("La presencia es declarada: no usa GPS ni verifica ubicación.");
      expect(html).not.toContain("Iniciar guardia");
      expect(html).not.toContain("Declaro que estoy en la Central");
    });
  });

  it("presents staffing as anonymous observed facts and keeps transfer times distinct", () => {
    const html = renderToStaticMarkup(
      <EfaGuardPanel
        initialGuards={[
          {
            id: "own-guard",
            ownerUserId: "current-user",
            startedAt: "2026-10-07T08:00:00.000Z",
            endedAt: null,
            declaredAtCentral: true,
            version: 1,
            bases: [],
            baseEvents: [],
          },
        ]}
        activeBases={[]}
        initialStaffing={{
          "own-guard": [
            {
              id: "staffing-period",
              guardId: "own-guard",
              role: "nurse",
              enteredAt: new Date("2026-10-07T08:00:00.000Z"),
              exitedAt: null,
              exitCause: null,
              exitDescription: null,
              version: 2,
              movements: [
                {
                  id: "transfer",
                  periodId: "staffing-period",
                  kind: "transfer",
                  departedAt: new Date("2026-10-07T09:00:00.000Z"),
                  arrivedAt: new Date("2026-10-07T09:30:00.000Z"),
                  cause: "coordination",
                  description: null,
                  version: 2,
                },
              ],
            },
          ],
        }}
        currentUserId="current-user"
        isAdmin={false}
        canWrite={false}
      />,
    );

    expect(html).toContain("Dotación observada");
    expect(html).toContain("registro anónimo");
    expect(html).toContain("llegada al destino");
    expect(html).toContain("salida");
    expect(html).toContain("Coordinación");
    expect(html).toContain("Los datos faltantes no confirman ausencia");
    expect(html).not.toContain("Registrar ingreso");
  });

  it("reuses an operation ID and payload for uncertain retries until success or an explicit edit", () => {
    const pending = new Map<string, PendingStaffingOperation>();
    let nextId = 0;
    const createId = () => `operation-${++nextId}`;
    const original = {
      periodId: "period",
      kind: "transfer",
      departedAt: "2026-10-07T10:00:00.000Z",
    };

    const first = getStableStaffingOperationId(pending, "departure", original, createId);
    const retry = getStableStaffingOperationId(pending, "departure", original, createId);
    expect(retry).toBe(first);
    expect([...pending.values()][0]?.fingerprint).toBe(JSON.stringify(original));

    const edited = { ...original, departedAt: "2026-10-07T10:05:00.000Z" };
    const changed = getStableStaffingOperationId(pending, "departure", edited, createId);
    expect(changed).not.toBe(first);
    clearConfirmedStaffingOperation(pending, "departure", changed);
    expect(getStableStaffingOperationId(pending, "departure", edited, createId)).not.toBe(changed);
  });

  it("allows completing pre-existing staffing after guard closure but prevents new entries", () => {
    const html = renderToStaticMarkup(
      <EfaGuardPanel
        initialGuards={[
          {
            id: "closed-guard",
            ownerUserId: "current-user",
            startedAt: "2026-10-07T08:00:00.000Z",
            endedAt: "2026-10-07T12:00:00.000Z",
            declaredAtCentral: true,
            version: 2,
            bases: [],
            baseEvents: [],
          },
        ]}
        activeBases={[]}
        initialStaffing={{
          "closed-guard": [
            {
              id: "staffing-to-exit",
              guardId: "closed-guard",
              role: "nurse",
              enteredAt: new Date("2026-10-07T08:30:00.000Z"),
              exitedAt: null,
              exitCause: null,
              exitDescription: null,
              version: 1,
              movements: [],
            },
            {
              id: "staffing-to-return",
              guardId: "closed-guard",
              role: "driver",
              enteredAt: new Date("2026-10-07T09:00:00.000Z"),
              exitedAt: null,
              exitCause: null,
              exitDescription: null,
              version: 2,
              movements: [
                {
                  id: "pending-transfer",
                  periodId: "staffing-to-return",
                  kind: "transfer",
                  departedAt: new Date("2026-10-07T11:00:00.000Z"),
                  arrivedAt: null,
                  cause: "coordination",
                  description: null,
                  version: 1,
                },
              ],
            },
          ],
        }}
        currentUserId="current-user"
        isAdmin={false}
        canWrite
      />,
    );

    expect(html).not.toContain("Registrar ingreso");
    expect(html).toContain("Registrar egreso");
    expect(html).toContain("Registrar llegada al destino");
  });
});

describe("EfaGuardPanel hygiene and restocking", () => {
  const central = { id: "base-a", name: "Central", isActive: true };
  const guard = (overrides: Partial<GuardView>): GuardView => ({
    id: "guard-1",
    ownerUserId: "current-user",
    startedAt: "2026-10-07T08:00:00.000Z",
    endedAt: null,
    declaredAtCentral: true,
    version: 2,
    bases: [central],
    baseEvents: [],
    ...overrides,
  });
  const hygiene = (overrides: Record<string, unknown> = {}) => ({
    id: "period-1",
    guardId: "guard-1",
    baseId: "base-a",
    baseNameSnapshot: "Central",
    requestedAt: "2026-10-07T10:00:00.000Z",
    availableAt: null,
    notInformed: false,
    note: null,
    deletedAt: null,
    version: 1,
    canEdit: true,
    ...overrides,
  });
  const render = (guards: GuardView[], periods: ReturnType<typeof hygiene>[]) =>
    renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <EfaGuardPanel
          initialGuards={guards}
          activeBases={[central]}
          initialStaffing={{}}
          initialHygiene={{ "guard-1": periods }}
          currentUserId="current-user"
          isAdmin={false}
          canWrite
        />
      </QueryClientProvider>,
    );

  it("offers both actions and the period list inside the mobile card of the open guard", () => {
    const html = render([guard({})], [hygiene()]);

    expect(html.match(/Solicitó higiene y reposición/g)).toHaveLength(1);
    expect(html).toContain("Disponible (handy)");
    expect(html).toContain("En higiene y reposición");
    expect(html.indexOf('aria-label="Móvil Central"')).toBeLessThan(
      html.indexOf("Solicitó higiene y reposición"),
    );
  });

  it("shows a period left open at close as not informed and read-only in the closed guard", () => {
    const html = render(
      [guard({ endedAt: "2026-10-07T12:00:00.000Z", version: 3 })],
      [hygiene({ notInformed: true, canEdit: false })],
    );

    expect(html).toContain("No informado");
    expect(html).not.toContain("Solicitó higiene y reposición");
    expect(html).not.toContain("Disponible (handy)");
  });
});
