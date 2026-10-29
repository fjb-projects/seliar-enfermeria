import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompensatorySourceReview, RosterReviewMetadata } from "./CompensatorySourceReview";
import type { RosterSourceRow } from "@/lib/compensatory-source-review";

describe("compensatory source review", () => {
  it("labels source metadata as review information rather than an applied import", () => {
    const row: RosterSourceRow = {
      sourceRow: 2,
      dni: "30123456",
      name: "Synthetic Person",
      canLink: true,
      issues: [],
      registrationNumber: null,
      employmentStatus: "Current status",
      jobRole: "Current role",
      region: null,
      contactPhone: null,
      workplace: null,
      operationalStatus: null,
      operationalRole: null,
      reviewMetadata: {
        ORIGEN: "combined synthetic fixture",
        REVISION: "manual review pending",
        "CAMPOS CON DIFERENCIAS": "FUNCION",
        "FUNCION ANTERIOR": "Prior role",
      },
    };
    const html = renderToStaticMarkup(<RosterReviewMetadata row={row} />);
    expect(html).toContain("Revisar origen y diferencias");
    expect(html).toContain("Diferencias respecto del registro anterior");
    expect(html).toContain("Función laboral anterior");
    expect(html).toContain("no confirman ni aplican cambios al agente");
  });

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
