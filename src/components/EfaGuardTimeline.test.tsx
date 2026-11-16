import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildGuardTimeline, type GuardTimelineObservation } from "@/lib/efa-guard-timeline";
import { EfaGuardTimelineView, GUARD_TIMELINE_EMPTY } from "./EfaGuardTimeline";

vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => vi.fn(async () => []),
}));
vi.mock("@/lib/efa-observations.functions", () => ({ listEfaObservationsForGuard: vi.fn() }));
vi.mock("@/lib/efa-episodes.functions", () => ({ listEfaEpisodes: vi.fn() }));

const observation = (
  id: string,
  overrides: Partial<GuardTimelineObservation> = {},
): GuardTimelineObservation => ({
  id,
  guardId: "guard-1",
  contextType: "guard",
  episodeId: null,
  recordKind: "conduct",
  catalogLabelSnapshot: "Comunicación con el móvil",
  otherDescription: null,
  classification: "adequate",
  comment: null,
  observedAt: "2026-10-19T12:00:00.000Z",
  createdAt: "2026-10-19T12:05:00.000Z",
  ...overrides,
});

const timeline = (filter: "all" | "needs_improvement" = "all") =>
  buildGuardTimeline({
    guardId: "guard-1",
    filter,
    observations: [
      observation("adequate", { comment: "Avisó a tiempo" }),
      observation("improve", {
        catalogLabelSnapshot: "Registro de horarios",
        classification: "needs_improvement",
        observedAt: null,
        createdAt: "2026-10-19T13:20:00.000Z",
      }),
    ],
    services: [
      {
        id: "svc",
        originGuardId: "guard-1",
        eventAt: "2026-10-19T12:12:00.000Z",
        interventionNumber: "4512",
        motive: null,
        cancelledAt: null,
      },
    ],
  });

const render = (props: Partial<Parameters<typeof EfaGuardTimelineView>[0]> = {}) =>
  renderToStaticMarkup(
    <EfaGuardTimelineView
      state={{ status: "ready", timeline: timeline() }}
      filter="all"
      onFilterChange={() => undefined}
      canWrite
      {...props}
    />,
  );

describe("EfaGuardTimelineView", () => {
  it("titles the section and offers two pressed-state filter chips", () => {
    const html = render();
    expect(html).toContain("Cronología de la guardia");
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Todas<\/button>/);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>A mejorar<\/button>/);
    const pressedImprove = render({ filter: "needs_improvement" });
    expect(pressedImprove).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Todas<\/button>/);
    expect(pressedImprove).toMatch(/<button[^>]*aria-pressed="true"[^>]*>A mejorar<\/button>/);
  });

  it("lists conducts and service markers in order with tabular times and text badges", () => {
    const html = render();
    const first = html.indexOf("Comunicación con el móvil");
    const marker = html.indexOf("Servicio · Intervención 4512");
    const second = html.indexOf("Registro de horarios");
    expect(first).toBeGreaterThan(-1);
    expect(marker).toBeGreaterThan(first);
    expect(second).toBeGreaterThan(marker);
    expect(html).toMatch(
      /<time[^>]*datetime="2026-10-19T12:00:00.000Z"[^>]*tabular-nums[^>]*>09:00<\/time>/i,
    );
    expect(html).toContain(">Adecuada<");
    // Once on its filter chip and once on its badge.
    expect(html.match(/>A mejorar</g)).toHaveLength(2);
    expect(html).toContain("line-clamp-2");
    expect(html).toContain("Avisó a tiempo");
    // The fallback to the record time is spelled out next to the time.
    expect(html).toContain("hora de carga");
  });

  it("filters to the conducts to improve while keeping the service markers", () => {
    const html = render({
      filter: "needs_improvement",
      state: { status: "ready", timeline: timeline("needs_improvement") },
    });
    expect(html).not.toContain("Comunicación con el móvil");
    expect(html).toContain("Registro de horarios");
    expect(html).toContain("Servicio · Intervención 4512");
  });

  it("shows the empty state with the CTA hint only to writers", () => {
    const empty = buildGuardTimeline({
      guardId: "guard-1",
      filter: "all",
      observations: [],
      services: [],
    });
    const writer = render({ state: { status: "ready", timeline: empty } });
    expect(GUARD_TIMELINE_EMPTY).toBe("Todavía no registraste conductas en esta guardia.");
    expect(writer).toContain(GUARD_TIMELINE_EMPTY);
    expect(writer).toContain("Registrar conducta");
    const reader = render({ state: { status: "ready", timeline: empty }, canWrite: false });
    expect(reader).toContain(GUARD_TIMELINE_EMPTY);
    expect(reader).not.toContain("Registrar conducta");
  });

  it("explains an empty 'A mejorar' filter when there are other conducts", () => {
    const onlyAdequate = buildGuardTimeline({
      guardId: "guard-1",
      filter: "needs_improvement",
      observations: [observation("adequate")],
      services: [],
    });
    const html = render({
      filter: "needs_improvement",
      state: { status: "ready", timeline: onlyAdequate },
    });
    expect(html).toContain("No hay conductas a mejorar en esta guardia.");
    expect(html).not.toContain(GUARD_TIMELINE_EMPTY);
  });

  it("renders loading and error states", () => {
    expect(render({ state: { status: "pending" } })).toMatch(
      /role="status"[^>]*>Cargando la cronología…/,
    );
    expect(render({ state: { status: "error" } })).toMatch(
      /role="alert"[^>]*>No se pudo cargar la cronología\. Intentá nuevamente\./,
    );
  });
});
