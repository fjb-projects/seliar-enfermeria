import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EfaInstitutionPicker } from "./efa-institutions.client";

describe("EfaInstitutionPicker", () => {
  it("offers active shared destinations and inline creation without free-text selection", () => {
    const html = renderToStaticMarkup(
      <EfaInstitutionPicker
        initialInstitutions={[
          { id: "destination-1", name: "Hospital Central", isActive: true, version: 1 },
        ]}
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(html).toContain("Hospital Central");
    expect(html).toContain("Agregar una opción al catálogo compartido");
    expect(html).toContain(
      "Este catálogo es solo para instituciones y destinos institucionales. Los domicilios particulares se registran en el episodio y no deben crearse aquí.",
    );
    expect(html).toContain("efa-institution-choice");
    expect(html).not.toContain('<input type="text" name="destination"');
  });
});
