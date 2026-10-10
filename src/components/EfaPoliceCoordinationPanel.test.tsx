import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  capturePoliceNow,
  completePoliceQueueOutcome,
  acknowledgePoliceCoordinationSave,
  EfaPoliceCoordinationPanel,
  mergePoliceMutationResult,
  policeEventRequiresDispatch,
  policeQueueContextAllows,
  resolvePoliceCreateCleanup,
  restorePoliceEventDraft,
} from "./EfaPoliceCoordinationPanel";

vi.mock("@tanstack/react-start", () => ({
  createClientOnlyFn: (fn: () => unknown) => fn,
  useServerFn: () => vi.fn(async () => []),
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
vi.mock("@/lib/efa-episodes.functions", () => ({ getEfaEpisode: vi.fn() }));
vi.mock("@/lib/efa-dispatches.functions", () => ({ listEfaDispatchesForEpisode: vi.fn() }));

describe("EfaPoliceCoordinationPanel", () => {
  const coordinationForm = (notes: string) => ({
    initiator: "central" as const,
    initiatingDispatchId: "",
    placeType: "incident" as const,
    meetingReference: "",
    notes,
  });

  it("explains that police support can start early and dispatches can be associated later", () => {
    const html = renderToStaticMarkup(
      <EfaPoliceCoordinationPanel
        episodeId="episode-1"
        episodeLabel="Episodio de prueba"
        currentUserId="owner"
        canWrite={true}
        episodeCanEdit={true}
      />,
    );

    expect(html).toContain(
      "Puede iniciar una coordinación antes de registrar una llamada o un despacho.",
    );
    expect(html).toContain(
      "Más adelante podrá asociar los despachos de este episodio, incluso si siguen como borrador.",
    );
  });

  it("keeps all three coordination steps available from compact navigation", () => {
    const html = renderToStaticMarkup(
      <EfaPoliceCoordinationPanel
        episodeId="episode-1"
        episodeLabel="Episodio de prueba"
        currentUserId="owner"
        canWrite={true}
        episodeCanEdit={true}
      />,
    );

    expect(html).toContain("Ver pasos");
    expect(html).toContain('aria-label="Ir a Datos"');
    expect(html).toContain('aria-label="Ir a Despachos"');
    expect(html).toContain('aria-label="Ir a Eventos e historial"');
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  });

  it("places the coordination step controls after the Datos fields", () => {
    const html = renderToStaticMarkup(
      <EfaPoliceCoordinationPanel
        episodeId="episode-1"
        episodeLabel="Episodio de prueba"
        currentUserId="owner"
        canWrite={true}
        episodeCanEdit={true}
      />,
    );

    expect(html.indexOf("Iniciador")).toBeLessThan(html.indexOf("Ver pasos"));
    expect(html.indexOf("Ver pasos")).toBeLessThan(html.indexOf(">Anterior</button>"));
    expect(html.match(/aria-label="Pasos de coordinación"/g)).toHaveLength(1);
  });

  it("clears only the coordination fields included in a confirmed save", () => {
    expect(
      acknowledgePoliceCoordinationSave(
        { coordination: true, dispatches: true },
        { kind: "dispatches", payload: { dispatchIds: ["dispatch-1"] } },
        { form: coordinationForm("unsaved note"), dispatchIds: ["dispatch-1"] },
      ),
    ).toEqual({ coordination: true, dispatches: false });
  });

  it("clears only the association fields included in a confirmed save", () => {
    expect(
      acknowledgePoliceCoordinationSave(
        { coordination: true, dispatches: true },
        {
          kind: "update",
          payload: {
            initiator: "central",
            initiatingDispatchId: null,
            placeType: "incident",
            meetingReference: null,
            notes: "saved note",
          },
        },
        { form: coordinationForm("saved note"), dispatchIds: ["unsaved-dispatch"] },
      ),
    ).toEqual({ coordination: false, dispatches: true });
  });

  it("keeps the submitted area dirty when it changed after the queued snapshot", () => {
    expect(
      acknowledgePoliceCoordinationSave(
        { coordination: false, dispatches: false },
        {
          kind: "update",
          payload: {
            initiator: "central",
            initiatingDispatchId: null,
            placeType: "incident",
            meetingReference: null,
            notes: "submitted",
          },
        },
        { form: coordinationForm("edited while saving"), dispatchIds: [] },
      ),
    ).toEqual({ coordination: true, dispatches: false });
  });

  it("releases only the matching editor after queue cleanup without changing drafts", () => {
    const state = {
      ownerUserId: "owner",
      episodeId: "episode-1",
      selectedId: "coord-2",
      pendingOperationId: "op-b",
      coordinationDirty: true,
      dispatchesDirty: true,
      entries: [
        { ownerUserId: "owner", episodeId: "episode-1", entityId: "coord-1", operationId: "op-a" },
        { ownerUserId: "owner", episodeId: "episode-1", entityId: "coord-2", operationId: "op-b" },
      ],
    };
    expect(
      completePoliceQueueOutcome(state, {
        status: "cleaned",
        entry: {
          ownerUserId: "owner",
          episodeId: "episode-1",
          entityId: "coord-1",
          operationId: "op-a",
        },
      }),
    ).toEqual({
      ...state,
      entries: [state.entries[1]],
      completedCreate: false,
    });
    expect(
      completePoliceQueueOutcome(state, {
        status: "cleaned",
        entry: {
          ownerUserId: "owner",
          episodeId: "episode-1",
          entityId: "coord-2",
          operationId: "op-b",
        },
      }),
    ).toMatchObject({ pendingOperationId: "", coordinationDirty: true, dispatchesDirty: true });
  });

  it("unlocks only a restored confirmed create after cleanup and does not leave a duplicate draft", () => {
    const createEntry = {
      ownerUserId: "owner",
      episodeId: "episode-1",
      entityId: "create:key-a",
      operationId: "op-a",
      kind: "create",
      payload: { clientCreationKey: "key-a" },
    };
    const state = {
      ownerUserId: "owner",
      episodeId: "episode-1",
      selectedId: "",
      pendingOperationId: "op-a",
      coordinationDirty: false,
      dispatchesDirty: false,
      entries: [createEntry],
    };
    expect(
      completePoliceQueueOutcome(state, { status: "cleaned", entry: createEntry }),
    ).toMatchObject({ entries: [], pendingOperationId: "", completedCreate: true });
    expect(
      completePoliceQueueOutcome(
        { ...state, selectedId: "coord-b", pendingOperationId: "op-b" },
        { status: "cleaned", entry: createEntry },
      ),
    ).toMatchObject({ selectedId: "coord-b", pendingOperationId: "op-b", completedCreate: false });
    expect(resolvePoliceCreateCleanup(createEntry, [])).toEqual({ kind: "clear" });
    expect(
      resolvePoliceCreateCleanup(createEntry, [
        {
          id: "coord-a",
          episodeId: "episode-1",
          ownerUserId: "owner",
          clientCreationKey: "key-a",
          initiator: "central",
          initiatingDispatchId: null,
          placeType: "incident",
          meetingReference: null,
          notes: null,
          state: "draft",
          version: 1,
          createdAt: "2026-10-07T00:00:00.000Z",
          updatedAt: "2026-10-07T00:00:00.000Z",
          canEdit: true,
          dispatchIds: [],
          events: [],
        },
      ]),
    ).toMatchObject({ kind: "adopt", record: { id: "coord-a" } });
  });

  it("normalizes the actual mutation DTO while preserving prior events", () => {
    const current = {
      id: "coord-1",
      episodeId: "episode-1",
      ownerUserId: "owner",
      clientCreationKey: "key",
      initiator: "central" as const,
      initiatingDispatchId: null,
      placeType: "incident" as const,
      meetingReference: null,
      notes: null,
      state: "draft" as const,
      version: 3,
      createdAt: "2026-10-07T00:00:00.000Z",
      updatedAt: "2026-10-07T00:00:00.000Z",
      canEdit: true,
      dispatchIds: ["dispatch-1"],
      events: [],
    };
    const ackEvent = {
      id: "event-1",
      coordinationId: "coord-1",
      episodeId: "episode-1",
      ownerUserId: "owner",
      dispatchId: null,
      actorUserId: "owner",
      clientEventId: "event-key",
      kind: "request" as const,
      occurredAt: null,
      timeStatus: "not_observed" as const,
      note: null,
      version: 1,
      createdAt: "2026-10-07T00:00:00.000Z",
      updatedAt: "2026-10-07T00:00:00.000Z",
    };
    const merged = mergePoliceMutationResult(current, {
      coordination: { ...current, version: 4 },
      event: ackEvent,
    });
    expect(merged.version).toBe(4);
    expect(merged.events).toEqual([ackEvent]);
  });

  it("restores partial event payloads without inventing an observed time", () => {
    expect(
      restorePoliceEventDraft({
        kind: "waiting",
        dispatchId: "dispatch-1",
        note: "En espera",
        timeStatus: "not_observed",
      }),
    ).toMatchObject({
      kind: "waiting",
      dispatchId: "dispatch-1",
      occurredAt: "",
      timeStatus: "not_observed",
      note: "En espera",
    });
  });

  it("checks mobile-event dispatch linkage and current queue context", () => {
    expect(policeEventRequiresDispatch("actual_meeting")).toBe(true);
    expect(policeEventRequiresDispatch("request")).toBe(false);
    const entry = {
      ownerUserId: "owner",
      episodeId: "episode-1",
      entityId: "coord-1",
      kind: "update",
    };
    const current = {
      entry,
      ownerUserId: "owner",
      episodeId: "episode-1",
      selectedEntityId: "coord-1",
      canWrite: true,
      episodeCanEdit: true,
      entityCanEdit: true,
    };
    expect(policeQueueContextAllows(current)).toBe(true);
    expect(policeQueueContextAllows({ ...current, selectedEntityId: "other" })).toBe(false);
    expect(policeQueueContextAllows({ ...current, entityCanEdit: false })).toBe(false);
    expect(policeQueueContextAllows({ ...current, canWrite: false })).toBe(false);
  });

  it("captures quick time at the supplied click instant with millisecond precision", () => {
    expect(capturePoliceNow(() => new Date("2026-10-07T12:34:56.789Z"))).toBe(
      "2026-10-07T12:34:56.789Z",
    );
  });

  it("keeps own coordination history readable without current EFA write access", () => {
    const html = renderToStaticMarkup(
      <EfaPoliceCoordinationPanel
        episodeId="episode-1"
        episodeLabel="Episodio de prueba"
        currentUserId="owner"
        canWrite={false}
        episodeCanEdit={false}
      />,
    );
    expect(html).toContain("Apoyo policial");
    expect(html).toContain("Solo lectura");
    expect(html).not.toContain("Nueva coordinación");
  });
});
