import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  canCreateCommunication,
  communicationStateLabel,
  canEditCommunication,
  communicationLifecycleAction,
  communicationSteps,
  communicationStepResolution,
  createCommunicationSubmissionGate,
  canSelectInitialCommunication,
  canFocusInitialCallHeading,
  shouldShowCommunicationEditor,
  newCallStartedAtPrefill,
  CommunicationServiceEcho,
  CommunicationActionRow,
  communicationReviewLines,
  communicationFinalizeActions,
  communicationFinalizeConfirmation,
  shouldContinueToDispatches,
  EfaCommunicationStepper,
  resolveCommunicationRestore,
  communicationAutosaveConditions,
  shouldCreateDraftOnNext,
  mergeConfirmedCommunication,
  communicationSaveStatus,
  communicationFieldsEditable,
  communicationHasUnsavedInput,
  type CommunicationFormValue,
} from "./EfaCommunicationStepper";
import { EfaAutosaveStatus } from "./EfaAutosaveStatus";
import { createSaveSnapshot, shouldAutosave } from "@/lib/efa-autosave";

describe("EfaCommunicationStepper", () => {
  it("keeps unresolved and optional fields neutral until they are observed or explicitly reviewed", () => {
    expect(
      communicationStepResolution({
        directionPresent: false,
        directionReviewed: false,
        startedAt: "",
        startedAtReviewed: false,
        endedAt: "",
        endedAtReviewed: false,
        priority: "",
        finalized: false,
      }),
    ).toEqual([false, false, false, false, false]);

    expect(
      communicationStepResolution({
        directionPresent: true,
        directionReviewed: false,
        startedAt: "",
        startedAtReviewed: true,
        endedAt: "2026-10-08T14:00",
        endedAtReviewed: false,
        priority: "red",
        finalized: false,
      }),
    ).toEqual([true, true, true, true, false]);
  });

  it("only auto-selects a first call while its original editor target remains untouched", () => {
    const base = {
      targetOperationId: "episode-create-1",
      activeTargetOperationId: "episode-create-1",
      targetCommunicationId: "call-1",
      activeTargetCommunicationId: "call-1",
      selectedCommunicationId: null,
      selectedOperationId: "",
      dirty: false,
      hasPendingOperation: false,
      busy: false,
      selectionClaimed: false,
      currentRevision: 0,
      expectedRevision: 0,
    };
    expect(canSelectInitialCommunication(base)).toBe(true);
    expect(canSelectInitialCommunication({ ...base, selectedCommunicationId: "call-2" })).toBe(
      false,
    );
    expect(canSelectInitialCommunication({ ...base, dirty: true })).toBe(false);
    expect(canSelectInitialCommunication({ ...base, activeTargetCommunicationId: "call-2" })).toBe(
      false,
    );
    expect(
      canSelectInitialCommunication({ ...base, activeTargetOperationId: "episode-create-2" }),
    ).toBe(false);
    expect(canSelectInitialCommunication({ ...base, currentRevision: 1 })).toBe(false);
    expect(canSelectInitialCommunication({ ...base, hasPendingOperation: true })).toBe(false);
    expect(canSelectInitialCommunication({ ...base, selectionClaimed: true })).toBe(false);
  });

  it("focuses the initial call heading only while its successful selection is still current", () => {
    const focus = {
      hasPendingFocus: true,
      selectionClaimed: true,
      selectedCommunicationId: "call-1",
      targetCommunicationId: "call-1",
      currentRevision: 3,
      expectedRevision: 3,
    };

    expect(canFocusInitialCallHeading(focus)).toBe(true);
    expect(canFocusInitialCallHeading({ ...focus, currentRevision: 4 })).toBe(false);
    expect(canFocusInitialCallHeading({ ...focus, selectedCommunicationId: "call-2" })).toBe(false);
    expect(canFocusInitialCallHeading({ ...focus, hasPendingFocus: false })).toBe(false);
  });

  it("labels only actual drafts as pending completion", () => {
    expect(communicationStateLabel("draft")).toBe("Borrador · pendiente de completar");
    expect(communicationStateLabel("finalized")).toBe("Finalizada");
    expect(communicationStateLabel("cancelled")).toBe("Anulada");
  });

  it("keeps a frozen failed create visible for same-operation storage recovery", () => {
    expect(
      shouldShowCommunicationEditor({
        hasSelectedCall: false,
        canEditSelected: false,
        dirty: true,
        canCreateCall: false,
        pendingCreateRecovery: true,
      }),
    ).toBe(true);
    expect(
      shouldShowCommunicationEditor({
        hasSelectedCall: false,
        canEditSelected: false,
        dirty: true,
        canCreateCall: false,
        pendingCreateRecovery: false,
      }),
    ).toBe(false);
  });

  it("requires both current EFA access and the latest record permission to edit", () => {
    const serverDenied = { canEdit: false };
    expect(canEditCommunication(true, serverDenied)).toBe(false);
    expect(canEditCommunication(false, { canEdit: true })).toBe(false);
    expect(canEditCommunication(true, { canEdit: true })).toBe(true);
    expect(canCreateCommunication(true, false)).toBe(false);
    expect(canCreateCommunication(true, true)).toBe(true);
  });

  it("offers reactivation only for cancelled communications and cancellation otherwise", () => {
    expect(communicationLifecycleAction("draft")).toBe("cancel");
    expect(communicationLifecycleAction("finalized")).toBe("cancel");
    expect(communicationLifecycleAction("cancelled")).toBe("reactivate");
  });
  it("renders five accessible step names and marks only the active step", () => {
    const html = renderToStaticMarkup(
      <EfaCommunicationStepper
        step={2}
        resolvedSteps={[true, false, true, false, false]}
        onStepChange={vi.fn()}
      >
        <p>Fin real opcional</p>
      </EfaCommunicationStepper>,
    );

    expect(communicationSteps).toHaveLength(5);
    expect(html).toContain("Paso 3 de 5: Fin real");
    expect(html).toContain('aria-label="Progreso de la llamada"');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('id="communication-step-heading" tabindex="-1"');
    expect(html).toContain('aria-label="Ir al paso 3: Fin real, completado"');
    expect(html).toContain("min-h-11");
    expect(html).toContain("Fin real opcional");
  });

  it("renders explicit previous and next controls without gesture-only navigation", () => {
    const html = renderToStaticMarkup(
      <EfaCommunicationStepper
        step={0}
        resolvedSteps={[false, false, false, false, false]}
        onStepChange={vi.fn()}
      >
        <p>Dirección</p>
      </EfaCommunicationStepper>,
    );

    expect(html).toContain("disabled");
    expect(html).toContain("Paso anterior");
    expect(html).toContain("Siguiente paso");
    expect(html.indexOf("Dirección</p>")).toBeLessThan(html.indexOf("Paso anterior"));
  });

  it("names the first step after the call type instead of an address-like word", () => {
    expect(communicationSteps[0]).toBe("Tipo de llamada");
    expect(communicationSteps).not.toContain("Dirección");
  });

  it("keeps a single neutral previous control on the last step", () => {
    const html = renderToStaticMarkup(
      <EfaCommunicationStepper
        step={4}
        resolvedSteps={[true, true, true, true, false]}
        onStepChange={vi.fn()}
      >
        <p>Revisión</p>
      </EfaCommunicationStepper>,
    );
    expect(html).toContain("Paso anterior");
    expect(html).not.toContain("Siguiente");
    expect(html).not.toContain('disabled=""');
    expect(html).toContain("border-input");
    expect(html).not.toContain("bg-indigo");
  });

  it("uses the same neutral outline for previous and next on middle steps", () => {
    const html = renderToStaticMarkup(
      <EfaCommunicationStepper
        step={2}
        resolvedSteps={[true, true, false, false, false]}
        onStepChange={vi.fn()}
      >
        <p>Fin</p>
      </EfaCommunicationStepper>,
    );
    const buttons = html.match(/<button[^>]*aria-label="(Paso anterior|Siguiente paso)"[^>]*>/g);
    expect(buttons).toHaveLength(2);
    expect(buttons?.every((tag) => tag.includes("border-input"))).toBe(true);
    expect(buttons?.some((tag) => tag.includes("bg-primary") || tag.includes("bg-indigo"))).toBe(
      false,
    );
    expect(buttons?.every((tag) => tag.includes("bg-background"))).toBe(true);
  });

  it("summarizes the review with the call type and human dates in Buenos Aires time", () => {
    expect(
      communicationReviewLines({
        direction: "incoming",
        startedAt: "2026-10-14T16:32:00.000Z",
        endedAt: "",
        priority: "red",
      }),
    ).toEqual([
      "Tipo de llamada: Entrante",
      "Inicio real: 14/10/2026 13:32",
      "Fin real: Sin registrar",
      "Prioridad: Roja",
    ]);
    const outgoing = communicationReviewLines({
      direction: "outgoing",
      startedAt: "",
      endedAt: "2026-10-14T17:05:00.000Z",
      priority: "",
    });
    expect(outgoing[0]).toBe("Tipo de llamada: Saliente");
    expect(outgoing[1]).toBe("Inicio real: Sin registrar");
    expect(outgoing[2]).toBe("Fin real: 14/10/2026 14:05");
    expect(outgoing.join(" ")).not.toContain("T17:05");
    expect(outgoing.join(" ")).not.toContain("Dirección");
  });

  it("echoes the service time and private address as read-only text", () => {
    const html = renderToStaticMarkup(
      <CommunicationServiceEcho
        episode={{ eventAt: "2026-10-06T09:30:00.000Z", address: "Calle 123, piso 2" }}
      />,
    );
    expect(html).toContain("Servicio: 06/10/2026 06:30");
    expect(html).toContain("Dirección del servicio: Calle 123, piso 2");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<button");
  });

  it("omits the address part when it is empty and renders nothing without a valid service time", () => {
    const withoutAddress = renderToStaticMarkup(
      <CommunicationServiceEcho episode={{ eventAt: "2026-10-06T09:30:00.000Z", address: "  " }} />,
    );
    expect(withoutAddress).toContain("Servicio: 06/10/2026 06:30");
    expect(withoutAddress).not.toContain("Dirección del servicio");
    expect(renderToStaticMarkup(<CommunicationServiceEcho />)).toBe("");
    expect(
      renderToStaticMarkup(
        <CommunicationServiceEcho episode={{ eventAt: "nope", address: "x" }} />,
      ),
    ).toBe("");
  });

  it("prefills the start of a new call only from a valid service time", () => {
    expect(newCallStartedAtPrefill({ eventAt: "2026-10-06T09:30:00.000Z", address: null })).toBe(
      "2026-10-06T09:30:00.000Z",
    );
    expect(newCallStartedAtPrefill({ eventAt: "nope", address: null })).toBeNull();
    expect(newCallStartedAtPrefill(undefined)).toBeNull();
  });

  it("treats a prefilled start time as present without requiring an explicit review", () => {
    expect(
      communicationStepResolution({
        directionPresent: false,
        directionReviewed: false,
        startedAt: "2026-10-06T06:30:00.000",
        startedAtReviewed: false,
        endedAt: "",
        endedAtReviewed: false,
        priority: "",
        finalized: false,
      }),
    ).toEqual([false, true, false, false, false]);
  });

  describe("finalize and continue to dispatches", () => {
    it("offers the finalize actions only on the review step of a draft call", () => {
      expect(
        communicationFinalizeActions({ step: 4, state: "draft", hasContinueHandler: true }),
      ).toEqual({ finalize: true, finalizeAndContinue: true });
      expect(
        communicationFinalizeActions({ step: 4, state: "draft", hasContinueHandler: false }),
      ).toEqual({ finalize: true, finalizeAndContinue: false });
      for (const state of ["finalized", "cancelled", undefined] as const) {
        expect(communicationFinalizeActions({ step: 4, state, hasContinueHandler: true })).toEqual({
          finalize: false,
          finalizeAndContinue: false,
        });
      }
      expect(
        communicationFinalizeActions({ step: 3, state: "draft", hasContinueHandler: true }),
      ).toEqual({ finalize: false, finalizeAndContinue: false });
    });

    it("words each confirmation precisely for what it does", () => {
      expect(communicationFinalizeConfirmation("finalize-and-continue")).toEqual({
        title: "Finalizar la llamada y pasar a Despacho",
        description:
          "Vas a finalizar los datos de la llamada y pasar a la sección de despacho de ambulancia.",
        confirmLabel: "Finalizar y pasar a Despachos",
      });
      const plain = communicationFinalizeConfirmation("finalize");
      expect(plain.confirmLabel).toBe("Finalizar llamada");
      expect(plain.description).toContain("estado finalizada");
      expect(plain.description).toContain("Seguirás en la sección de llamadas");
      expect(plain.description).not.toContain("Despacho");
    });

    it("continues only after the server confirmed this exact finalize operation", () => {
      const confirmed = { operationId: "op-1", status: "confirmed", state: "finalized" } as const;
      const base = { intent: "finalize-and-continue", operationId: "op-1" } as const;
      expect(shouldContinueToDispatches({ ...base, outcome: confirmed })).toBe(true);
      expect(shouldContinueToDispatches({ ...base, intent: "finalize", outcome: confirmed })).toBe(
        false,
      );
      expect(shouldContinueToDispatches({ ...base, outcome: null })).toBe(false);
      expect(
        shouldContinueToDispatches({ ...base, outcome: { ...confirmed, operationId: "op-2" } }),
      ).toBe(false);
      expect(
        shouldContinueToDispatches({
          ...base,
          outcome: { ...confirmed, status: "confirmed-cleanup-failed" },
        }),
      ).toBe(false);
      expect(
        shouldContinueToDispatches({ ...base, outcome: { ...confirmed, status: "cleaned" } }),
      ).toBe(false);
      expect(
        shouldContinueToDispatches({ ...base, outcome: { ...confirmed, state: "draft" } }),
      ).toBe(false);
    });

    const rowProps = {
      saving: false,
      canSave: true,
      showFinalize: true,
      showFinalizeAndContinue: true,
      canFinalize: true,
      onSave: vi.fn(),
      onFinalize: vi.fn(),
      onFinalizeAndContinue: vi.fn(),
    };

    it("renders three text-labelled, color-distinct actions with touch-sized targets", () => {
      const html = renderToStaticMarkup(<CommunicationActionRow {...rowProps} />);
      expect(html).toContain("Guardar borrador");
      expect(html).toContain("Finalizar llamada");
      expect(html).toContain("Finalizar y pasar a Despachos");
      expect(html).not.toContain("Guardar llamada");
      expect(html).toContain("bg-slate-");
      expect(html).toContain("bg-emerald-");
      expect(html).toContain("bg-orange-");
      expect(html).toContain("min-h-11");
      expect(html).toContain("flex-col");
      expect(html.indexOf("Guardar borrador")).toBeLessThan(html.indexOf("Finalizar llamada"));
      expect(html.indexOf("Finalizar llamada")).toBeLessThan(
        html.indexOf("Finalizar y pasar a Despachos"),
      );
    });

    it("hides the unavailable actions and disables finalizing when requirements are missing", () => {
      const draftOnly = renderToStaticMarkup(
        <CommunicationActionRow
          {...rowProps}
          showFinalize={false}
          showFinalizeAndContinue={false}
        />,
      );
      expect(draftOnly).toContain("Guardar borrador");
      expect(draftOnly).not.toContain("Finalizar");

      const notReady = renderToStaticMarkup(
        <CommunicationActionRow {...rowProps} canFinalize={false} />,
      );
      expect(notReady.match(/disabled=""/g)).toHaveLength(2);
      expect(renderToStaticMarkup(<CommunicationActionRow {...rowProps} saving />)).toContain(
        "Guardando…",
      );
    });
  });

  it("reserves submission synchronously while client helpers are loading", async () => {
    const gate = createCommunicationSubmissionGate();
    const release = gate.acquire();
    expect(release).toBeTypeOf("function");
    expect(gate.acquire()).toBeNull();
    await Promise.resolve();
    release?.();
    expect(gate.acquire()).toBeTypeOf("function");
  });
});

