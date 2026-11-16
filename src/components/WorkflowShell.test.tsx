import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkflowShell } from "./WorkflowShell";

const render = (
  contentWidth?: "narrow" | "wide" | "full",
  surface?: "gradient" | "calm" | "neutral" | "santafe-focus",
) =>
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
  it("offers a neutral working surface at every breakpoint without changing existing defaults", () => {
    const html = render("wide", "neutral");
    expect(html).toContain('<main class="bg-background text-foreground');
    expect(html).not.toContain("workflow-background");
    expect(html).not.toContain("mix-blend-multiply");
    expect(html).toContain("Cabecera");
    expect(render()).toContain("workflow-background");
  });

  it("opts into the Santa Fe focus background without changing the neutral surface", () => {
    expect(render("wide", "santafe-focus")).toContain(
      '<main class="bg-santafe-focus text-foreground',
    );
    expect(render("wide", "neutral")).toContain('<main class="bg-background text-foreground');
  });

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

  it("supports a full-bleed content wrapper only when explicitly requested", () => {
    const compact = renderToStaticMarkup(
      <WorkflowShell header={<header>Cabecera</header>} compactLayout>
        <p>Contenido</p>
      </WorkflowShell>,
    );
    expect(compact).toContain('<div class="mx-auto w-full max-w-none px-0 pt-0">');
    expect(render()).toContain('class="mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6 sm:pt-6"');
  });
});
