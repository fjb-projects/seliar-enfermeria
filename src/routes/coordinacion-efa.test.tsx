import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/efa-guard-oversight.functions", () => ({
  listEfaGuardOversight: vi.fn(),
  listEfaGuardServices: vi.fn(),
}));
vi.mock("@/lib/efa-guards.functions", () => ({ correctEfaGuardEnd: vi.fn() }));
vi.mock("@/lib/auth.functions", () => ({ readSession: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/efa-panel.functions", () => ({ getEfaPanelSummary: vi.fn() }));

import { resolveCoordinationSession } from "./coordinacion-efa";

const session = (roles: string[]) => ({
  user: { id: "user-1", name: "Ana Example", email: "ana@example.test" },
  roles,
  expiresAt: "2026-10-07T12:00:00.000Z",
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

describe("EFA coordination route access", () => {
  it("sends anonymous visitors to login with a return path", () => {
    expect(redirectHref(() => resolveCoordinationSession({ status: "anonymous" }))).toBe(
      "/login?returnTo=%2Fcoordinacion-efa",
    );
  });

  it("sends non-administrators back to the panel", () => {
    expect(
      redirectHref(() =>
        resolveCoordinationSession({ status: "authenticated", session: session(["efa"]) }),
      ),
    ).toBe("/panel");
  });

  it("admits administrators with their session", () => {
    expect(
      resolveCoordinationSession({ status: "authenticated", session: session(["admin"]) }),
    ).toEqual({ session: session(["admin"]) });
  });

  it("fails when the session cannot be verified", () => {
    expect(() => resolveCoordinationSession({ status: "unavailable" })).toThrow(
      "Session could not be verified",
    );
  });
});
