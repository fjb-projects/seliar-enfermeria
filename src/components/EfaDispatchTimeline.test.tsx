import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DispatchTimeline } from "@/components/EfaDispatchStepper";
import { emptyDispatchForm } from "@/lib/efa-dispatches.client";

describe("DispatchTimeline", () => {
  const render = (overrides: Record<string, string> = {}, activeStep = 2) =>
    renderToStaticMarkup(
      <DispatchTimeline
        form={{ ...emptyDispatchForm(), ...overrides }}
        onChange={vi.fn()}
        onNow={vi.fn()}
        activeStep={activeStep}
        after={{ t4At: <p>Destino de prueba</p> }}
      />,
    );

  it("lists the seven independent times at once, each with hour, Ahora and state", () => {
    const html = render();
    expect(html).toContain('aria-label="Línea de tiempo del despacho"');
    expect(html.match(/type="datetime-local"/g)).toHaveLength(7);
    expect(html.match(/>Ahora</g)).toHaveLength(7);
    expect(html.match(/aria-label="Estado: /g)).toHaveLength(7);
    expect(html).toContain("1. Despacho");
    expect(html).toContain("7. Disponible");
    expect(html).toContain('aria-label="Usar ahora para despacho"');
  });

  it("highlights only the current step", () => {
    const html = render({}, 2);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="step"[^>]*>[\s\S]*?3\. /);
  });

  it("marks observed times with a check and leaves the rest as plain dots", () => {
    const empty = render();
    expect(empty).not.toContain("lucide-check");
    const observed = render({ t0Status: "observed", t0At: "2026-11-14T06:15" });
    expect(observed.match(/lucide-check/g)).toHaveLength(1);
  });

  it("places extra content, such as the destination, right after its row", () => {
    const html = render();
    const arrival = html.indexOf("5. Llegada a destino");
    const destination = html.indexOf("Destino de prueba");
    const delivery = html.indexOf("6. ");
    expect(arrival).toBeGreaterThan(-1);
    expect(destination).toBeGreaterThan(arrival);
    expect(destination).toBeLessThan(delivery);
  });
});
