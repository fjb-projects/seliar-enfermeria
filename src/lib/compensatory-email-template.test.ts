import { describe, expect, it } from "vitest";
import { formatRequestedHours, renderResolutionEmailHtml } from "./compensatory-email-template";

describe("compensatory email template", () => {
  it("formats complete and fractional hours without losing requested time", () => {
    expect(formatRequestedHours(60)).toBe("1 hora");
    expect(formatRequestedHours(120)).toBe("2 horas");
    expect(formatRequestedHours(150)).toBe("2,5 horas");
    expect(formatRequestedHours(1)).toBe("0 h 01 min");
    expect(formatRequestedHours(65)).toBe("1 h 05 min");
  });
  it("renders a responsive institutional email without remote assets", () => {
    const html = renderResolutionEmailHtml({ subject: "Solicitud aprobada", text: "Hola Ana,\n\nHoras solicitadas: 2,5 horas\nFundamento: Autorizado" });
    expect(html).toContain('lang="es"');
    expect(html).toContain("Coordinación de Enfermería");
    expect(html).toContain("SeLIAR");
    expect(html).toContain("max-width:600px");
    expect(html).toContain("2,5 horas");
    expect(html).not.toMatch(/<script|<img|background=["']https?:|background-image:\s*url\(/);
    expect(html).toContain('href="https://wa.me/');
  });
  it("uses a CSS gradient with a solid fallback for both resolutions", () => {
    for (const decision of ["aprobada", "rechazada"]) {
      const html = renderResolutionEmailHtml({ subject: `Resolución: ${decision}`, text: "Horas solicitadas: 2 horas" });
      expect(html).toContain('bgcolor="#ff5500"');
      expect(html).toContain("background-color:#ff5500;background-image:linear-gradient(135deg,#ff5500,#ffb347)");
      expect(html).not.toContain("x02.me");
      expect(html).not.toContain("background-size:cover");
    }
  });
  it("escapes all content rather than interpreting names and grounds as HTML", () => {
    const html = renderResolutionEmailHtml({ subject: '<img src=x onerror="x">', text: "A & B\n<script>alert('x')</script>" });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A &amp; B");
  });
});
