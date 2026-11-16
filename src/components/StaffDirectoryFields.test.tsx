import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StaffDirectoryFields } from "./StaffDirectoryFields";

describe("staff directory fields", () => {
  it("renders the eight optional directory fields with distinct functional labels", () => {
    const html = renderToStaticMarkup(
      <form>
        <StaffDirectoryFields prefix="staff" />
      </form>,
    );
    for (const label of [
      "Matrícula",
      "Situación de revista",
      "Función laboral",
      "Región",
      "Teléfono de contacto",
      "Lugar de desempeño",
      "Condición operativa",
      "Función operativa",
    ])
      expect(html).toContain(label);
    expect(html).toContain('name="staffJobRole"');
    expect(html).toContain('name="staffOperationalRole"');
    expect(html).toContain('maxLength="300"');
    expect(html).not.toContain("OBS");
  });

  it("shows the licenciatura qualification when the matrícula contains L", () => {
    const html = renderToStaticMarkup(
      <StaffDirectoryFields prefix="profile" values={{ registrationNumber: "L-12345" }} />,
    );
    expect(html).toContain("Licenciatura indicada por la matrícula");
    expect(html).toContain('value="L-12345"');
  });

  it("keeps optional directory fields disclosed only when requested", () => {
    const html = renderToStaticMarkup(<StaffDirectoryFields prefix="staff" />);
    expect(html).toContain("Datos laborales y contacto");
    expect(html).not.toContain('<details open="">');
  });
});
