export type AuthDiagnosticPhase =
  "better-auth-api" | "better-auth-logger" | "session-read" | "access-session-read";

const SAFE_ERROR_CODES = new Set([
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  "08P01",
  "40001",
  "40P01",
  "53300",
  "57P01",
  "57P02",
  "57P03",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
  "ENOTFOUND",
]);

function ownDataValue(value: object, key: PropertyKey): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function safeErrorCode(value: unknown): string | undefined {
  const pending: unknown[] = [value];
  const visited = new Set<object>();
  for (let index = 0; index < pending.length && index < 8; index += 1) {
    const current = pending[index];
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);

    const code = ownDataValue(current, "code");
    if (typeof code === "string" && SAFE_ERROR_CODES.has(code)) return code;
    const cause = ownDataValue(current, "cause");
    if (cause !== undefined && pending.length < 8) pending.push(cause);
    let isArray = false;
    try {
      isArray = Array.isArray(current);
    } catch {
      continue;
    }
    if (isArray) {
      for (let itemIndex = 0; itemIndex < 3 && pending.length < 8; itemIndex += 1) {
        const item = ownDataValue(current, String(itemIndex));
        if (item !== undefined) pending.push(item);
      }
    }
  }
  return undefined;
}

export function reportAuthFailure(error: unknown, phase: AuthDiagnosticPhase): void {
  let errorClass: "Error" | "unknown" = "unknown";
  try {
    if (error instanceof Error) errorClass = "Error";
  } catch {
    // Untrusted thrown values may be proxies; diagnostics must remain best-effort.
  }
  const code = safeErrorCode(error);

  console.error("Authentication operation failed", {
    timestamp: new Date().toISOString(),
    phase,
    errorClass,
    ...(code ? { code } : {}),
  });
}

export function createSessionLoadError(): Error {
  return new Error("No se pudo cargar esta pantalla. Vuelve a intentarlo en unos minutos.");
}
