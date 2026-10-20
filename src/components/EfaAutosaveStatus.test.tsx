import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EfaAutosaveStatus } from "./EfaAutosaveStatus";

describe("EfaAutosaveStatus", () => {
  it("keeps an empty live region while idle so later changes are announced", () => {
    for (const status of [
      { kind: "idle" } as const,
      { kind: "blocked", reason: "not_dirty" } as const,
    ]) {
      const html = renderToStaticMarkup(<EfaAutosaveStatus status={status} />);
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).not.toContain("<svg");
      expect(html.replace(/<[^>]+>/g, "")).toBe("");
    }
  });

  it("announces the label politely with a hidden icon", () => {
    const html = renderToStaticMarkup(
      <EfaAutosaveStatus status={{ kind: "saved", at: new Date("2026-10-14T17:09:00.000Z") }} />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("text-xs text-muted-foreground");
    expect(html).toContain("Guardado 14:09");
    expect(html).toContain('aria-hidden="true"');
  });

  it("renders the saving, dirty, offline and error copy", () => {
    const saving = renderToStaticMarkup(<EfaAutosaveStatus status={{ kind: "saving" }} />);
    expect(saving).toContain("Guardando…");
    expect(saving).toContain("motion-safe:animate-spin");
    expect(renderToStaticMarkup(<EfaAutosaveStatus status={{ kind: "dirty" }} />)).toContain(
      "Sin guardar",
    );
    expect(renderToStaticMarkup(<EfaAutosaveStatus status={{ kind: "offline" }} />)).toContain(
      "Sin conexión: se guardará al reconectar",
    );
    expect(
      renderToStaticMarkup(<EfaAutosaveStatus status={{ kind: "error", message: "Falló." }} />),
    ).toContain("Falló.");
  });
});
