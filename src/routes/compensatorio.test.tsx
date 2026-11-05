import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Compensatorio } from "./compensatorio";

describe("public compensatory route", () => {
  it("preserves the complete Article 68 information and offers the request modal", () => {
    const html = renderToStaticMarkup(<Compensatorio />);

    expect(html).toContain("ARTÍCULO 68°.");
    expect(html).toContain("hasta 90 días");
    expect(html).toContain("no podrá prorrogarse su autorización por más de 48 horas");
    expect(html).toContain("Iniciar solicitud");
    expect(html).not.toContain("apps script");
  });
});
