import { describe, expect, it, vi } from "vitest";
import { authConfiguration } from "./auth.server";

describe("Better Auth configuration", () => {
  it("requires explicit secret and base URL without insecure defaults", () => {
    expect(() => authConfiguration({})).toThrow("BETTER_AUTH_SECRET");
    expect(() => authConfiguration({ BETTER_AUTH_SECRET: "s".repeat(32) })).toThrow(
      "BETTER_AUTH_URL",
    );
  });

  it("disables public account creation and configures the credential provider", () => {
    const config = authConfiguration({
      BETTER_AUTH_SECRET: "s".repeat(32),
      BETTER_AUTH_URL: "http://localhost:3000",
    });
    expect(config.emailAndPassword?.enabled).toBe(true);
    expect(config.emailAndPassword?.disableSignUp).toBe(true);
    expect(config.emailAndPassword?.minPasswordLength).toBe(12);
    expect(config.emailAndPassword?.maxPasswordLength).toBe(128);
  });

  it("routes Better Auth errors through sanitized diagnostics instead of its raw logger", () => {
    const config = authConfiguration({
      BETTER_AUTH_SECRET: "s".repeat(32),
      BETTER_AUTH_URL: "http://localhost:3000",
    });

    expect(config.onAPIError?.onError).toEqual(expect.any(Function));
    expect(config.logger?.log).toEqual(expect.any(Function));

    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("database URL password=secret-marker");
    config.onAPIError?.onError?.(error);
    config.logger?.log?.("error", "raw SQL private-marker", error);

    const diagnostics = JSON.stringify(log.mock.calls);
    expect(diagnostics).not.toMatch(/secret-marker|private-marker|raw SQL|database URL/i);
    expect(diagnostics).toContain("better-auth-api");
    expect(diagnostics).toContain("better-auth-logger");
    log.mockRestore();
  });
});
