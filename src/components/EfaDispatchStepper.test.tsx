import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  availableDispatchOrigins,
  canEditSupportAssociation,
  captureActionTimestamp,
  dispatchErrorSurfaceForKind,
  dispatchStepState,
  DispatchStepNavigation,
  DispatchFollowUpBlock,
  DispatchInstitutionField,
  EfaDispatchStepper,
  FirstResponseRoleSelect,
  followUpHistoryLine,
  isDispatchReviewStep,
  isFollowUpOpen,
} from "./EfaDispatchStepper";
import { FollowUpOpenButton } from "./EfaDispatchFollowUpModal";

vi.mock("@tanstack/react-start", () => ({
  createClientOnlyFn: (fn: () => unknown) => fn,
  useServerFn: () => vi.fn(async () => []),
}));
vi.mock("@/lib/efa-dispatches.functions", () => ({
  firstResponseRoleValues: ["driver", "nurse", "doctor", "other", "not_observed"],
  addEfaDispatchContactAttempt: vi.fn(),
  cancelEfaDispatch: vi.fn(),
  createEfaDispatch: vi.fn(),
  createEfaSupportRequest: vi.fn(),
  finalizeEfaDispatch: vi.fn(),
  getEfaDispatch: vi.fn(),
  getEfaDispatchHistory: vi.fn(),
  listEfaDispatchNotices: vi.fn(),
  listEfaDispatchesForEpisode: vi.fn(),
  markEfaDispatchNoticeRead: vi.fn(),
  reactivateEfaDispatch: vi.fn(),
  updateEfaDispatch: vi.fn(),
  updateEfaSupportRequest: vi.fn(),
}));
vi.mock("@/lib/efa-bases.functions", () => ({ listEfaBases: vi.fn() }));
vi.mock("@/lib/efa-communications.functions", () => ({ listEfaCommunicationsForEpisode: vi.fn() }));
vi.mock("@/lib/efa-episodes.functions", () => ({ getEfaEpisode: vi.fn() }));
vi.mock("@/lib/efa-institutions.functions", () => ({
  createEfaInstitutionInline: vi.fn(),
  listEfaInstitutions: vi.fn(),
}));

