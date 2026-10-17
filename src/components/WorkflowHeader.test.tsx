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

  it("keeps the wide desktop title block by default and widens it on request", () => {
    const defaultHtml = renderToStaticMarkup(
      <WorkflowHeader eyebrow="Área" title="Título" description="Detalle" />,
    );
    expect(defaultHtml).toContain(
      'class="mx-auto hidden w-full max-w-5xl px-4 pt-4 sm:px-6 md:block"',
    );
    expect(defaultHtml).toContain('class="mx-auto w-full max-w-5xl px-4 py-1.5 sm:px-6 sm:py-3"');

    const fullHtml = renderToStaticMarkup(
      <WorkflowHeader eyebrow="Área" title="Título" description="Detalle" contentWidth="full" />,
    );
    expect(fullHtml).toContain(
      'class="mx-auto hidden w-full max-w-[1600px] px-4 pt-4 sm:px-6 md:block"',
    );
    expect(fullHtml).not.toContain("max-w-5xl");
  });
});
