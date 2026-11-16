import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompensatoryExportPanel } from "./CompensatoryExportPanel";

describe("CompensatoryExportPanel", () => {
  it("offers an annual-to-date extract, month selection and an Excel download for all staff", () => {
    const html = renderToStaticMarkup(<CompensatoryExportPanel serviceDay="2026-11-11" />);
    expect(html).toContain("Extracto anual hasta el momento");
    expect(html).toContain("Seleccionar meses");
    expect(html).toContain("Descargar Excel (.xlsx)");
    expect(html).toContain("Todos los agentes");
    expect(html).toContain("horas netas");
    expect(html).toContain("2024");
    expect(html).toContain("2025");
    expect(html).toContain("2026");
    expect(html).toContain("sin liquidación");
  });
});
