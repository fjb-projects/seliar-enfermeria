import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompensatorySourceReview } from "./CompensatorySourceReview";

describe("compensatory source review", () => {
  it("explains local-only persistence boundaries and exposes local file inputs", () => {
    const html = renderToStaticMarkup(
      <CompensatorySourceReview
        onBack={() => undefined}
        onImportStaff={async () => undefined}
        onSaveRequest={async () => {
          throw new Error("synthetic callback");
        }}
      />,
    );
    expect(html).toContain("El JSON se lee temporalmente en este navegador");
    expect(html).toContain("requiere guardar cada fila explícitamente");
    expect(html).toContain("se pierden al salir, recargar o reemplazar un archivo");
    expect(html).toContain("no aprueba solicitudes ni calcula saldos");
    expect(html).toContain('type="file"');
    expect(html).toContain("Volver al banco");
    expect(html).toContain("Directorio de agentes (CSV)");
    expect(html).toContain("Exportación de compensatorios (JSON)");
    expect(html).toContain("Importar agentes seleccionados");
    expect(html).toContain("Licenciatura");
    expect(html).toContain("La importación crea agentes nuevos y no modifica DNIs existentes.");
    expect(html).toContain("no guarda la solicitud ni copia el correo automáticamente");
  });
});
