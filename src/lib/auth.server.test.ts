import { describe, expect, it } from "vitest";
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
});
