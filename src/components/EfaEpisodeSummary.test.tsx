import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  EfaEpisodeSummary,
  EfaEpisodeSummaryView,
  episodeFinalStateLine,
  type EpisodeSummaryData,
} from "./EfaEpisodeSummary";

vi.mock("@tanstack/react-start", () => ({
  createClientOnlyFn: (fn: () => unknown) => fn,
  useServerFn: () => vi.fn(async () => []),
}));
vi.mock("@/lib/efa-communications.functions", () => ({ listEfaCommunicationsForEpisode: vi.fn() }));
vi.mock("@/lib/efa-dispatches.functions", () => ({ listEfaDispatchesForEpisode: vi.fn() }));
vi.mock("@/lib/efa-observations.functions", () => ({ listEfaObservationsForEpisode: vi.fn() }));
vi.mock("@/lib/efa-police-coordination.functions", () => ({
  listEfaPoliceCoordinationsForEpisode: vi.fn(),
}));

type TestEpisode = Parameters<typeof EfaEpisodeSummary>[0]["episode"];
const episode: TestEpisode = {
  id: "episode-1",
  eventAt: "2026-10-14T13:30:00.000Z",
  motive: "Caída en la vía pública",
  address: "Calle 123",
  interventionNumber: "A-77",
  state: "draft",
  closedAt: null,
  cancelledAt: null,
  cancelledFromState: null,
  updatedAt: "2026-10-14T14:09:00.000Z",
};
const emptyData: EpisodeSummaryData = {
  communications: [],
  dispatches: [],
  coordinations: [],
  observations: [],
};
const sectionTitles = [
  "Servicio",
  "Llamadas",
  "Despachos",
  "Apoyo policial",
  "Conductas observadas",
];

const render = (
  state: Parameters<typeof EfaEpisodeSummaryView>[0]["state"],
  override: Partial<TestEpisode> = {},
) =>
  renderToStaticMarkup(
    <EfaEpisodeSummaryView
      episode={{ ...episode, ...override }}
      state={state}
      onRetry={() => {}}
    />,
  );

describe("episodeFinalStateLine", () => {
  it("describes a closed service with the same-day update shown as a time only", () => {
    expect(
      episodeFinalStateLine({
        ...episode,
        state: "closed",
        closedAt: "2026-10-14T14:09:00.000Z",
      }),
    ).toBe("Cerrado el 14/10/2026 11:09 · última actualización 11:09");
  });

  it("shows the full date when the last update happened on another day", () => {
    expect(
      episodeFinalStateLine({
        ...episode,
        state: "closed",
        closedAt: "2026-10-14T14:09:00.000Z",
        updatedAt: "2026-10-15T12:00:00.000Z",
      }),
    ).toBe("Cerrado el 14/10/2026 11:09 · última actualización 15/10/2026 09:00");
  });

  it("covers cancelled and in-progress services", () => {
    expect(
      episodeFinalStateLine({
        ...episode,
        state: "closed",
        cancelledAt: "2026-10-14T14:09:00.000Z",
        cancelledFromState: "closed",
      }),
    ).toBe("Anulado el 14/10/2026 11:09 · última actualización 11:09");
    expect(episodeFinalStateLine(episode)).toBe(
      "Servicio en curso · última actualización 14/10/2026 11:09",
    );
  });
});

