import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAuthState = vi.hoisted(() => ({
  getSession: vi.fn(),
  databaseFailure: undefined as unknown,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator() {
      return this;
    },
    handler(handler: (input?: unknown) => unknown) {
      return handler;
    },
  }),
  createServerOnlyFn: (handler: (input?: unknown) => unknown) => handler,
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({ headers: new Headers() }),
}));
vi.mock("./auth.server", () => ({
  getAuth: () => ({ api: { getSession: mockAuthState.getSession } }),
  isAccountActive: vi.fn(),
}));
vi.mock("../db/index.server", () => ({
  getDatabase: () => ({
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => Promise.reject(mockAuthState.databaseFailure),
        }),
      }),
    }),
  }),
}));

import { currentAccessSession, publicSession } from "./auth.functions";

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

  it("sanitizes a rejected fresh access query before it leaves currentAccessSession", async () => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    mockAuthState.getSession.mockResolvedValue({
      user: { id: "user-1", name: "EFA", email: "efa@example.test" },
      session: { expiresAt: new Date(Date.now() + 60_000) },
    });
    mockAuthState.databaseFailure = Object.assign(
      new Error("SELECT private-sql marker; password=private-password"),
      { cause: new Error("connection host=private-host"), code: "SELECT private-code" },
    );

    let thrown: unknown;
    try {
      await currentAccessSession();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(
      "No se pudo cargar esta pantalla. Vuelve a intentarlo en unos minutos.",
    );
    expect((thrown as Error).cause).toBeUndefined();
    const emitted = JSON.stringify(logger.mock.calls);
    expect(emitted).not.toMatch(/private-sql|private-password|private-host|private-code/);
    expect(emitted).toContain("access-session-read");
    logger.mockRestore();
  });
});

beforeEach(() => {
  mockAuthState.getSession.mockReset();
  mockAuthState.databaseFailure = undefined;
});

afterEach(() => vi.restoreAllMocks());
