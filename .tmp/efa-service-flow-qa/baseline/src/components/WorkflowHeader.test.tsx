import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkflowHeader } from "./WorkflowHeader";

describe("workflow header", () => {
  it("supports an account disclosure and compact logo without changing its public default", () => {
    const account = <button type="button">Cuenta de Ana Example</button>;
    const html = renderToStaticMarkup(
      <WorkflowHeader
        eyebrow="SeLIAR · Área privada"
        title="Acceso seguro"
        description="Gestión de cuentas y permisos"
        accountSlot={account}
        compactLogo
      />,
    );

    expect(html).toContain("Cuenta de Ana Example");
    expect(html).toContain("h-8 w-12");

    const publicHtml = renderToStaticMarkup(
      <WorkflowHeader eyebrow="Público" title="Ingreso" description="Acceso" />,
    );
    expect(publicHtml).not.toContain("Cuenta de Ana Example");
    expect(publicHtml).toContain("h-10 w-16");
  });
});
