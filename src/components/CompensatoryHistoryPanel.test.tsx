import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CompensatoryHistoryPanel,
  refreshParentAfterConfirmedWrite,
} from "./CompensatoryHistoryPanel";
import type { StaffView } from "@/lib/compensatory-bank.functions";

const staff: StaffView = {
  id: "staff-1",
  dni: "30123456",
  name: "Ana Ejemplo",
  email: null,
  isActive: true,
  monthlyLimitMinutes: 1440,
  version: 1,
  balanceMinutes: 120,
  createdAt: "2026-10-27T12:00:00Z",
};

describe("compensatory history panel", () => {
  it("keeps a confirmed write distinct when the parent refresh callback fails", async () => {
    await expect(
      refreshParentAfterConfirmedWrite(async () => {
        throw new Error("refresh failed");
      }),
    ).resolves.toBe(false);
  });

  it("provides compact year/type filters and filtered CSV export for the selected staff member", () => {
    const html = renderToStaticMarkup(<CompensatoryHistoryPanel staff={staff} requests={[]} />);

    expect(html).toContain("Historial de horas");
    expect(html).toContain("Ana Ejemplo");
    expect(html).toContain('aria-label="Filtrar historial por año"');
    expect(html).toContain('aria-label="Filtrar historial por tipo"');
    expect(html).toContain("Descargar CSV filtrado");
    expect(html).toContain("Auditoría del perfil");
    expect(html).toContain('disabled=""');
  });
});
