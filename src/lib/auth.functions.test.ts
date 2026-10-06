import { describe, expect, it } from "vitest";
import { publicSession } from "./auth.functions";

describe("session response projection", () => {
  it("excludes session tokens and credential material", () => {
    expect(
      publicSession({
        user: { id: "u1", name: "Nurse", email: "n@example.test" },
        session: { expiresAt: new Date("2030-01-01") },
      }),
    ).toEqual({
      user: { id: "u1", name: "Nurse", email: "n@example.test" },
      expiresAt: new Date("2030-01-01").toISOString(),
    });
  });
});
