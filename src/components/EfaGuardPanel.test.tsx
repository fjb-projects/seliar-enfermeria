import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { getOperationalDateRange } from "@/lib/efa-staffing-plan.date";
import {
  clearConfirmedStaffingOperation,
  EfaGuardPanel,
  getStableStaffingOperationId,
  type GuardView,
  type PendingStaffingOperation,
} from "./EfaGuardPanel";

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
  correctEfaGuardEnd: vi.fn(),
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
    expect(html).toContain("2026-10-07");
    expect(html).toContain('<details class="space-y-3">');
    expect(html).not.toMatch(/<details[^>]*\bopen(?:="")?[^>]*>/);
    expect(html).toContain("Ver detalles");
    expect(html).toContain("Presencia declarada en Central · versión 3");
    expect(html).toContain("Historial de cambios de base");
    expect(html).toContain("Responsable: current-user");
    expect(html).toContain("Corregir hora de cierre");
    expect(html).toContain("Dotación observada");
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
    expect([...html.matchAll(/<details[^>]*>/g)].map(([tag]) => /\bopen(?:="")?/.test(tag))).toEqual(
      [true, false],
    );
    expect(html).toContain("Ocultar detalles");
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
    const selectedBases = [
      ...html.matchAll(/<label[^>]*><input[^>]*checked=""[^>]*>\s*<span>(.*?)<\/span>/g),
    ].map((match) => match[1]);

    expect(selectedBases).toEqual(["Central", "Norte"]);
    expect(html).toContain("Oeste");
    expect(html).toContain("/episodios-efa");
    expect(html).toContain("Ver conductas observadas");
    expect(html).toContain("Planificación futura (solo lectura)");
    expect(html).toContain("La planificación no confirma la dotación observada");
    expect(html).toContain("Después de iniciar la guardia, registra las atenciones en episodios");
    expect(html).toContain("Elegir bases es opcional");
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
  });

  it("explains that starting a guard leads to episode recording and bases are optional", () => {
    const html = renderToStaticMarkup(
      <EfaGuardPanel
        initialGuards={[]}
        activeBases={[]}
        initialStaffing={{}}
        currentUserId="current-user"
        isAdmin={false}
        canWrite
      />,
    );

    expect(html).toContain("Después de iniciar la guardia, registra las atenciones en episodios");
    expect(html).toContain("Elegir bases es opcional");
    expect(html).not.toContain("Ir a episodios de atención");
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
