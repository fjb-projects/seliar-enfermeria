import { describe, expect, it, vi } from "vitest";
import { readSessionSnapshot } from "./auth-session.server";

const current = {
  user: { id: "user-1", name: "EFA", email: "efa@example.test" },
  session: { expiresAt: new Date(Date.now() + 60_000) },
};

describe("read session snapshot", () => {
  it("reads Better Auth once and resolves fresh access from that same user", async () => {
    const getSession = vi.fn().mockResolvedValue(current);
    const loadAccess = vi.fn().mockResolvedValue({ isActive: true, roles: ["efa"] });

    await expect(readSessionSnapshot(getSession, loadAccess)).resolves.toMatchObject({
      user: current.user,
      roles: ["efa"],
    });
    expect(getSession).toHaveBeenCalledOnce();
    expect(loadAccess).toHaveBeenCalledExactlyOnceWith("user-1");
  });

  it("keeps absent and inactive accounts unauthenticated", async () => {
    await expect(readSessionSnapshot(vi.fn().mockResolvedValue(null), vi.fn())).resolves.toBeNull();
    await expect(
      readSessionSnapshot(
        vi.fn().mockResolvedValue(current),
        vi.fn().mockResolvedValue({ isActive: false, roles: [] }),
      ),
    ).resolves.toBeNull();
  });

  it("turns provider failures into retryable errors without preserving secret causes", async () => {
    const failure = new Error("query password=secret-marker");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    let thrown: unknown;
    try {
      await readSessionSnapshot(vi.fn().mockRejectedValue(failure), vi.fn());
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain("No se pudo cargar esta pantalla");
    expect((thrown as Error).cause).toBeUndefined();
    expect((thrown as Error).message).not.toContain("secret-marker");
    expect(log).toHaveBeenCalledOnce();
  });

  it("also sanitizes database access failures after the single session read", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const getSession = vi.fn().mockResolvedValue(current);
    const failure = new Error("database host=private-marker");
    let thrown: unknown;
    try {
      await readSessionSnapshot(getSession, vi.fn().mockRejectedValue(failure));
    } catch (error) {
      thrown = error;
    }
    expect(getSession).toHaveBeenCalledOnce();
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).cause).toBeUndefined();
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-marker");
  });
});
