import { describe, expect, it, vi } from "vitest";
import {
  getAdministrativeRequestOperation,
  formatAdministrativeRequestHours,
  validateAdministrativeRequestDraft,
  type AdministrativeRequestDraft,
} from "./compensatory-admin-request-form";

const validDraft: AdministrativeRequestDraft = {
  staffId: "staff-1",
  requesterEmail: "supervisor@example.com",
  requesterMobile: "Móvil 3",
  compensatoryDate: "2026-10-30",
  hours: "1",
  minutes: "30",
  reason: "Carga manual por contingencia.",
};

describe("administrative compensatory request form", () => {
  it("requires an active agent, valid snapshot contact, today-or-future date, positive time, and reason", () => {
    expect(validateAdministrativeRequestDraft(validDraft, true, "2026-10-30")).toBeNull();
    expect(
      validateAdministrativeRequestDraft({ ...validDraft, staffId: "" }, true, "2026-10-30"),
    ).toBe("Selecciona un agente activo.");
    expect(validateAdministrativeRequestDraft(validDraft, false, "2026-10-30")).toBe(
      "Selecciona un agente activo.",
    );
    expect(
      validateAdministrativeRequestDraft(
        { ...validDraft, requesterEmail: "not-an-email" },
        true,
        "2026-10-30",
      ),
    ).toBe("Ingresa un correo electrónico válido.");
    expect(
      validateAdministrativeRequestDraft(
        { ...validDraft, compensatoryDate: "2026-10-29" },
        true,
        "2026-10-30",
      ),
    ).toBe("La fecha debe ser hoy o una fecha futura.");
    expect(
      validateAdministrativeRequestDraft(
        { ...validDraft, hours: "0", minutes: "0" },
        true,
        "2026-10-30",
      ),
    ).toBe("La cantidad debe ser de al menos un minuto.");
    expect(
      validateAdministrativeRequestDraft({ ...validDraft, reason: "  " }, true, "2026-10-30"),
    ).toBe("Indica el motivo de la carga manual.");
  });

  it("keeps the same operation identity when duplicate confirmation is added", () => {
    const createId = vi.fn().mockReturnValueOnce("operation-1").mockReturnValueOnce("operation-2");
    const first = getAdministrativeRequestOperation(null, validDraft, createId);
    const confirmed = getAdministrativeRequestOperation(first, validDraft, createId);
    const edited = getAdministrativeRequestOperation(
      confirmed,
      { ...validDraft, hours: "2" },
      createId,
    );

    expect(first.id).toBe("operation-1");
    expect(confirmed).toBe(first);
    expect(edited.id).toBe("operation-2");
    expect(createId).toHaveBeenCalledTimes(2);
  });

  it("sends exact hours and minutes without decimal-hour rounding", () => {
    expect(formatAdministrativeRequestHours(validDraft)).toBe("1:30");
    expect(formatAdministrativeRequestHours({ ...validDraft, hours: "0", minutes: "1" })).toBe(
      "0:01",
    );
  });
});
