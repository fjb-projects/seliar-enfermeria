import { describe, expect, it, vi } from "vitest";
import {
  createPendingCreate,
  createPendingClose,
  createPendingUpdate,
  adoptConfirmedEpisodeToState,
  dispatchEpisodeCloseWithFreshWriter,
  removeEpisodeOperationAfterFreshWriter,
  confirmedEpisodeBaseline,
  episodeErrorKind,
  mergeConfirmedEpisodeSnapshot,
  localDateTimeToIso,
  validateEpisodeForm,
} from "./efa-episodes.client";

describe("EFA episode client operation helpers", () => {
  it("checks the current queued actor and active write role immediately before closing", async () => {
    const payload = createPendingClose("episode-a", 4, () => "close-op").payload;
    const close = vi.fn(async () => ({ ok: true }));
    const session = {
      user: { id: "owner-a" },
      roles: ["efa"],
      expiresAt: "2026-10-07T13:00:00.000Z",
    };

    await expect(
      dispatchEpisodeCloseWithFreshWriter(
        payload,
        "owner-a",
        async () => session,
        close,
        Date.parse("2026-10-07T12:00:00.000Z"),
      ),
    ).resolves.toEqual({ ok: true });
    await expect(
      dispatchEpisodeCloseWithFreshWriter(
        payload,
        "owner-a",
        async () => ({ ...session, roles: [] }),
        close,
        Date.parse("2026-10-07T12:00:00.000Z"),
      ),
    ).rejects.toThrow(/EFA/i);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not remove a conflict after the fresh session loses write permission", async () => {
    const remove = vi.fn(async () => undefined);
    const session = {
      user: { id: "owner-a" },
      roles: [],
      expiresAt: "2026-10-07T13:00:00.000Z",
    };
    await expect(
      removeEpisodeOperationAfterFreshWriter(
        "owner-a",
        async () => session,
        () => true,
        remove,
        Date.parse("2026-10-07T12:00:00.000Z"),
      ),
    ).rejects.toThrow(/EFA/i);
    expect(remove).not.toHaveBeenCalled();
  });

  it("preserves a confirmed newer close against a stale list response", async () => {
    const active: {
      id: string;
      version: number;
      state: "draft" | "closed";
      closedAt: string | null;
    } = { id: "episode-a", version: 4, state: "draft", closedAt: null };
    const closed = {
      id: "episode-a",
      version: 5,
      state: "closed" as const,
      closedAt: "2026-10-07T10:00:00.000Z",
    };
    const later = { ...closed, version: 6, closedAt: "2026-10-07T10:05:00.000Z" };

    expect(mergeConfirmedEpisodeSnapshot([active], [active], closed)).toContainEqual(closed);
    expect(mergeConfirmedEpisodeSnapshot([closed], [active, later], closed)).toContainEqual(later);
  });

  it("adopts a confirmed close before an unresolved refresh and retains it after stale data", async () => {
    const active: {
      id: string;
      version: number;
      state: "draft" | "closed";
      closedAt: string | null;
    } = { id: "episode-a", version: 4, state: "draft", closedAt: null };
    const closed = {
      id: "episode-a",
      version: 5,
      state: "closed" as const,
      closedAt: "2026-10-07T10:00:00.000Z",
    };
    let state = [active];
    const committed = adoptConfirmedEpisodeToState(state, closed, (next) => {
      state = next;
    });
    let resolveRefresh!: (rows: (typeof active)[]) => void;
    const pendingRefresh = new Promise<(typeof active)[]>((resolve) => (resolveRefresh = resolve));

    expect(state).toEqual([closed]);
    resolveRefresh([active]);
    const staleRows = await pendingRefresh;
    state = mergeConfirmedEpisodeSnapshot(state, staleRows, closed);
    expect(committed).toEqual([closed]);
    expect(state).toEqual([closed]);
  });

  it("freezes a stable close operation and limits workspace rows to the selected guard", () => {
    const close = createPendingClose("episode-a", 4, () => "close-op");
    expect(close).toEqual({
      kind: "close",
      operationId: "close-op",
      payload: { episodeId: "episode-a", expectedVersion: 4, operationId: "close-op" },
    });
    expect(Object.isFrozen(close.payload)).toBe(true);
  });

  it("retains an exact immutable create payload and stable operation identity for retries", () => {
    const form = {
      eventAt: "2026-10-06T09:30:00.000Z",
      motive: "Traslado",
      address: " Calle privada 12 ",
      interventionNumber: "00017",
    };
    const first = createPendingCreate("guard-1", form, () => "stable-create-id");
    const retry = first;
    expect(retry).toBe(first);
    expect(retry.operationId).toBe("stable-create-id");
    expect(retry.payload).toEqual({
      clientCreationKey: "stable-create-id",
      guardId: "guard-1",
      ...form,
    });
    expect(Object.isFrozen(first.payload)).toBe(true);
  });

  it("creates a secure unique UUID when randomUUID is unavailable", () => {
    let nextByte = 1;
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(nextByte++);
        return bytes;
      },
    });

    try {
      const first = createPendingCreate("guard-1", {
        eventAt: "2026-10-06T09:30:00.000Z",
        motive: "",
        address: "",
        interventionNumber: "",
      });
      const second = createPendingCreate("guard-1", {
        eventAt: "2026-10-06T09:30:00.000Z",
        motive: "",
        address: "",
        interventionNumber: "",
      });

      expect(first.operationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(second.operationId).not.toBe(first.operationId);
      expect(first.payload.clientCreationKey).toBe(first.operationId);
      expect(second.payload.clientCreationKey).toBe(second.operationId);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps update retries tied to their original expected version and classifies conflicts", () => {
    const pending = createPendingUpdate(
      {
        episodeId: "episode-1",
        expectedVersion: 3,
        eventAt: "2026-10-06T09:30:00.000Z",
        motive: "Traslado",
        address: null,
        interventionNumber: null,
      },
      () => "stable-update-id",
    );
    expect(pending.payload).toMatchObject({ operationId: "stable-update-id", expectedVersion: 3 });
    expect(episodeErrorKind(new Error("El episodio cambió; actualiza el historial"))).toBe(
      "conflict",
    );
    expect(episodeErrorKind(new Error("network timeout"))).toBe("uncertain");
    expect(episodeErrorKind(new Error("Se requiere acceso EFA vigente."))).toBe("permission");
  });

  it("converts local date/time input into an absolute ISO timestamp", () => {
    const local = "2026-10-06T09:30";
    expect(localDateTimeToIso(local)).toBe(new Date(local).toISOString());
    expect(localDateTimeToIso("")).toBeNull();
  });

  it("accepts a timestamp-only draft and allows both optional identifiers to be cleared", () => {
    const form = {
      eventAt: "2026-10-06T09:30",
      motive: "",
      address: "",
      interventionNumber: "",
    };
    expect(validateEpisodeForm(form)).toEqual({
      valid: true,
      eventAt: new Date(form.eventAt).toISOString(),
    });
    expect(validateEpisodeForm({ ...form, eventAt: "" }).valid).toBe(false);
    expect(
      createPendingCreate("guard-1", {
        ...form,
        eventAt: new Date(form.eventAt).toISOString(),
      }).payload,
    ).toMatchObject({ motive: "", address: "" });
  });

  it("uses the current server episode as the confirmed form baseline", () => {
    const saved = {
      id: "episode-1",
      version: 2,
      eventAt: "2026-10-06T09:30:00.000Z",
      motive: "My accepted value",
      address: null,
      interventionNumber: null,
    };
    const refreshed = {
      ...saved,
      version: 3,
      eventAt: "2026-10-06T10:30:00.000Z",
      motive: "Later administrator correction",
    };
    const baseline = confirmedEpisodeBaseline(saved, [refreshed]);

    expect(baseline.episode).toEqual(refreshed);
    expect(baseline.form).toEqual({
      eventAt: (() => {
        const date = new Date("2026-10-06T10:30:00.000Z");
        return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
          .toISOString()
          .slice(0, 16);
      })(),
      motive: "Later administrator correction",
      address: "",
      interventionNumber: "",
    });
  });
});
