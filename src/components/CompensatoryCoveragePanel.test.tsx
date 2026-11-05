import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompensatoryCoveragePanel, CoverageEntry, HistoryItem } from "./CompensatoryCoveragePanel";
import type { StaffView } from "@/lib/compensatory-bank.functions";
import type { CompensatoryCoverageHistory } from "@/lib/compensatory-coverage.server";

const staff: StaffView = {
  id: "staff-2",
  dni: "30123456",
  name: "Ana Ejemplo",
  email: null,
  isActive: true,
  monthlyLimitMinutes: 1440,
  version: 1,
  balanceMinutes: 0,
  createdAt: "2026-10-27T12:00:00Z",
};

describe("CompensatoryCoveragePanel", () => {
  it("offers an optional entry without exposing the scheduling fields", () => {
    const html = renderToStaticMarkup(<CoverageEntry hasAssignments={false} onEdit={() => undefined} />);
    expect(html).toContain("¿Quién cubre este horario?");
    expect(html).toContain("Opcional");
    expect(html).toContain("Registrar quién cubre");
    expect(html).not.toContain("Inicio del compensatorio");
    expect(html).toContain('aria-expanded="false"');
  });

  it("offers editing for existing assignments", () => {
    const html = renderToStaticMarkup(<CoverageEntry hasAssignments onEdit={() => undefined} />);
    expect(html).toContain("Editar");
    expect(html).not.toContain("Registrar quién cubre");
  });
  it("is content-only, leaves scheduling blank, and explains read-only phases", () => {
    const html = renderToStaticMarkup(
      <CompensatoryCoveragePanel
        request={{
          id: "request-1",
          staffId: "staff-1",
          requestedDate: "2026-10-30",
          requestedMinutes: 90,
          phase: "canceled",
        }}
        staff={[staff]}
        onSaved={() => undefined}
      />,
    );
    expect(html).toContain("solo lectura");
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("<section");
  });

  it("renders compact before/after history in Buenos Aires time without internal IDs", () => {
    const item: CompensatoryCoverageHistory = {
      actorName: "Coordinación",
      reason: "Se confirmó el relevo",
      occurredAt: "2026-10-30T12:00:00.000Z",
      version: 2,
      before: {
        version: 1,
        plannedStart: null,
        plannedEnd: null,
        status: "pending",
        assignments: [],
        history: [],
      },
      after: {
        version: 2,
        plannedStart: "2026-10-30T12:00:00.000Z",
        plannedEnd: "2026-10-30T13:30:00.000Z",
        status: "partial",
        assignments: [
          {
            staffId: "staff-private-id",
            staffName: "Ana Ejemplo",
            start: "2026-10-30T12:00:00.000Z",
            end: "2026-10-30T12:30:00.000Z",
            confirmed: true,
            verificationMethod: "Llamada",
          },
        ],
        history: [],
      },
    };
    const html = renderToStaticMarkup(<HistoryItem item={item} />);

    expect(html).toContain("30/10/2026, 09:00 · Coordinación · versión 2");
    expect(html).toContain("Sin personas asignadas");
    expect(html).toContain("30/10/2026, 09:00–10:30");
    expect(html).toContain("Ana Ejemplo");
    expect(html).toContain("09:00–09:30");
    expect(html).toContain("Confirmada manualmente");
    expect(html).toContain("Verificación: Llamada");
    expect(html).toContain("Se confirmó el relevo");
    expect(html).not.toContain("staff-private-id");
    expect(html).not.toContain("<pre");
  });
});