describe("EfaDispatchStepper", () => {
  it("keeps all dispatch steps available behind compact current-step navigation", () => {
    const html = renderToStaticMarkup(
      <DispatchStepNavigation step={5} onStepChange={() => undefined} />,
    );

    expect(html).toContain("Paso 6 de 11: Llegada a destino");
    expect(html).toContain("Ver pasos");
    expect(html).toContain('tabindex="-1"');
    expect(html.match(/aria-label="Ir al paso/g)).toHaveLength(11);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Ir al paso 6: Llegada a destino" aria-current="step"');
  });

  it("renders an optional action in the same row as the step indicator and Ver pasos", () => {
    const html = renderToStaticMarkup(
      <DispatchStepNavigation
        step={0}
        onStepChange={() => undefined}
        action={<FollowUpOpenButton disabled={false} onClick={() => undefined} />}
      />,
    );
    const row = html.match(/^<div class="[^"]*flex-wrap[^"]*">/);
    expect(row).not.toBeNull();
    expect(html.indexOf("Paso 1 de 11")).toBeLessThan(
      html.indexOf("Comunicaciones de seguimiento"),
    );
    expect(html.indexOf("Comunicaciones de seguimiento")).toBeLessThan(html.indexOf("Ver pasos"));
    const without = renderToStaticMarkup(
      <DispatchStepNavigation step={0} onStepChange={() => undefined} />,
    );
    expect(without).not.toContain("Comunicaciones de seguimiento");
  });

  it("derives step progress from the step index", () => {
    expect(dispatchStepState(0, 3)).toBe("complete");
    expect(dispatchStepState(2, 3)).toBe("complete");
    expect(dispatchStepState(3, 3)).toBe("current");
    expect(dispatchStepState(4, 3)).toBe("pending");
    expect(dispatchStepState(0, 0)).toBe("current");
  });

  it("colors steps by progress with text and icon cues beyond color", () => {
    const html = renderToStaticMarkup(
      <DispatchStepNavigation step={5} onStepChange={() => undefined} />,
    );
    expect(html.match(/data-step-state="complete"/g)).toHaveLength(5);
    expect(html.match(/data-step-state="current"/g)).toHaveLength(1);
    expect(html.match(/data-step-state="pending"/g)).toHaveLength(5);
    // Completed steps carry a check icon and text; the current step carries text.
    expect(html.match(/lucide-check/g)).toHaveLength(5);
    expect(html.match(/>Completado</g)).toHaveLength(5);
    expect(html.match(/>Actual</g)).toHaveLength(1);
    expect(html).toContain('aria-label="Ir al paso 1: Base y vínculo (completado)"');
    // The "Paso N de 11" indicator uses the strong primary color.
    expect(html).toMatch(/<p[^>]*bg-primary[^>]*>Paso 6 de 11: Llegada a destino/);
    // Completed steps use soft green, pending steps stay neutral.
    expect(html).toMatch(/data-step-state="complete"[^>]*bg-emerald-50/);
    expect(html).toMatch(/data-step-state="pending"[^>]*bg-background/);
  });

  it("allows dispatch finalization only from review", () => {
    expect(Array.from({ length: 10 }, (_, step) => isDispatchReviewStep(step))).toEqual(
      Array(10).fill(false),
    );
    expect(isDispatchReviewStep(10)).toBe(true);
  });

  it("keeps the terminal action out of the initial dispatch step", () => {
    const html = renderToStaticMarkup(
      <EfaDispatchStepper
        episodeId="episode"
        episodeLabel="Turno 1"
        currentUserId="owner"
        canWrite={true}
        episodeCanEdit={true}
      />,
    );

    expect(html).toContain("Guardar borrador");
    expect(html).not.toContain("Finalizar despacho");
  });

  it("keeps dispatch action failures beside the control that can retry them", () => {
    expect(dispatchErrorSurfaceForKind("create")).toBe("form");
    expect(dispatchErrorSurfaceForKind("update")).toBe("form");
    expect(dispatchErrorSurfaceForKind("finalize")).toBe("form");
    expect(dispatchErrorSurfaceForKind("contact-attempt")).toBe("contact");
    expect(dispatchErrorSurfaceForKind("support-create")).toBe("support");
    expect(dispatchErrorSurfaceForKind("support-update")).toBe("support");
  });

  it("hides cancelled communication origins except an existing historical link", () => {
    const communications = [
      { id: "active", state: "finalized" },
      { id: "cancelled", state: "cancelled" },
    ];
    expect(availableDispatchOrigins(communications, null).map((item) => item.id)).toEqual([
      "active",
    ]);
    expect(availableDispatchOrigins(communications, "cancelled").map((item) => item.id)).toEqual([
      "active",
      "cancelled",
    ]);
  });

  it("disables response association when the request itself is not editable", () => {
    expect(canEditSupportAssociation(true, true, true, false)).toBe(false);
    expect(canEditSupportAssociation(true, true, true, true)).toBe(true);
  });

  it("captures the current timestamp when a quick action is invoked", () => {
    const mountedAt = new Date("2026-10-07T12:00:00.000Z");
    const clickedAt = new Date("2026-10-07T12:34:56.789Z");
    expect(captureActionTimestamp(clickedAt)).toBe("2026-10-07T12:34:56.789Z");
    expect(captureActionTimestamp(clickedAt)).not.toBe(captureActionTimestamp(mountedAt));
  });

  it("uses anonymous role choices and keeps legacy values visibly read-only", () => {
    const html = renderToStaticMarkup(
      <FirstResponseRoleSelect value="Named operator" onChange={() => undefined} />,
    );
    expect(html).toContain("<select");
    expect(html).toContain("Conductor");
    expect(html).toContain("Enfermería");
    expect(html).toContain("Médico/a");
    expect(html).toContain("Otro rol anónimo");
    expect(html).toContain("No observado");
    expect(html).toContain("Valor histórico (solo lectura): Named operator");
    expect(html).toContain('value="Named operator" disabled');
    expect(html).not.toContain("<input");
  });

  it("renders a readable dispatch workspace without requiring write access", () => {
    const html = renderToStaticMarkup(
      <EfaDispatchStepper
        episodeId="episode"
        episodeLabel="Turno 1"
        currentUserId="owner"
        canWrite={false}
        episodeCanEdit={false}
      />,
    );
    expect(html).toContain('aria-label="Despachos del episodio Turno 1"');
    expect(html).toContain(">Despachos</h2>");
    expect(html).not.toContain("Despachos · Turno 1");
    expect(html).toContain("Solo lectura");
    expect(html).toContain("<section");
  });

  it("opens the mobile follow-up only once arrival on scene was observed", () => {
    expect(isFollowUpOpen({ t2At: "2026-10-14T13:55:00.000Z" })).toBe(true);
    expect(isFollowUpOpen({ t2At: null })).toBe(false);
    expect(isFollowUpOpen({ t2At: "" })).toBe(false);
  });

  it("lists follow-up entries as Seguimiento with the time and the note", () => {
    const withNote = followUpHistoryLine({
      occurredAt: "2026-10-14T14:09:00.000Z",
      note: "Paciente estable",
    });
    expect(withNote).toMatch(/^Seguimiento · .*11:09.* · Paciente estable$/);
    expect(followUpHistoryLine({ occurredAt: "2026-10-14T14:09:00.000Z", note: null })).toMatch(
      /^Seguimiento · [^·]*11:09[^·]*$/,
    );
  });

  it("renders a visible follow-up block with hint and relabeled actions", () => {
    const props = {
      open: true,
      busy: false,
      note: "",
      at: "",
      onNoteChange: () => undefined,
      onAtChange: () => undefined,
      onRegisterNow: () => undefined,
      onRegisterAt: () => undefined,
      error: null,
      message: null,
    };
    const html = renderToStaticMarkup(<DispatchFollowUpBlock {...props} />);
    expect(html).toContain("Seguimiento del móvil");
    expect(html).toContain("Registrá contactos y novedades con hora y nota.");
    expect(html).toContain("Registrar novedad · Ahora");
    expect(html).toContain("Registrar novedad con hora ingresada");
    expect(html).not.toContain("intento de contacto");
    expect(html).not.toContain("Eventos relacionados");
    expect(html).toMatch(/<details[^>]*\bopen(?:="")?[^>]*>/);
    const collapsed = renderToStaticMarkup(<DispatchFollowUpBlock {...props} open={false} />);
    expect(collapsed).toContain("Seguimiento del móvil");
    expect(collapsed).not.toMatch(/<details[^>]*\bopen(?:="")?[^>]*>/);
  });

  it("shows follow-up failures and confirmations inside the block", () => {
    const html = renderToStaticMarkup(
      <DispatchFollowUpBlock
        open={true}
        busy={false}
        note=""
        at=""
        onNoteChange={() => undefined}
        onAtChange={() => undefined}
        onRegisterNow={() => undefined}
        onRegisterAt={() => undefined}
        error="No se pudo guardar"
        message="Guardado"
      />,
    );
    expect(html).toContain("No se pudo guardar");
    expect(html).toContain("Guardado");
  });

  it("renders active destination choices and preserves a historical inactive destination", () => {
    const html = renderToStaticMarkup(
      <DispatchInstitutionField
        institutions={[{ id: "active", name: "Hospital Central", isActive: true, version: 1 }]}
        institutionsLoaded={true}
        value="inactive"
        historicalInstitution={{ id: "inactive", name: "Hospital Histórico" }}
        onChange={() => undefined}
        onInstitutionsChanged={() => undefined}
      />,
    );
    expect(html).toContain("Destino histórico: Hospital Histórico");
    expect(html).toContain("Cargando el catálogo institucional");
  });
});