describe("resolveCommunicationRestore", () => {
  const calls = [
    { id: "call-1", canEdit: true },
    { id: "call-2", canEdit: false },
  ];

  it("restores a remembered call that still exists and is editable, with its step", () => {
    expect(resolveCommunicationRestore({ recordId: "call-1", step: 2 }, calls, true)).toEqual({
      record: calls[0],
      step: 2,
    });
  });

  it("clamps the remembered step to the last call step", () => {
    expect(resolveCommunicationRestore({ recordId: "call-1", step: 99 }, calls, true)?.step).toBe(
      communicationSteps.length - 1,
    );
    expect(resolveCommunicationRestore({ recordId: "call-1", step: -1 }, calls, true)?.step).toBe(
      0,
    );
  });

  it("restores nothing for a missing, non-editable or unsaved call, or without a position", () => {
    expect(resolveCommunicationRestore({ recordId: "gone", step: 1 }, calls, true)).toBeNull();
    expect(resolveCommunicationRestore({ recordId: "call-2", step: 1 }, calls, true)).toBeNull();
    expect(resolveCommunicationRestore({ recordId: "call-1", step: 1 }, calls, false)).toBeNull();
    expect(resolveCommunicationRestore({ recordId: null, step: 1 }, calls, true)).toBeNull();
    expect(resolveCommunicationRestore(null, calls, true)).toBeNull();
    expect(resolveCommunicationRestore(undefined, calls, true)).toBeNull();
  });
});

