import { afterEach, describe, expect, it, vi } from "vitest";
import { reportAuthFailure } from "./auth-diagnostics.server";

describe("auth diagnostics", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs only allowlisted metadata from nested errors", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const nested = Object.assign(new Error("database URL contains secret-marker"), {
      code: "ECONNRESET",
    });
    const error = new Error("query contains private-marker", { cause: nested });
    error.stack = "private-stack-marker";

    reportAuthFailure(error, "session-read");

    expect(log).toHaveBeenCalledOnce();
    const emitted = JSON.stringify(log.mock.calls[0]);
    expect(emitted).toContain("ECONNRESET");
    expect(emitted).toContain("session-read");
    expect(emitted).not.toMatch(/secret-marker|private-marker|private-stack-marker|database URL/i);
  });

  it("omits unknown codes and safely handles cyclic causes", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("private-marker"), { code: "SELECT secret" }) as Error & {
      cause?: unknown;
    };
    error.cause = error;

    reportAuthFailure(error, "better-auth-api");

    const emitted = JSON.stringify(log.mock.calls[0]);
    expect(emitted).not.toContain("SELECT secret");
    expect(emitted).not.toContain("private-marker");
    expect(emitted).toContain('"errorClass":"Error"');
  });

  it("does not fail when a thrown value is a revoked proxy", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { proxy, revoke } = Proxy.revocable([], {});
    revoke();

    expect(() => reportAuthFailure(proxy, "session-read")).not.toThrow();
    expect(log).toHaveBeenCalledOnce();
  });
});
