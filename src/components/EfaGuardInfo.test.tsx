import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EfaGuardInfo, EfaGuardInfoContent } from "@/components/EfaGuardInfo";

describe("EfaGuardInfo", () => {
  it("states the guard scope and keeps a readable persistence warning", () => {
    const html = renderToStaticMarkup(<EfaGuardInfoContent startedAt="2026-10-06T09:00:00Z" />);
    expect(html).toContain("Guardia propia abierta desde");
    expect(html).toContain(
      "Solo se muestran servicios de la guardia abierta; no es el historial completo.",
    );
    expect(html).toContain("El texto que todavía no enviaste puede perderse.");
  });

  it("keeps technical privacy detail under its own heading", () => {
    const html = renderToStaticMarkup(<EfaGuardInfoContent startedAt="2026-10-06T09:00:00Z" />);
    expect(html).toContain("Guardado y privacidad");
    expect(html).toContain("en este dispositivo");
    expect(html).toContain("se almacenan en IndexedDB");
    expect(html).toContain("incluida la dirección");
    expect(html).not.toContain("legible por este origen");
    expect(html).not.toContain("guardado automático");
  });

  it("exposes one labelled control and leaves the content closed", () => {
    const html = renderToStaticMarkup(<EfaGuardInfo startedAt="2026-10-06T09:00:00Z" />);
    expect(html).toContain('aria-label="Información de la guardia y del guardado"');
    expect(html).not.toContain("IndexedDB");
  });
});