describe("call autosave", () => {
  const draftCall = {
    id: "call-1",
    state: "draft" as const,
    ownerUserId: "owner",
    canEdit: true,
    clientCreationKey: "key-1",
  };
  const conditionsBase: Parameters<typeof communicationAutosaveConditions>[0] = {
    canWrite: true,
    selected: draftCall,
    currentUserId: "owner",
    dirty: true,
    hasPendingEntry: false,
    queueEntries: [],
    queueReady: true,
    callsReady: true,
    storeReady: true,
    queueError: "",
    busy: false,
  };

  it("lets the owner autosave a dirty, saved draft when nothing is pending", () => {
    const conditions = communicationAutosaveConditions(conditionsBase);
    expect(conditions).toEqual({
      canWrite: true,
      recordExists: true,
      isDraft: true,
      editorIsOwner: true,
      dirty: true,
      pending: false,
      queueUsable: true,
      busy: false,
    });
    expect(shouldAutosave({ ...conditions, online: true })).toEqual({ ok: true });
  });

  it("never autosaves an unsaved, non-draft, foreign or read-only call", () => {
    const reason = (patch: Partial<typeof conditionsBase>) => {
      const decision = shouldAutosave({
        ...communicationAutosaveConditions({ ...conditionsBase, ...patch }),
        online: true,
      });
      return decision.ok ? "ok" : decision.reason;
    };
    expect(reason({ selected: null })).toBe("no_record");
    expect(reason({ selected: { ...draftCall, state: "finalized" } })).toBe("not_draft");
    expect(reason({ currentUserId: "admin" })).toBe("not_owner");
    expect(reason({ selected: { ...draftCall, canEdit: false } })).toBe("cannot_write");
    expect(reason({ canWrite: false })).toBe("cannot_write");
    expect(reason({ dirty: false })).toBe("not_dirty");
  });

  it("waits for the queue: not ready, failing, or holding an entry for this call", () => {
    const pendingFor = (payload: Record<string, unknown>, status = "uncertain") =>
      communicationAutosaveConditions({
        ...conditionsBase,
        queueEntries: [{ kind: "update", status, payload } as never],
      }).pending;
    expect(
      communicationAutosaveConditions({ ...conditionsBase, queueReady: false }).queueUsable,
    ).toBe(false);
    expect(
      communicationAutosaveConditions({ ...conditionsBase, storeReady: false }).queueUsable,
    ).toBe(false);
    expect(
      communicationAutosaveConditions({ ...conditionsBase, queueError: "sin almacenamiento" })
        .queueUsable,
    ).toBe(false);
    expect(
      communicationAutosaveConditions({ ...conditionsBase, hasPendingEntry: true }).pending,
    ).toBe(true);
    expect(pendingFor({ communicationId: "call-1" })).toBe(true);
    expect(pendingFor({ communicationId: "call-1" }, "paused-conflict")).toBe(true);
    expect(pendingFor({ clientCreationKey: "key-1" })).toBe(true);
    expect(pendingFor({ communicationId: "call-2" })).toBe(false);
    // A server-confirmed entry that only failed its local cleanup has nothing left to send.
    expect(pendingFor({ communicationId: "call-1" }, "confirmed-cleanup-failed")).toBe(false);
  });

  it("creates the draft on Siguiente only for an owned, unsaved call with a chosen type", () => {
    const base = { hasRecord: false, canCreate: true, editorIsOwner: true, directionChosen: true };
    expect(shouldCreateDraftOnNext(base)).toBe(true);
    expect(shouldCreateDraftOnNext({ ...base, hasRecord: true })).toBe(false);
    expect(shouldCreateDraftOnNext({ ...base, canCreate: false })).toBe(false);
    expect(shouldCreateDraftOnNext({ ...base, editorIsOwner: false })).toBe(false);
    // A pristine form (only defaults) has no chosen type, so it is never created.
    expect(shouldCreateDraftOnNext({ ...base, directionChosen: false })).toBe(false);
  });

  const sent: CommunicationFormValue = {
    direction: "incoming",
    priority: "",
    startedAt: "2026-10-19T10:00:00.000",
    endedAt: "",
  };
  const server: CommunicationFormValue = { ...sent, startedAt: "2026-10-19T10:00:00.000" };

  it("applies the server values when nothing was typed during the save", () => {
    expect(mergeConfirmedCommunication(createSaveSnapshot(sent), { ...sent }, server)).toEqual({
      keepLocal: false,
      form: server,
      dirty: false,
    });
    // Without a snapshot (e.g. a finalize), the confirmed call wins as before.
    expect(mergeConfirmedCommunication(null, { ...sent, priority: "red" }, server)).toEqual({
      keepLocal: false,
      form: server,
      dirty: false,
    });
  });

  it("keeps newer typing and stays dirty when the form changed after the snapshot", () => {
    const current = { ...sent, priority: "red" as const, endedAt: "2026-10-19T10:05:00.000" };
    expect(mergeConfirmedCommunication(createSaveSnapshot(sent), current, server)).toEqual({
      keepLocal: true,
      form: current,
      dirty: true,
    });
  });

  it("shows the queue state first and falls back to the call's own saved time", () => {
    const idle = { kind: "idle" } as const;
    const base = {
      autosave: idle,
      pendingStatus: null,
      busy: false,
      dirty: false,
      savedAt: "2026-10-19T13:05:00.000Z",
    };
    expect(communicationSaveStatus({ ...base, pendingStatus: "pending", busy: true })).toEqual({
      kind: "saving",
    });
    expect(communicationSaveStatus({ ...base, pendingStatus: "uncertain" })).toEqual({
      kind: "blocked",
      reason: "pending",
    });
    expect(
      communicationSaveStatus({
        ...base,
        pendingStatus: "uncertain",
        autosave: { kind: "offline" },
      }),
    ).toEqual({ kind: "offline" });
    expect(communicationSaveStatus(base)).toEqual({
      kind: "saved",
      at: new Date("2026-10-19T13:05:00.000Z"),
    });
    expect(communicationSaveStatus({ ...base, dirty: true })).toEqual({ kind: "dirty" });
    expect(communicationSaveStatus({ ...base, savedAt: null })).toEqual(idle);
    const saving = { kind: "saving" } as const;
    expect(communicationSaveStatus({ ...base, autosave: saving })).toBe(saving);
  });

  it("renders the pending state through the single autosave status region", () => {
    const html = renderToStaticMarkup(
      <EfaAutosaveStatus
        status={communicationSaveStatus({
          autosave: { kind: "dirty" },
          pendingStatus: "paused-conflict",
          busy: false,
          dirty: true,
          savedAt: null,
        })}
      />,
    );
    expect(html).toContain("Pendiente");
    expect(html.match(/aria-live/g)).toHaveLength(1);
  });

  it("keeps the fields editable while an operation is pending, only gated by permission", () => {
    expect(
      communicationFieldsEditable({
        hasSelected: true,
        canEditSelected: true,
        canEditNewCall: false,
      }),
    ).toBe(true);
    expect(
      communicationFieldsEditable({
        hasSelected: true,
        canEditSelected: false,
        canEditNewCall: true,
      }),
    ).toBe(false);
    expect(
      communicationFieldsEditable({
        hasSelected: false,
        canEditSelected: false,
        canEditNewCall: true,
      }),
    ).toBe(true);
    expect(
      communicationFieldsEditable({
        hasSelected: false,
        canEditSelected: true,
        canEditNewCall: false,
      }),
    ).toBe(false);
  });
});

describe("communicationHasUnsavedInput", () => {
  const baseline: CommunicationFormValue = {
    direction: "incoming",
    priority: "",
    startedAt: "2026-10-06T06:30",
    endedAt: "",
  };
  const base = {
    dirty: true,
    hasSelected: false,
    current: baseline,
    newCallBaseline: baseline,
    reviewed: false,
  };

  it("is clean when the form is not dirty", () => {
    expect(communicationHasUnsavedInput({ ...base, dirty: false, hasSelected: true })).toBe(false);
  });

  it("follows the dirty flag for an existing call", () => {
    expect(communicationHasUnsavedInput({ ...base, hasSelected: true })).toBe(true);
  });

  it("does not count an untouched new call as unsaved input", () => {
    expect(communicationHasUnsavedInput(base)).toBe(false);
  });

  it("counts a changed value or an explicit choice on a new call", () => {
    expect(
      communicationHasUnsavedInput({ ...base, current: { ...baseline, priority: "red" } }),
    ).toBe(true);
    expect(communicationHasUnsavedInput({ ...base, reviewed: true })).toBe(true);
  });

  it("stays dirty for a new call without a known baseline", () => {
    expect(communicationHasUnsavedInput({ ...base, newCallBaseline: null })).toBe(true);
  });
});
