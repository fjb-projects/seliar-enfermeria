import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SessionLoadError } from "./SessionLoadError";

describe("session load error boundary", () => {
  it("shows a safe retry action without rendering internal error details", () => {
    const html = renderToStaticMarkup(<SessionLoadError />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("problema temporal al cargar esta pantalla");
    expect(html).toContain("Reintentar");
  });
});
