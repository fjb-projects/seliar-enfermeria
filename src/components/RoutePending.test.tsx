import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoutePending } from "./RoutePending";

describe("RoutePending", () => {
  it("renders an accessible, reduced-motion-friendly route loading status", () => {
    const html = renderToStaticMarkup(<RoutePending />);

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/<span class="sr-only">[^<]+<\/span>/);
    expect(html).toContain("motion-reduce:animate-none");
    expect(html).toMatch(/<span class="text-sm font-medium">[^<]+<\/span>/);
  });
});
