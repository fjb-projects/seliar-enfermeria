import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminInstitutionCatalog } from "./AdminInstitutionCatalog";

describe("AdminInstitutionCatalog", () => {
  it("renders shared destination maintenance and distinguishes inactive history-preserving entries", () => {
    const html = renderToStaticMarkup(
      <AdminInstitutionCatalog
        initialInstitutions={[
          {
            id: "00000000-0000-4000-8000-000000000001",
            name: "Hospital Central",
            isActive: true,
            version: 1,
          },
          {
            id: "00000000-0000-4000-8000-000000000002",
            name: "Clínica Norte",
            isActive: false,
            version: 3,
          },
        ]}
      />,
    );
    expect(html).toContain("Catálogo de instituciones y destinos");
    expect(html).toContain("No incluyas domicilios particulares");
    expect(html).toContain("Hospital Central");
    expect(html).toContain("Clínica Norte");
    expect(html).toContain("Ver historial");
    expect(html).toContain("Reactivar");
  });
});