describe("EfaEpisodeSummaryView", () => {
  it("shows the five sections even while loading, with the service data already visible", () => {
    const html = render({ status: "loading" });
    for (const title of sectionTitles) expect(html).toContain(title);
    expect(html).toContain("Caída en la vía pública");
    expect(html).toContain("Calle 123");
    expect(html).toContain("A-77");
    expect(html).toContain("Cargando…");
    expect(html).toContain('aria-busy="true"');
  });

  it("shows a retry message and keeps the five sections when loading fails", () => {
    const html = render({ status: "error" });
    expect(html).toContain("No se pudo cargar el resumen.");
    expect(html).toContain("Reintentar");
    expect(html).toContain('role="alert"');
    for (const title of sectionTitles) expect(html).toContain(title);
    expect(html).not.toContain("Sin llamadas todavía");
  });

  it("shows muted pending lines for sections without data", () => {
    const html = render({ status: "ready", data: emptyData });
    expect(html).toContain("Sin llamadas todavía");
    expect(html).toContain("Sin despachos todavía");
    expect(html).toContain("Sin apoyo policial todavía");
    expect(html).toContain("Sin conductas registradas todavía");
    expect(html).toContain("Puede haber cambios sin sincronizar");
  });

  it("renders recorded data as readable Spanish without JSON or version history", () => {
    const html = render(
      {
        status: "ready",
        data: {
          communications: [
            {
              id: "c1",
              direction: "incoming",
              priority: "red",
              state: "finalized",
              startedAt: "2026-10-14T13:35:00.000Z",
              createdAt: "2026-10-14T13:36:00.000Z",
            },
          ],
          dispatches: [
            {
              id: "d1",
              baseName: "Móvil 1",
              institutionName: "Hospital Central",
              priority: "yellow",
              result: "transported",
              resultClarification: "Hospital cercano",
              finalizedAt: "2026-10-14T14:05:00.000Z",
              state: "finalized",
              contactAttempts: [{ id: "a1" }, { id: "a2" }],
              t0At: "2026-10-14T13:40:00.000Z",
              t1At: null,
              t2At: "2026-10-14T13:55:00.000Z",
              t3At: null,
              t4At: null,
              t5At: null,
              t6At: null,
            },
          ],
          coordinations: [
            {
              id: "p1",
              initiator: "ambulance",
              placeType: "meeting_point",
              state: "finalized",
              events: [
                {
                  id: "e1",
                  kind: "request",
                  occurredAt: "2026-10-14T13:45:00.000Z",
                  timeStatus: "observed",
                },
                { id: "e2", kind: "response", occurredAt: null, timeStatus: "not_informed" },
              ],
            },
          ],
          observations: [
            {
              id: "o1",
              recordKind: "conduct",
              catalogLabelSnapshot: "Saludo inicial",
              otherDescription: null,
              classification: "adequate",
              comment: null,
            },
            {
              id: "o2",
              recordKind: "conduct",
              catalogLabelSnapshot: null,
              otherDescription: "Registro de datos",
              classification: "needs_improvement",
              comment: "Faltó la dirección exacta",
            },
            {
              id: "o3",
              recordKind: "participation",
              catalogLabelSnapshot: "Participación",
              otherDescription: null,
              classification: null,
              comment: "No debe contarse",
            },
          ],
        },
      },
      { state: "closed", closedAt: "2026-10-14T14:09:00.000Z" },
    );
    expect(html).toContain("Cerrado el 14/10/2026 11:09 · última actualización 11:09");
    expect(html).toContain("1 llamada registrada");
    expect(html).toContain("Entrante");
    expect(html).toContain("10:35");
    expect(html).toContain("Prioridad roja");
    expect(html).toContain("Móvil 1");
    expect(html).not.toContain("Institución sin nombre");
    expect(html).toContain("Destino: Hospital Central");
    expect(html).toContain("Prioridad amarilla");
    expect(html).toContain("Resultado: Con traslado");
    expect(html).toContain("Hospital cercano");
    expect(html).toContain("Finalizado 11:05");
    expect(html).toContain("Despacho 10:40");
    expect(html).toContain("Llegada a escena 10:55");
    expect(html).toContain("2 registros de seguimiento");
    expect(html).not.toContain("intentos de contacto");
    expect(html).toContain("Inició: Ambulancia");
    expect(html).toContain("Punto de encuentro");
    expect(html).toContain("Solicitud");
    expect(html).toContain("10:45");
    expect(html).toContain("Respuesta");
    expect(html).toContain("No informado");
    expect(html).toContain("1 adecuada");
    expect(html).toContain("1 a mejorar");
    expect(html).toContain("Saludo inicial");
    expect(html).toContain("Registro de datos");
    expect(html).toContain("Faltó la dirección exacta");
    expect(html).not.toContain("No debe contarse");
    expect(html).not.toContain("{&quot;");
    expect(html).not.toContain("versión");
    expect(html).not.toContain("Antes");
  });

  it("titles unfinished dispatches with the mobile, hides an absent destination and shows a pending result", () => {
    const html = render({
      status: "ready",
      data: {
        ...emptyData,
        dispatches: [
          {
            id: "d1",
            baseName: "Móvil 2",
            institutionName: null,
            priority: null,
            result: null,
            state: "draft",
            t0At: null,
            t1At: null,
            t2At: null,
            t3At: null,
            t4At: null,
            t5At: null,
            t6At: null,
          },
          {
            id: "d2",
            baseName: null,
            institutionName: "  ",
            priority: null,
            result: null,
            state: "cancelled",
            t0At: null,
            t1At: null,
            t2At: null,
            t3At: null,
            t4At: null,
            t5At: null,
            t6At: null,
          },
        ],
      },
    });
    expect(html).toContain("Móvil 2");
    expect(html).toContain("(Sin finalizar)");
    expect(html).not.toContain("En curso");
    expect(html).toContain("Resultado: Pendiente");
    expect(html).not.toContain("Destino:");
    expect(html).toContain("Base histórica");
    expect(html).toContain("(Anulada)");
    expect(html).not.toContain("Institución sin nombre");
  });

  it("never exposes private police notes or meeting references", () => {
    const html = render({
      status: "ready",
      data: {
        ...emptyData,
        coordinations: [
          {
            id: "p1",
            initiator: "central",
            placeType: "incident",
            state: "draft",
            events: [],
            meetingReference: "Esquina privada",
            notes: "Nota privada",
          } as never,
        ],
      },
    });
    expect(html).toContain("Inició: Central");
    expect(html).not.toContain("Esquina privada");
    expect(html).not.toContain("Nota privada");
  });

  it("is read-only: only the retry action may be a button", () => {
    const ready = render({ status: "ready", data: emptyData });
    expect(ready).not.toContain("<button");
    const failed = render({ status: "error" });
    expect(failed.match(/<button/g)).toHaveLength(1);
  });

  it("marks cancelled and unfinished records with text, not only color", () => {
    const html = render({
      status: "ready",
      data: {
        ...emptyData,
        communications: [
          {
            id: "c1",
            direction: "outgoing",
            priority: null,
            state: "cancelled",
            startedAt: null,
            createdAt: "2026-10-14T13:36:00.000Z",
          },
        ],
      },
    });
    expect(html).toContain("Saliente");
    expect(html).toContain("Sin prioridad");
    expect(html).toContain("(Anulada)");
  });
});

describe("EfaEpisodeSummary", () => {
  it("starts in the loading state before any list has been read", () => {
    const html = renderToStaticMarkup(<EfaEpisodeSummary episode={episode} />);
    expect(html).toContain("Cargando…");
    expect(html).toContain("Servicio");
    expect(html).not.toContain("Sin despachos todavía");
  });
});
