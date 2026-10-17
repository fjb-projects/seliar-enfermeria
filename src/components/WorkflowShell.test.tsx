import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkflowShell } from "./WorkflowShell";

const render = (contentWidth?: "narrow" | "wide" | "full", surface?: "gradient" | "calm") =>
  renderToStaticMarkup(
    <WorkflowShell
      header={<header>Cabecera</header>}
      {...(contentWidth ? { contentWidth } : {})}
      {...(surface ? { surface } : {})}
    >
      <p>Contenido</p>
    </WorkflowShell>,
  );

describe("workflow shell", () => {
  it("keeps the wide centered column by default", () => {
    expect(render()).toContain(
      '<div class="mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6 sm:pt-6"><p>Contenido</p></div>',
    );
    expect(render("narrow")).toContain(
      'class="mx-auto w-full max-w-2xl px-4 pt-4 sm:px-6 sm:pt-6"',
    );
  });

  it("opts into the full page width with the same side gutters", () => {
    const html = render("full");
    expect(html).toContain('class="mx-auto w-full max-w-[1600px] px-4 pt-4 sm:px-6 sm:pt-6"');
    expect(html).not.toContain("max-w-5xl");
  });

  it("keeps the full gradient and no backdrop image by default", () => {
    const html = render();
    expect(html).toContain(
      '<main class="workflow-background min-h-screen pb-24 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 motion-reduce:animate-none md:pb-0">',
    );
    expect(html).not.toContain('alt=""');
    expect(render(undefined, "gradient")).toBe(html);
  });

  it("limits the gradient to phones in the calm surface and adds a decorative backdrop", () => {
    const html = render("full", "calm");
    expect(html).toContain('<main class="workflow-background-mobile-only relative min-h-screen');
    expect(html).not.toContain('class="workflow-background ');
    expect(html).toContain('<img src="/logoSIES.jpg" alt="" aria-hidden="true"');
    expect(html).toMatch(/<div aria-hidden="true" class="[^"]*\bhidden\b[^"]*\bmd:block\b/);
    expect(html).toContain("pointer-events-none");
    expect(html).toContain("mix-blend-multiply");
    expect(html.indexOf("<img")).toBeLessThan(html.indexOf("<header>"));
    expect(html).toContain("Contenido");
  });
});
