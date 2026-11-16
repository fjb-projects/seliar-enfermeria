import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicEmailField, resolveUniquePublicAgentId, type PublicAgentOption } from "./CompensatoryPublicForm";

describe("public agent selection", () => {
  const agents: PublicAgentOption[] = [
    { id: "agent-1", name: "Ana María Pérez", hasProfileEmail: false },
    { id: "agent-2", name: "Ana María Pérez", hasProfileEmail: true },
    { id: "agent-3", name: "Ana Pérez", hasProfileEmail: false },
  ];

  it("resolves a full official name only when it identifies exactly one agent", () => {
    expect(resolveUniquePublicAgentId(agents, "Ana Pérez")).toBe("agent-3");
    expect(resolveUniquePublicAgentId(agents, "Ana María Pérez")).toBeUndefined();
    expect(resolveUniquePublicAgentId(agents, "Ana")).toBeUndefined();
  });

  it("keeps the public name option free of identity and operational fields", () => {
    expect(agents[0]).toEqual({ id: "agent-1", name: "Ana María Pérez", hasProfileEmail: false });
  });
});

describe("public email field", () => {
  it("shows a clear message instead of an input when an email is registered", () => {
    const html = renderToStaticMarkup(<PublicEmailField hasProfileEmail value="" onChange={() => {}} />);
    expect(html).toContain("Ya hay un correo registrado para recibir la respuesta");
    expect(html).toContain("Si necesitás cambiarlo, contactá a Coordinación");
    expect(html).not.toContain("<input");
  });

  it("keeps the email input required when the profile has no email", () => {
    const html = renderToStaticMarkup(<PublicEmailField hasProfileEmail={false} value="" onChange={() => {}} />);
    expect(html).toContain('type="email"');
    expect(html).toContain("required");
    expect(html).toContain("Coordinación usará este correo");
  });
});
