import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  createEpisodeSubmissionGate,
  applyAfterEpisodeNavigationStable,
  canAutoOpenInitialCallAfterRefresh,
  canBeginNewService,
  episodeFormTitle,
  episodeSaveActionLabel,
  hasFirstCallCreateIntent,
  resolvePostCreateState,
  EfaEpisodePanel,
  formatEpisodeDate,
  type EpisodeView,
} from "./EfaEpisodePanel";

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
vi.mock("@/lib/auth.functions", () => ({ readSession: vi.fn() }));
vi.mock("@/lib/efa-episodes.functions", () => ({
  closeEfaEpisode: vi.fn(),
  cancelEfaEpisode: vi.fn(),
  reactivateEfaEpisode: vi.fn(),
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
vi.mock("@/lib/efa-institutions.functions", () => ({
  createEfaInstitutionInline: vi.fn(),
  listEfaInstitutions: vi.fn(),
}));
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

  it("restores first-call intent only from the frozen paired incoming payload", () => {
    expect(hasFirstCallCreateIntent({ childCreateKey: "child-key", direction: "incoming" })).toBe(
      true,
    );
    expect(hasFirstCallCreateIntent({})).toBe(false);
    expect(hasFirstCallCreateIntent({ childCreateKey: "child-key" })).toBe(false);
  });

  it("does not apply an automatic continuation after navigation changes during refresh", async () => {
    let resolveRefresh!: (value: "refreshed") => void;
    const refresh = new Promise<"refreshed">((resolve) => {
      resolveRefresh = resolve;
    });
    let navigationRevision = 4;
    let autoOpened = false;
    let continuationAvailable = false;
    const apply = applyAfterEpisodeNavigationStable(
      refresh,
      4,
      () => navigationRevision,
      () => {
        autoOpened = true;
      },
    );

    navigationRevision += 1;
    continuationAvailable = true;
    resolveRefresh("refreshed");

    await expect(apply).resolves.toBe(false);
    expect(autoOpened).toBe(false);
    expect(continuationAvailable).toBe(true);
  });

  it("allows the selected create after refresh clears its expected pending operation", () => {
    const eligibility = {
      navigationStayedStable: true,
      hasContinuation: true,
      syncEditor: true,
      activeOwnerMatches: true,
      guardMatches: true,
      selectedOperationId: "create-op",
      pendingOperationId: "create-op",
      expectedOperationId: "create-op",
      intentMatches: true,
      formMatches: true,
    };

    expect(canAutoOpenInitialCallAfterRefresh(eligibility)).toBe(true);
    expect(canAutoOpenInitialCallAfterRefresh({ ...eligibility, pendingOperationId: null })).toBe(
      true,
    );
    expect(
      canAutoOpenInitialCallAfterRefresh({ ...eligibility, pendingOperationId: "another-op" }),
    ).toBe(false);
    expect(
      canAutoOpenInitialCallAfterRefresh({ ...eligibility, selectedOperationId: "another-op" }),
    ).toBe(false);
  });

  it("keeps a revoked EFA account's active-guard services read-only", () => {
    const html = renderToStaticMarkup(
      <EfaEpisodePanel
        initialEpisodes={[episode]}
        initialNotices={[]}
        openOwnGuard={{ id: "guard-1", startedAt: "2026-10-06T09:00:00.000Z", endedAt: null }}
        currentUserId="owner"
        canWrite={false}
        isAdmin={false}
      />,
    );

    expect(html).toContain("2026");
    expect(html).toContain("Activo");
    expect(html).toContain("Solo lectura");
    expect(html).toContain("Servicios de esta guardia");
    expect(html).toContain("Guardia propia abierta desde");
    expect(
      html.match(/Solo se muestran servicios de la guardia abierta; no es el historial completo/g),
    ).toHaveLength(1);
    expect(html).toContain("/guardia-efa");
    expect(html).not.toContain("Historial de episodios");
    expect(html).toContain("Abrir área");
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
        openOwnGuard={{ id: "guard-1", startedAt: "2026-10-06T09:00:00.000Z", endedAt: null }}
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
    expect(html).toContain("se guardan en IndexedDB legible por este origen");
    expect(html).toContain("Nuevo servicio");
    expect(html).not.toContain("Nuevo episodio");
    expect(html).toMatch(/id="episode-event-at"[^>]*disabled=""/);
    expect(html).toContain("Registrar primera llamada");
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/);
    expect(html).toMatch(/disabled=""[^>]*>Abrir servicio y registrar llamada<\/button>/);
    expect(episodeSaveActionLabel(false, false)).toBe("Abrir servicio");
    expect(episodeSaveActionLabel(true, true)).toBe("Guardar cambios");
  });

  it("limits the visible workspace to the open guard and exposes explicit closure", () => {
    const editable = { ...episode, canEdit: true };
    const older = { ...editable, id: "older", eventAt: "2026-10-05T09:30:00.000Z" };
    const closed = { ...editable, id: "closed", state: "closed" as const };
    const foreign = { ...editable, id: "foreign", originGuardId: "guard-other" };
    const html = renderToStaticMarkup(
      <EfaEpisodePanel
        initialEpisodes={[older, closed, foreign, editable]}
        initialNotices={[]}
        openOwnGuard={{ id: "guard-1", startedAt: "2026-10-06T09:00:00.000Z", endedAt: null }}
        currentUserId="owner"
        canWrite={true}
        isAdmin={false}
      />,
    );

    expect(html).toContain("Cerrar servicio");
    expect(html).toContain("Cerrado");
    expect(html).toContain("Servicios de esta guardia");
    expect(html).toContain("Volver a mi guardia EFA");
    expect(html).not.toContain("Historial de episodios");
    expect(html).not.toContain("Área de trabajo abierta");
    expect(html).toMatch(/<button(?=[^>]*bg-sky-50)[^>]*>[\s\S]*?Abrir área[\s\S]*?<\/button>/);
    expect(html).toMatch(
      /<button(?=[^>]*bg-slate-100)[^>]*>[\s\S]*?Cerrar servicio[\s\S]*?<\/button>/,
    );
    const compactSummary = html.match(/<article[\s\S]*?<details/)?.[0] ?? "";
    expect(compactSummary).toContain("Activo");
    expect(compactSummary).toContain("Servicio");
    expect(compactSummary).toContain("Hecho 6/10/2026, 06:30:00");
    expect(compactSummary).not.toContain("Capturado");
    expect(compactSummary).not.toContain("Ver historial");
    expect(compactSummary).not.toContain("Editar");
    const details = html.match(
      /<details[^>]*>[\s\S]*?<summary[^>]*>[\s\S]*?Ver detalles[\s\S]*?<\/summary>([\s\S]*?)<\/details>/,
    )?.[1];
    expect(details).toBeDefined();
    expect(details).toContain("Ver historial");
    expect(details).toContain("Editar");
    expect(details).toContain("versión 1");
    expect(html).not.toContain("foreign");
    expect(html.indexOf("Activo")).toBeLessThan(html.indexOf("Cerrado"));
    expect(html).toContain("Hecho 6/10/2026, 06:30:00");
    expect(html).not.toContain("Episodio del");
    expect(html).toContain("Abrir servicio y registrar llamada");
    expect(html).not.toContain("Dejar de editar");
  });

  it("resets the form to a blank new service after a confirmed create, with or without a first call", () => {
    const base = { operationKind: "create" as const, syncEditor: true, cleanupFailed: false };
    expect(resolvePostCreateState({ ...base, hasContinuation: true })).toEqual({
      exposeContinuation: true,
      resetForm: true,
    });
    expect(resolvePostCreateState({ ...base, hasContinuation: false })).toEqual({
      exposeContinuation: false,
      resetForm: true,
    });
  });

  it("keeps the frozen form when the confirmed write could not be cleaned from the local queue", () => {
    expect(
      resolvePostCreateState({
        operationKind: "create",
        syncEditor: true,
        cleanupFailed: true,
        hasContinuation: true,
      }),
    ).toEqual({ exposeContinuation: true, resetForm: false });
  });

  it("never resets or continues for updates, closes or operations the editor no longer shows", () => {
    for (const operationKind of ["update", "close"] as const) {
      expect(
        resolvePostCreateState({
          operationKind,
          syncEditor: true,
          cleanupFailed: false,
          hasContinuation: false,
        }),
      ).toEqual({ exposeContinuation: false, resetForm: false });
    }
    expect(
      resolvePostCreateState({
        operationKind: "create",
        syncEditor: false,
        cleanupFailed: false,
        hasContinuation: true,
      }),
    ).toEqual({ exposeContinuation: false, resetForm: false });
  });

  it("only starts a new service from a selected service when storage is ready and nothing is pending", () => {
    const ready = { queueReady: true, queueAvailable: true, pending: false, hasSelection: true };
    expect(canBeginNewService(ready)).toBe(true);
    expect(canBeginNewService({ ...ready, hasSelection: false })).toBe(false);
    expect(canBeginNewService({ ...ready, pending: true })).toBe(false);
    expect(canBeginNewService({ ...ready, queueReady: false })).toBe(false);
    expect(canBeginNewService({ ...ready, queueAvailable: false })).toBe(false);
  });

  it("titles the form as a new service or as the edited version", () => {
    expect(episodeFormTitle(null)).toBe("Nuevo servicio");
    expect(episodeFormTitle({ version: 3 })).toBe("Editar servicio · versión 3");
  });

  it("keeps the service summary closed and never renders raw version JSON before it is requested", () => {
    const html = renderToStaticMarkup(
      <EfaEpisodePanel
        initialEpisodes={[{ ...episode, canEdit: true }]}
        initialNotices={[]}
        openOwnGuard={{ id: "guard-1", startedAt: "2026-10-06T09:00:00.000Z", endedAt: null }}
        currentUserId="owner"
        canWrite={true}
        isAdmin={false}
      />,
    );

    expect(html).toContain("Ver historial");
    expect(html).not.toContain("Resumen del servicio");
    expect(html).not.toContain("Historial y versiones");
    expect(html).not.toContain("Antes");
    expect(html).not.toContain("Después");
    expect(html).not.toContain("{&quot;");
    expect(html).not.toContain("Cargando…");
  });

  it("keeps a cancelled episode visible and read-only while offering reactivation", () => {
    const cancelled = {
      ...episode,
      cancelledAt: "2026-10-07T11:00:00.000Z",
      cancelledFromState: "closed" as const,
      state: "closed" as const,
      canEdit: false,
      canManage: true,
    };
    const html = renderToStaticMarkup(
      <EfaEpisodePanel
        initialEpisodes={[cancelled]}
        initialNotices={[]}
        openOwnGuard={{ id: "guard-1", startedAt: "2026-10-06T09:00:00.000Z", endedAt: null }}
        currentUserId="owner"
        canWrite={true}
        isAdmin={false}
      />,
    );
    expect(html).toContain("Anulado · Cerrado");
    const compactSummary = html.match(/<article[\s\S]*?<details/)?.[0] ?? "";
    expect(compactSummary).not.toContain("Reactivar episodio");
    const details = html.match(
      /<details[^>]*>[\s\S]*?<summary[^>]*>[\s\S]*?Ver detalles[\s\S]*?<\/summary>([\s\S]*?)<\/details>/,
    )?.[1];
    expect(details).toContain("Reactivar episodio");
    expect(details).toContain("Capturado");
    expect(html).not.toContain("Editar episodio");
  });
});
