import { describe, expect, it, vi } from "vitest";
import {
  findOwnOpenGuard,
  mapQuickGuardEndError,
  quickGuardEndDescription,
  quickGuardEndLabel,
  quickGuardEndTargetKey,
  runQuickGuardEnd,
  shouldShowQuickGuardEnd,
} from "./efa-quick-guard-end";

const openGuard = { startedAt: "2026-10-16T11:09:00.000Z", baseCount: 2, activeEpisodeCount: 0 };

describe("quick guard end visibility", () => {
  it("shows the control only when the user has an open guard", () => {
    expect(shouldShowQuickGuardEnd({ openGuard, pathname: "/panel" })).toBe(true);
    expect(shouldShowQuickGuardEnd({ openGuard: null, pathname: "/panel" })).toBe(false);
    expect(shouldShowQuickGuardEnd({ openGuard: undefined, pathname: "/panel" })).toBe(false);
  });

  it("hides the control on the guard page so its own close gating applies", () => {
    expect(shouldShowQuickGuardEnd({ openGuard, pathname: "/guardia-efa" })).toBe(false);
  });
});

describe("quick guard end copy", () => {
  it("labels the open guard with its Buenos Aires start time", () => {
    expect(quickGuardEndLabel(openGuard.startedAt)).toBe("Guardia en curso · 08:09");
  });

  it("states the start time and the consequence in the confirmation", () => {
    expect(quickGuardEndDescription(openGuard.startedAt)).toBe(
      "Guardia iniciada a las 08:09. Se termina con la hora actual y no admite nuevos registros.",
    );
  });

  it("keys the confirmation by user and guard start", () => {
    expect(quickGuardEndTargetKey("user-1", openGuard)).toBe("user-1:2026-10-16T11:09:00.000Z");
    expect(quickGuardEndTargetKey("user-1", null)).toBeNull();
    expect(quickGuardEndTargetKey(null, openGuard)).toBeNull();
  });
});

describe("findOwnOpenGuard", () => {
  it("returns only the user's guard without an end", () => {
    const guards = [
      { id: "g-1", ownerUserId: "user-2", endedAt: null, version: 1 },
      { id: "g-2", ownerUserId: "user-1", endedAt: "2026-10-15T10:00:00.000Z", version: 4 },
      { id: "g-3", ownerUserId: "user-1", endedAt: null, version: 3 },
    ];
    expect(findOwnOpenGuard(guards, "user-1")?.id).toBe("g-3");
    expect(findOwnOpenGuard(guards.slice(0, 2), "user-1")).toBeNull();
  });
});

describe("mapQuickGuardEndError", () => {
  it("maps a version conflict to a retry message", () => {
    expect(
      mapQuickGuardEndError(new Error("La guardia cambió; actualiza la lista antes de continuar.")),
    ).toEqual({ kind: "stale", message: "La guardia cambió, intentá de nuevo." });
  });

  it("maps an already ended guard to a refresh outcome", () => {
    expect(mapQuickGuardEndError(new Error("La guardia ya está terminada."))).toEqual({
      kind: "already-ended",
      message: "La guardia ya estaba terminada.",
    });
  });

  it("falls back to a generic message", () => {
    expect(mapQuickGuardEndError(new Error("boom"))).toEqual({
      kind: "generic",
      message: "No se pudo terminar la guardia. Inténtalo nuevamente.",
    });
    expect(mapQuickGuardEndError("not an error").kind).toBe("generic");
  });
});

describe("runQuickGuardEnd", () => {
  it("ends the fresh own open guard with its current version", async () => {
    const endGuard = vi.fn(async () => undefined);
    const result = await runQuickGuardEnd({
      userId: "user-1",
      listGuards: async () => [{ id: "g-3", ownerUserId: "user-1", endedAt: null, version: 7 }],
      endGuard,
    });
    expect(endGuard).toHaveBeenCalledWith({ guardId: "g-3", expectedVersion: 7 });
    expect(result).toEqual({ status: "ended" });
  });

  it("reports when there is no open guard anymore without ending anything", async () => {
    const endGuard = vi.fn(async () => undefined);
    const result = await runQuickGuardEnd({
      userId: "user-1",
      listGuards: async () => [],
      endGuard,
    });
    expect(endGuard).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "no-open-guard" });
  });

  it("maps failures from the end call", async () => {
    const result = await runQuickGuardEnd({
      userId: "user-1",
      listGuards: async () => [{ id: "g-3", ownerUserId: "user-1", endedAt: null, version: 7 }],
      endGuard: async () => {
        throw new Error("La guardia cambió; actualiza la lista antes de continuar.");
      },
    });
    expect(result).toEqual({
      status: "error",
      error: { kind: "stale", message: "La guardia cambió, intentá de nuevo." },
    });
  });

  it("maps failures from the guard lookup", async () => {
    const result = await runQuickGuardEnd({
      userId: "user-1",
      listGuards: async () => {
        throw new Error("offline");
      },
      endGuard: vi.fn(),
    });
    expect(result.status).toBe("error");
  });
});
