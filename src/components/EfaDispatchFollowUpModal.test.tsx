import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  canSaveFollowUp,
  FOLLOW_UP_NOTE_MAX_LENGTH,
  FollowUpModalForm,
  FollowUpNoteField,
  FollowUpOpenButton,
  followUpButtonState,
  isFollowUpTimeValid,
} from "./EfaDispatchFollowUpModal";

const noop = () => undefined;

const formProps = {
  busy: false,
  note: "",
  at: "",
  onNoteChange: noop,
  onAtChange: noop,
  onRegisterNow: noop,
  onRegisterAt: noop,
  onCancel: noop,
  error: null,
  message: null,
};

describe("EfaDispatchFollowUpModal", () => {
  it("offers the follow-up button only for a selected, editable, non-cancelled dispatch", () => {
    const base = { hasDispatch: true, canEdit: true, cancelled: false, busy: false };
    expect(followUpButtonState(base)).toBe("enabled");
    expect(followUpButtonState({ ...base, hasDispatch: false })).toBe("hidden");
    expect(followUpButtonState({ ...base, canEdit: false })).toBe("hidden");
    expect(followUpButtonState({ ...base, cancelled: true })).toBe("hidden");
    expect(followUpButtonState({ ...base, busy: true })).toBe("disabled");
  });

  it("validates the manual time and gates saving", () => {
    expect(isFollowUpTimeValid("2026-10-14T11:09:00.000")).toBe(true);
    expect(isFollowUpTimeValid("")).toBe(false);
    expect(isFollowUpTimeValid("not a date")).toBe(false);
    expect(canSaveFollowUp({ busy: false, mode: "now", at: "" })).toBe(true);
    expect(canSaveFollowUp({ busy: true, mode: "now", at: "" })).toBe(false);
    expect(canSaveFollowUp({ busy: false, mode: "manual", at: "" })).toBe(false);
    expect(canSaveFollowUp({ busy: false, mode: "manual", at: "2026-10-14T11:09" })).toBe(true);
  });

  it("renders the highlighted trigger with a text label and disables it while busy", () => {
    const enabled = renderToStaticMarkup(<FollowUpOpenButton disabled={false} onClick={noop} />);
    expect(enabled).toContain("Comunicaciones de seguimiento");
    expect(enabled).toContain('aria-haspopup="dialog"');
    expect(enabled).toContain("min-h-11");
    expect(enabled).not.toMatch(/<button[^>]*\sdisabled=""/);
    const busy = renderToStaticMarkup(<FollowUpOpenButton disabled={true} onClick={noop} />);
    expect(busy).toMatch(/<button[^>]*\sdisabled=""/);
  });

  it("limits the note to the server maximum", () => {
    expect(FOLLOW_UP_NOTE_MAX_LENGTH).toBe(1000);
    const html = renderToStaticMarkup(<FollowUpNoteField note="Hola" onNoteChange={noop} />);
    expect(html).toContain('maxLength="1000"');
    expect(html).toContain("4/1000");
  });

  it("renders the modal form with time choice, note and Guardar/Cancelar actions", () => {
    const html = renderToStaticMarkup(<FollowUpModalForm {...formProps} />);
    expect(html).toContain("Nota del seguimiento");
    expect(html).toContain("Ahora");
    expect(html).toContain("Otra hora");
    expect(html).toContain(">Guardar<");
    expect(html).toContain(">Cancelar<");
    expect(html).toContain("min-h-11");
    // The manual time input only appears after choosing "Otra hora".
    expect(html).not.toContain("datetime-local");
  });

  it("shows busy and error feedback in the modal form", () => {
    const busy = renderToStaticMarkup(<FollowUpModalForm {...formProps} busy={true} />);
    expect(busy).toContain("Guardando");
    expect(busy).toContain('aria-busy="true"');
    const failed = renderToStaticMarkup(
      <FollowUpModalForm {...formProps} error="No se pudo guardar" message="Guardado" />,
    );
    expect(failed).toContain('role="alert"');
    expect(failed).toContain("No se pudo guardar");
    expect(failed).toContain("Guardado");
  });
});
