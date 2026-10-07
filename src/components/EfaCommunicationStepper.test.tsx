import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  canCreateCommunication,
  canEditCommunication,
  communicationSteps,
  createCommunicationSubmissionGate,
  shouldShowCommunicationEditor,
  EfaCommunicationStepper,
} from "./EfaCommunicationStepper";

describe("EfaCommunicationStepper", () => {
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
  it("renders five accessible step names and marks only the active step", () => {
    const html = renderToStaticMarkup(
      <EfaCommunicationStepper step={2} onStepChange={vi.fn()}>
        <p>Fin real opcional</p>
      </EfaCommunicationStepper>,
    );

    expect(communicationSteps).toHaveLength(5);
    expect(html).toContain("Paso 3 de 5: Fin real");
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Progreso de la llamada"');
    expect(html).toContain("min-h-11");
    expect(html).toContain("Fin real opcional");
  });

  it("renders explicit previous and next controls without gesture-only navigation", () => {
    const html = renderToStaticMarkup(
      <EfaCommunicationStepper step={0} onStepChange={vi.fn()}>
        <p>Dirección</p>
      </EfaCommunicationStepper>,
    );

    expect(html).toContain("disabled");
    expect(html).toContain("Paso anterior");
    expect(html).toContain("Siguiente paso");
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
