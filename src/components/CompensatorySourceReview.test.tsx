import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompensatorySourceReview } from "./CompensatorySourceReview";

describe("compensatory source review", () => {
  it("explains local-only persistence boundaries and exposes local file inputs", () => {
    const html = renderToStaticMarkup(<CompensatorySourceReview onBack={() => undefined} />);
    expect(html).toContain("Revisión local y en memoria");
    expect(html).toContain("No se importan datos");
    expect(html).toContain("se pierden al salir, recargar o reemplazar un archivo");
    expect(html).toContain("no aprueba solicitudes ni calcula saldos");
    expect(html).toContain('type="file"');
    expect(html).toContain("Volver al banco");
    expect(html).toContain("Directorio de agentes (CSV)");
    expect(html).toContain("Exportación de compensatorios (JSON)");
  });
});
