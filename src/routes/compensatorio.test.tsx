import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-start")>()),
  useServerFn: (serverFn: unknown) => serverFn,
}));

import { Compensatorio } from "./compensatorio";

describe("public compensatory route", () => {
  it("preserves the complete Article 68 information and renders the Apps Script request form", () => {
    const html = renderToStaticMarkup(<Compensatorio />);

    expect(html).toContain("ARTÍCULO 68°.");
    expect(html).toContain("hasta 90 días");
    expect(html).toContain("prorrogarse su autorización por más de 48 horas");
    expect(html).toContain('id="compensatory-name"');
    expect(html).toContain('id="compensatory-email"');
    expect(html).toContain("Datos de quien solicita");
  });

  it("keeps the database-backed public form unmounted until its release", () => {
    const html = renderToStaticMarkup(<Compensatorio />);

    expect(html).not.toContain("Iniciar solicitud");
  });
});
