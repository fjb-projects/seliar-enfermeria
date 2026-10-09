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
  EfaCommunicationStepper,
} from "./EfaCommunicationStepper";

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
