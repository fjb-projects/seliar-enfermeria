import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  buildObservationContext,
  captureObservationNow,
  createObservationConflictGate,
  dispatchObservationRebasedEntry,
  observationCanCreate,
  observationContextSelectionFromPayload,
  observationFrozenOperationMatches,
  observationQueueEntryCanContinue,
  restoreObservationUpdateForm,
  withCurrentEfaWriteAccess,
  EfaObservationPanel,
} from "./EfaObservationPanel";

vi.mock("@tanstack/react-start", () => ({
  createClientOnlyFn: (fn: () => unknown) => fn,
  useServerFn: () => vi.fn(async () => []),
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
vi.mock("@/lib/efa-episodes.functions", () => ({ listEfaEpisodes: vi.fn() }));
vi.mock("@/lib/efa-communications.functions", () => ({ listEfaCommunicationsForEpisode: vi.fn() }));
vi.mock("@/lib/efa-dispatches.functions", () => ({ listEfaDispatchesForEpisode: vi.fn() }));
vi.mock("@/lib/efa-police-coordination.functions", () => ({
  getEfaPoliceCoordination: vi.fn(),
  listEfaPoliceCoordinationsForEpisode: vi.fn(),
}));
vi.mock("@/lib/efa-guards.functions", () => ({
  listActiveEfaGuardBases: vi.fn(),
  listEfaGuards: vi.fn(),
}));

describe("EfaObservationPanel", () => {
  it("constructs only the selected typed context and preserves its guard ancestry", () => {
    const root = { guardId: "guard-1" };
    expect(buildObservationContext(root, { kind: "guard" })).toEqual({
      contextType: "guard",
      guardId: "guard-1",
    });
    expect(
      buildObservationContext(root, {
        kind: "police_event",
        episodeId: "episode-1",
        coordinationId: "coord-1",
        eventId: "event-1",
      }),
    ).toEqual({
      contextType: "police_event",
      guardId: "guard-1",
      episodeId: "episode-1",
      coordinationId: "coord-1",
      policeEventId: "event-1",
    });
  });

  it("captures observed time at the quick-action click instant", () => {
    expect(captureObservationNow(() => new Date("2026-10-07T12:34:56.789Z"))).toBe(
      "2026-10-07T12:34:56.789Z",
    );
  });

  it("allows new captures only for a writable owner while the guard is open", () => {
    expect(observationCanCreate({ canWrite: true, isOwner: true, guardEndedAt: null })).toBe(true);
    expect(observationCanCreate({ canWrite: true, isOwner: true, guardEndedAt: "closed" })).toBe(
      false,
    );
    expect(observationCanCreate({ canWrite: true, isOwner: false, guardEndedAt: null })).toBe(
      false,
    );
    expect(observationCanCreate({ canWrite: false, isOwner: true, guardEndedAt: null })).toBe(
      false,
    );
  });

  it("does not infer write permission from readable guard history and rechecks EFA before queued writes", async () => {
    const verifyCurrentEfa = vi.fn(async () => {
      throw new Error("Se requiere acceso EFA vigente.");
    });
    const write = vi.fn(async () => "sent");

    await expect(
      withCurrentEfaWriteAccess({ canWrite: true, verifyCurrentEfa, write }),
    ).rejects.toThrow(/EFA/i);
    expect(verifyCurrentEfa).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();

    verifyCurrentEfa.mockClear();
    await expect(
      withCurrentEfaWriteAccess({ canWrite: false, verifyCurrentEfa, write }),
    ).rejects.toThrow(/EFA/i);
    expect(verifyCurrentEfa).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("restores typed episode leaves from the frozen queue payload", () => {
    expect(
      observationContextSelectionFromPayload({
        contextType: "police_event",
        guardId: "guard-1",
        episodeId: "episode-1",
        coordinationId: "coord-1",
        policeEventId: "event-1",
      }),
    ).toEqual({
      kind: "police_event",
      episodeId: "episode-1",
      coordinationId: "coord-1",
      eventId: "event-1",
    });
    expect(
      observationContextSelectionFromPayload({ contextType: "dispatch", episodeId: "e" }),
    ).toBeNull();
  });

  it("keeps the restored operation retryable without enabling another entry", () => {
    const selected = {
      actorUserId: "owner",
      currentUserId: "owner",
      contextKey: "episode:e1",
      currentContextKey: "episode:e1",
      operationId: "op-a",
      pendingOperationId: "op-a",
      status: "pending" as const,
      busy: false,
    };
    expect(observationQueueEntryCanContinue(selected)).toBe(true);
    expect(observationQueueEntryCanContinue({ ...selected, operationId: "op-b" })).toBe(false);
    expect(observationQueueEntryCanContinue({ ...selected, busy: true })).toBe(false);
    expect(observationQueueEntryCanContinue({ ...selected, status: "paused-conflict" })).toBe(
      false,
    );
    expect(observationQueueEntryCanContinue({ ...selected, pendingOperationId: "op-b" })).toBe(
      false,
    );
    expect(
      observationQueueEntryCanContinue({ ...selected, status: "confirmed-cleanup-failed" }),
    ).toBe(true);
  });

  it("retries only the same frozen operation after initial local persistence fails", () => {
    const operation = {
      actorUserId: "owner",
      currentUserId: "owner",
      contextKey: "episode:e1",
      currentContextKey: "episode:e1",
      operationId: "op-a",
      selectedOperationId: "op-a",
      canWrite: true,
    };
    expect(observationFrozenOperationMatches(operation)).toBe(true);
    expect(observationFrozenOperationMatches({ ...operation, selectedOperationId: "op-b" })).toBe(
      false,
    );
    expect(observationFrozenOperationMatches({ ...operation, canWrite: false })).toBe(false);
    expect(observationFrozenOperationMatches({ ...operation, currentUserId: "other" })).toBe(false);
  });

  it("serializes concurrent conflict resolution and reserves one replacement operation", async () => {
    const gate = createObservationConflictGate();
    let release!: () => void;
    const wait = new Promise<void>((resolve) => (release = resolve));
    const newId = vi.fn(() => "replacement-1");
    const persist = vi.fn(async (id: string) => id);
    const resolve = () =>
      gate.run(async () => {
        await wait;
        return persist(newId());
      });

    const first = resolve();
    const second = resolve();
    release();
    const secondOutcome = await second;
    expect(await first).toEqual({ accepted: true, value: "replacement-1" });
    expect(secondOutcome.accepted).toBe(false);
    expect(newId).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledOnce();
  });

  it("dispatches a kept conflict rebase under its already-held lock exactly once", async () => {
    const busy = true;
    const entry = { operationId: "replacement-1" } as never;
    const send = vi.fn(async (_entry: unknown, lockHeld = false) => {
      if (busy && !lockHeld) return "blocked";
      return "sent";
    });

    await expect(dispatchObservationRebasedEntry(entry, send)).resolves.toBe("sent");
    expect(send).toHaveBeenNthCalledWith(1, entry, true);
    await expect(send(entry, false)).resolves.toBe("blocked");
    expect(send).toHaveBeenNthCalledWith(2, entry, false);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("restores nullable patch fields distinctly from omitted fields", () => {
    const current = {
      catalogItemKey: "record.complete_fields",
      classification: "adequate" as const,
      otherDescription: "Descripción actual",
      otherGroup: "record" as const,
      comment: "Comentario actual",
      observedAt: "2026-10-07T12:34:56.789",
    };
    expect(
      restoreObservationUpdateForm(current, { comment: null, observedAt: null }),
    ).toMatchObject({
      comment: "",
      observedAt: "",
      otherDescription: "Descripción actual",
    });
    expect(restoreObservationUpdateForm(current, {})).toEqual(current);
    expect(restoreObservationUpdateForm(current, { otherDescription: null })).toMatchObject({
      otherDescription: "",
      comment: "Comentario actual",
      observedAt: current.observedAt,
    });
    expect(restoreObservationUpdateForm(current, { otherDescription: undefined })).toEqual(current);
  });

  it("renders a readable optional observation history panel without a forced questionnaire", () => {
    const html = renderToStaticMarkup(
      <EfaObservationPanel
        root={{ guardId: "guard-1", episodeId: "episode-1" }}
        title="Conductas observadas"
        currentUserId="owner"
        canWrite={false}
        isAdmin={false}
      />,
    );
    expect(html).toContain("Conductas observadas");
    expect(html).toContain("Solo lectura");
    expect(html).not.toContain("Enviar evaluación completa");
  });
});
