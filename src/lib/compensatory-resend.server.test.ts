import { describe, expect, it, vi } from "vitest";
import { createResolutionEmailText, sendResolutionEmail } from "./compensatory-resend.server";
import { renderResolutionEmailHtml } from "./compensatory-email-template";

const content = { subject: "Resolución de solicitud", text: "La solicitud fue aprobada." };
const base = {
  apiKey: "re_test_secret",
  from: "Turnos <turnos@example.org>",
  to: "agent@example.org",
  content,
  idempotencyKey: "decision-123",
};
const response = (status: number, body: unknown, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, ...(headers ? { headers } : {}) });

describe("Resend compensatory resolution transport", () => {
  it("sends HTML and plain text with auth and idempotency headers and returns provider ID", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(200, { id: "email-1" }));
    const result = await sendResolutionEmail({ ...base, fetcher });
    expect(result).toEqual({ kind: "accepted", providerId: "email-1" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer re_test_secret");
    expect(new Headers(init?.headers).get("idempotency-key")).toBe("decision-123");
    expect(JSON.parse(String(init?.body))).toEqual({ from: base.from, to: [base.to], subject: content.subject, text: content.text, html: renderResolutionEmailHtml(content) });
  });

  it("does not access fetch for invalid recipient or unsafe content", async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect((await sendResolutionEmail({ ...base, to: "agent@example.org\r\nBcc:evil@example.org", fetcher })).kind).toBe("definite_failure");
    expect((await sendResolutionEmail({ ...base, content: { ...content, text: "<script>alert(1)</script>" }, fetcher })).kind).toBe("definite_failure");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns retry guidance for rate limits without exposing provider body", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(429, { message: "private data" }, { "retry-after": "30" }));
    expect(await sendResolutionEmail({ ...base, fetcher })).toEqual({ kind: "definite_failure", reason: "rate_limited", retryAfterSeconds: 30 });
  });

  it("distinguishes definitive provider rejection from ambiguous server or network outcomes", async () => {
    const rejected = vi.fn<typeof fetch>().mockResolvedValue(response(422, { message: "agent@example.org rejected" }));
    expect(await sendResolutionEmail({ ...base, fetcher: rejected })).toEqual({ kind: "definite_failure", reason: "provider_rejected", status: 422 });
    const serverError = vi.fn<typeof fetch>().mockResolvedValue(response(503, {}));
    expect(await sendResolutionEmail({ ...base, fetcher: serverError })).toEqual({ kind: "uncertain", reason: "provider_server_error", status: 503 });
    const network = vi.fn<typeof fetch>().mockRejectedValue(new Error("secret and recipient must not escape"));
    expect(await sendResolutionEmail({ ...base, fetcher: network })).toEqual({ kind: "uncertain", reason: "network_error" });
  });

  it("does not treat idempotency conflicts as safe success or retryable failure", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(409, { message: "key mismatch" }));
    expect(await sendResolutionEmail({ ...base, fetcher })).toEqual({ kind: "uncertain", reason: "provider_conflict", status: 409 });
  });

  it("creates a plain-text resolution from an explicit snapshot without HTML interpretation", () => {
    expect(createResolutionEmailText({ agentName: "Ana", requestId: "R-17", decision: "approved", rationale: "Cobertura confirmada" })).toEqual({
      subject: "Resolución de solicitud R-17",
      text: "Hola, Ana.\n\nTu solicitud R-17 fue aprobada.\n\nFundamento: Cobertura confirmada\n\nEste correo informa la resolución registrada; no respondas con información sensible.",
    });
    expect(createResolutionEmailText({ agentName: "<script>", requestId: "R-17", decision: "rejected", rationale: "<img src=x>" }).text).not.toContain("<script>");
  });
});
