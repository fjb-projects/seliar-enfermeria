import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  createEpisodeSubmissionGate,
  EfaEpisodePanel,
  formatEpisodeDate,
  type EpisodeView,
} from "./EfaEpisodePanel";

vi.mock("@tanstack/react-start", () => ({
  createClientOnlyFn: (fn: () => unknown) => fn,
  useServerFn: () => vi.fn(async () => []),
}));
vi.mock("@/lib/efa-episodes.functions", () => ({
  createEfaEpisode: vi.fn(),
  getEfaEpisode: vi.fn(),
  getEfaEpisodeHistory: vi.fn(),
  listEfaEpisodes: vi.fn(),
  listEfaEpisodeNotices: vi.fn(),
  markEfaEpisodeNoticeRead: vi.fn(),
  updateEfaEpisode: vi.fn(),
}));
vi.mock("@/lib/efa-communications.functions", () => ({
  createEfaCommunication: vi.fn(),
  finalizeEfaCommunication: vi.fn(),
  getEfaCommunicationHistory: vi.fn(),
  listEfaCommunicationsForEpisode: vi.fn(),
  listEfaCommunicationNotices: vi.fn(),
  markEfaCommunicationNoticeRead: vi.fn(),
  updateEfaCommunication: vi.fn(),
}));
vi.mock("@/lib/efa-bases.functions", () => ({ listEfaBases: vi.fn() }));
vi.mock("@/lib/efa-dispatches.functions", () => ({
  addEfaDispatchContactAttempt: vi.fn(),
  createEfaDispatch: vi.fn(),
  createEfaSupportRequest: vi.fn(),
  finalizeEfaDispatch: vi.fn(),
  getEfaDispatch: vi.fn(),
  getEfaDispatchHistory: vi.fn(),
  listEfaDispatchNotices: vi.fn(),
  listEfaDispatchesForEpisode: vi.fn(),
  markEfaDispatchNoticeRead: vi.fn(),
  updateEfaDispatch: vi.fn(),
  updateEfaSupportRequest: vi.fn(),
}));
vi.mock("@/lib/efa-police-coordination.functions", () => ({
  addEfaPoliceCoordinationEvent: vi.fn(),
  createEfaPoliceCoordination: vi.fn(),
  getEfaPoliceCoordination: vi.fn(),
  getEfaPoliceCoordinationHistory: vi.fn(),
  listEfaPoliceCoordinationNotices: vi.fn(),
  listEfaPoliceCoordinationsForEpisode: vi.fn(),
  markEfaPoliceCoordinationNoticeRead: vi.fn(),
  setEfaPoliceCoordinationDispatches: vi.fn(),
  updateEfaPoliceCoordination: vi.fn(),
  updateEfaPoliceCoordinationEvent: vi.fn(),
}));
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
vi.mock("@/lib/efa-guards.functions", () => ({ listEfaGuards: vi.fn() }));

const episode: EpisodeView = {
  id: "episode-1",
  clientCreationKey: "key-1",
  ownerUserId: "owner",
  originGuardId: "guard-1",
  eventAt: "2026-10-06T09:30:00.000Z",
  motive: null,
  address: null,
  interventionNumber: null,
  state: "draft",
  version: 1,
  createdAt: "2026-10-06T10:00:00.000Z",
  updatedAt: "2026-10-06T10:00:00.000Z",
  canEdit: false,
};

describe("EfaEpisodePanel", () => {
  it("reserves a pending submit while the helper chunk loads and sends only one operation", async () => {
    const gate = createEpisodeSubmissionGate();
    let resolveHelpers!: (value: {
      nextId: () => string;
      write: (id: string) => Promise<void>;
    }) => void;
    const loadHelpers = vi.fn(
      () =>
        new Promise<{ nextId: () => string; write: (id: string) => Promise<void> }>((resolve) => {
          resolveHelpers = resolve;
        }),
    );
    const nextId = vi.fn(() => "one-operation-id");
    const write = vi.fn(async () => {});
    const submit = () =>
      gate.run(async () => {
        const helpers = await loadHelpers();
        const operationId = helpers.nextId();
        await helpers.write(operationId);
        return operationId;
      });

    const first = submit();
    const second = await submit();
    expect(second).toEqual({ accepted: false });
    resolveHelpers({ nextId, write });
    expect(await first).toEqual({ accepted: true, value: "one-operation-id" });
    expect(loadHelpers).toHaveBeenCalledTimes(1);
    expect(nextId).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("formats timestamps in a fixed Buenos Aires timezone regardless of server locale", () => {
    expect(formatEpisodeDate("2026-10-06T09:30:00.000Z")).toContain("06:30");
  });

  it("keeps a revoked EFA account's episode history read-only", () => {
    const html = renderToStaticMarkup(
      <EfaEpisodePanel
        initialEpisodes={[episode]}
        initialNotices={[]}
        openOwnGuard={null}
        currentUserId="owner"
        canWrite={false}
        isAdmin={false}
      />,
    );

    expect(html).toContain("2026");
    expect(html).toContain("Borrador");
    expect(html).toContain("Solo lectura");
    expect(html).toContain("Ver llamadas");
    expect(html).toContain("Ver despachos");
    expect(html).toContain("Ver coordinación policial");
    expect(html).toContain("Ver conductas observadas");
    expect(html).not.toContain("Guardar borrador");
  });

  it("shows a generic correction notice without private episode content", () => {
    const html = renderToStaticMarkup(
      <EfaEpisodePanel
        initialEpisodes={[]}
        initialNotices={[
          {
            id: "notice-1",
            episodeId: "episode-1",
            createdAt: "2026-10-06T11:00:00.000Z",
            readAt: null,
          },
        ]}
        openOwnGuard={null}
        currentUserId="owner"
        canWrite={true}
        isAdmin={false}
      />,
    );

    expect(html).toContain("Un administrador corrigió un episodio");
    expect(html).toContain("Marcar como leído");
    expect(html).not.toContain("Calle 123");
  });

  it("explains local queue privacy and blocks submission until storage is ready", () => {
    const html = renderToStaticMarkup(
      <EfaEpisodePanel
        initialEpisodes={[]}
        initialNotices={[]}
        openOwnGuard={{ id: "guard-1", startedAt: "2026-10-06T09:00:00.000Z", endedAt: null }}
        currentUserId="owner"
        canWrite={true}
        isAdmin={false}
      />,
    );

    expect(html).toContain("Preparando el almacenamiento local");
    expect(html).toContain("No es una bóveda segura");
    expect(html).toMatch(/id="episode-event-at"[^>]*disabled=""/);
    expect(html).toMatch(/Guardar borrador<\/button>/);
    expect(html).toMatch(/disabled=""[^>]*>Guardar borrador<\/button>/);
  });
});
