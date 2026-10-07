import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AdminStaffingPlan, getStablePlanOperationId } from "./AdminStaffingPlan";

vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn(async () => ({ slots: [] })) }));
vi.mock("@/lib/efa-staffing-plan.functions", () => ({
  listEfaStaffingPlan: vi.fn(),
  previewEfaStaffingPlan: vi.fn(),
  saveEfaStaffingPlan: vi.fn(),
  saveEfaStaffingPlanException: vi.fn(),
}));

describe("AdminStaffingPlan", () => {
  it("sets plan and exception date minimums after the operational day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T02:00:00.000Z"));
    try {
      const html = renderToStaticMarkup(<AdminStaffingPlan />);
      expect(html.match(/min="2026-10-07"/gu)).toHaveLength(2);
      expect(html).toContain("posterior al día operativo actual");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reuses a pending operation ID for an unchanged retry payload", () => {
    const pending = new Map<string, { fingerprint: string; id: string }>();
    let generated = 0;
    const createId = () => `operation-${++generated}`;
    const payload = { target: { kind: "base", baseId: "base-a" }, slots: [] };
    const first = getStablePlanOperationId(pending, "plan:base-a", payload, createId);
    const retry = getStablePlanOperationId(pending, "plan:base-a", payload, createId);
    expect(retry).toBe(first);
    const exception = getStablePlanOperationId(
      pending,
      "exception:base-a:2026-10-08",
      payload,
      createId,
    );
    expect(exception).not.toBe(first);
    expect(generated).toBe(2);
  });

  it("keeps future planned coverage distinct and exposes cycles, roles, and date exceptions", () => {
    const html = renderToStaticMarkup(
      <AdminStaffingPlan
        bases={[{ id: "00000000-0000-4000-8000-000000000050", name: "Central", isActive: true }]}
      />,
    );
    expect(html).toContain("Planificación futura de cobertura");
    expect(html).toContain("una planificación, no una dotación real");
    expect(html).toContain("Duración del ciclo en días");
    expect(html).toContain("Medicina");
    expect(html).toContain("Excepción para una fecha");
    expect(html).toContain("no se planifica cobertura para esa fecha");
    expect(html).toContain("Consultar historial de versiones");
    expect(html).toContain("Base del catálogo");
    expect(html).toContain("00000000-0000-4000-8000-000000000050");
    expect(html).toContain("Al día siguiente (hasta 24 h)");
    expect(html).not.toContain("Nombre de persona");
  });
});
