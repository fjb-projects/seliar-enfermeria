/** Server-only Resend transport. It never reads environment variables or retries. */
import { renderResolutionEmailHtml } from "./compensatory-email-template";

export type ResolutionEmailContent = { subject: string; text: string };
export type ResolutionEmailOutcome =
  | { kind: "accepted"; providerId: string }
  | { kind: "definite_failure"; reason: "invalid_input" | "rate_limited" | "provider_rejected"; status?: number; retryAfterSeconds?: number }
  | { kind: "uncertain"; reason: "network_error" | "provider_server_error" | "provider_conflict" | "invalid_provider_response"; status?: number };

export type SendResolutionEmailInput = {
  apiKey: string;
  from: string;
  to: string;
  content: ResolutionEmailContent;
  /** Resend retains idempotency keys for 24 hours, not indefinitely. */
  idempotencyKey: string;
  /** Required injection point; tests must use a mock and never perform network I/O. */
  fetcher: typeof fetch;
};

function validEmailAddress(value: string): boolean {
  const address = value.trim().replace(/^.*<([^<>]+)>$/, "$1");
  return address.length <= 320 && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address);
}

function isValidInput(input: SendResolutionEmailInput): boolean {
  return Boolean(
    input.apiKey.trim() && input.apiKey.length <= 4096 &&
    input.from.length <= 400 && !/[\r\n]/.test(input.from) && validEmailAddress(input.from) &&
    input.to.length <= 320 && !/[\r\n]/.test(input.to) && validEmailAddress(input.to) &&
    input.idempotencyKey.length > 0 && input.idempotencyKey.length <= 256 && !/[\r\n]/.test(input.idempotencyKey) &&
    input.content.subject.trim() && input.content.subject.length <= 200 && !/[\r\n<>]/.test(input.content.subject) &&
    input.content.text.trim() && input.content.text.length <= 20_000 && !/<\/?[a-z][^>]*>/i.test(input.content.text),
  );
}

export async function sendResolutionEmail(input: SendResolutionEmailInput): Promise<ResolutionEmailOutcome> {
  if (!isValidInput(input)) return { kind: "definite_failure", reason: "invalid_input" };

  let response: Response;
  try {
    response = await input.fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey,
      },
      body: JSON.stringify({ from: input.from, to: [input.to], subject: input.content.subject, text: input.content.text, html: renderResolutionEmailHtml(input.content) }),
    });
  } catch {
    // A connection failure can happen after the provider accepted the message.
    return { kind: "uncertain", reason: "network_error" };
  }

  if (response.status === 429) {
    const raw = response.headers.get("retry-after");
    const parsed = raw ? Number(raw) : NaN;
    return { kind: "definite_failure", reason: "rate_limited", ...(Number.isFinite(parsed) && parsed >= 0 ? { retryAfterSeconds: parsed } : {}) };
  }
  // A concurrent idempotency request can still be processing at the provider.
  // Never classify a 409 as safe to replace with a fresh operation.
  if (response.status === 409) return { kind: "uncertain", reason: "provider_conflict", status: 409 };
  if (response.status >= 500) return { kind: "uncertain", reason: "provider_server_error", status: response.status };
  if (!response.ok) return { kind: "definite_failure", reason: "provider_rejected", status: response.status };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: "uncertain", reason: "invalid_provider_response", status: response.status };
  }
  if (typeof body !== "object" || body === null || !("id" in body) || typeof body.id !== "string" || !body.id.trim()) {
    return { kind: "uncertain", reason: "invalid_provider_response", status: response.status };
  }
  return { kind: "accepted", providerId: body.id };
}

export function createResolutionEmailText(snapshot: {
  agentName: string;
  requestId: string;
  decision: "approved" | "rejected";
  rationale: string;
}): ResolutionEmailContent {
  const safe = (value: string) => value.replace(/[<>]/g, "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 1000);
  const requestId = safe(snapshot.requestId);
  const rationale = safe(snapshot.rationale);
  const decision = snapshot.decision === "approved" ? "aprobada" : "rechazada";
  return {
    subject: `Resolución de solicitud ${requestId}`.slice(0, 200),
    text: `Hola, ${safe(snapshot.agentName)}.\n\nTu solicitud ${requestId} fue ${decision}.\n\nFundamento: ${rationale}\n\nEste correo informa la resolución registrada; no respondas con información sensible.`,
  };
}
