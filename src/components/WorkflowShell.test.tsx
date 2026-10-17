import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkflowShell } from "./WorkflowShell";

const render = (contentWidth?: "narrow" | "wide" | "full") =>
  renderToStaticMarkup(
    <WorkflowShell header={<header>Cabecera</header>} {...(contentWidth ? { contentWidth } : {})}>
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
});
