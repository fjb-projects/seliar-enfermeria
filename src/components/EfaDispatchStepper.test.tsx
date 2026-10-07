import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  canEditSupportAssociation,
  captureActionTimestamp,
  DispatchInstitutionField,
  EfaDispatchStepper,
  FirstResponseRoleSelect,
} from "./EfaDispatchStepper";

vi.mock("@tanstack/react-start", () => ({
  createClientOnlyFn: (fn: () => unknown) => fn,
  useServerFn: () => vi.fn(async () => []),
}));
vi.mock("@/lib/efa-dispatches.functions", () => ({
  firstResponseRoleValues: ["driver", "nurse", "doctor", "other", "not_observed"],
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
vi.mock("@/lib/efa-bases.functions", () => ({ listEfaBases: vi.fn() }));
vi.mock("@/lib/efa-communications.functions", () => ({ listEfaCommunicationsForEpisode: vi.fn() }));
vi.mock("@/lib/efa-episodes.functions", () => ({ getEfaEpisode: vi.fn() }));
vi.mock("@/lib/efa-institutions.functions", () => ({
  createEfaInstitutionInline: vi.fn(),
  listEfaInstitutions: vi.fn(),
}));

describe("EfaDispatchStepper", () => {
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
    expect(html).toContain("Despachos · Turno 1");
    expect(html).toContain("Solo lectura");
    expect(html).toContain("<section");
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
