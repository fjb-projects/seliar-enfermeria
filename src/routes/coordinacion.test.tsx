import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { resolveCoordinationAdminSession } from "./coordinacion";

const session = (roles: string[]) => ({
  user: { id: "u1", name: "Ana", email: "ana@example.test" },
  roles,
  expiresAt: "2026-10-27T00:00:00Z",
});
function redirectHref(run: () => unknown) {
  try {
    run();
  } catch (error) {
    if (isRedirect(error)) return error.options.href;
    throw error;
  }
  return null;
}

describe("coordination admin route access", () => {
  it("redirects anonymous visitors to login and non-admins to the panel", () => {
    expect(redirectHref(() => resolveCoordinationAdminSession({ status: "anonymous" }))).toBe(
      "/login?returnTo=%2Fcoordinacion",
    );
    expect(
      redirectHref(() =>
        resolveCoordinationAdminSession({ status: "authenticated", session: session(["efa"]) }),
      ),
    ).toBe("/panel");
  });
  it("admits administrators and fails closed for unavailable sessions", () => {
    expect(
      resolveCoordinationAdminSession({ status: "authenticated", session: session(["admin"]) }),
    ).toEqual({ session: session(["admin"]) });
    expect(() => resolveCoordinationAdminSession({ status: "unavailable" })).toThrow(
      "Session could not be verified",
    );
  });
});
