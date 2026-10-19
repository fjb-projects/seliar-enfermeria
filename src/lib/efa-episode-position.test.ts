import { describe, expect, it } from "vitest";
import {
  EFA_EPISODE_POSITION_TTL_MS,
  clearEpisodePosition,
  episodePositionStorageKey,
  readEpisodePosition,
  resolveWorkspaceSection,
  saveEpisodeSection,
  saveEpisodeSectionPosition,
  type EfaEpisodePositionStorage,
} from "./efa-episode-position";

function createMemoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage: EfaEpisodePositionStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
  return { storage, values };
}

const throwingStorage: EfaEpisodePositionStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

const NOW = Date.parse("2026-10-19T12:00:00.000Z");

describe("episode position store", () => {
  it("round-trips the section and per-section positions for one user and episode", () => {
    const { storage } = createMemoryStorage();
    saveEpisodeSection(storage, "user-1", "episode-1", "dispatches", NOW);
    saveEpisodeSectionPosition(
      storage,
      "user-1",
      "episode-1",
      "dispatches",
      { recordId: "dispatch-9", step: 3 },
      NOW,
    );

    expect(readEpisodePosition(storage, "user-1", "episode-1", NOW)).toEqual({
      version: 1,
      section: "dispatches",
      sections: { dispatches: { recordId: "dispatch-9", step: 3 } },
      updatedAt: new Date(NOW).toISOString(),
    });
  });

  it("isolates positions between users and between episodes", () => {
    const { storage } = createMemoryStorage();
    saveEpisodeSection(storage, "user-1", "episode-1", "police", NOW);
    saveEpisodeSection(storage, "user-2", "episode-1", "observations", NOW);
    saveEpisodeSection(storage, "user-1", "episode-2", "dispatches", NOW);

    expect(readEpisodePosition(storage, "user-1", "episode-1", NOW)?.section).toBe("police");
    expect(readEpisodePosition(storage, "user-2", "episode-1", NOW)?.section).toBe("observations");
    expect(readEpisodePosition(storage, "user-1", "episode-2", NOW)?.section).toBe("dispatches");
    expect(readEpisodePosition(storage, "user-2", "episode-2", NOW)).toBeNull();
    expect(episodePositionStorageKey("user-1", "episode-1")).not.toBe(
      episodePositionStorageKey("user-2", "episode-1"),
    );
  });

  it("keeps existing per-section positions when only the section changes", () => {
    const { storage } = createMemoryStorage();
    saveEpisodeSectionPosition(
      storage,
      "user-1",
      "episode-1",
      "communications",
      { recordId: "call-1", step: 2 },
      NOW,
    );
    saveEpisodeSection(storage, "user-1", "episode-1", "dispatches", NOW + 1_000);

    const position = readEpisodePosition(storage, "user-1", "episode-1", NOW + 1_000);
    expect(position?.section).toBe("dispatches");
    expect(position?.sections).toEqual({ communications: { recordId: "call-1", step: 2 } });
    expect(position?.updatedAt).toBe(new Date(NOW + 1_000).toISOString());
  });

  it("keeps the section and the other sections when one section position changes", () => {
    const { storage } = createMemoryStorage();
    saveEpisodeSection(storage, "user-1", "episode-1", "police", NOW);
    saveEpisodeSectionPosition(
      storage,
      "user-1",
      "episode-1",
      "communications",
      { recordId: "call-1", step: 2 },
      NOW,
    );
    saveEpisodeSectionPosition(
      storage,
      "user-1",
      "episode-1",
      "dispatches",
      { recordId: null, step: 0 },
      NOW,
    );
    saveEpisodeSectionPosition(
      storage,
      "user-1",
      "episode-1",
      "communications",
      { recordId: "call-2", step: 1 },
      NOW,
    );

    expect(readEpisodePosition(storage, "user-1", "episode-1", NOW)).toMatchObject({
      section: "police",
      sections: {
        communications: { recordId: "call-2", step: 1 },
        dispatches: { recordId: null, step: 0 },
      },
    });
  });

  it("starts a new entry on the positioned section when nothing was remembered", () => {
    const { storage } = createMemoryStorage();
    saveEpisodeSectionPosition(
      storage,
      "user-1",
      "episode-1",
      "dispatches",
      { recordId: "dispatch-1", step: 4 },
      NOW,
    );
    expect(readEpisodePosition(storage, "user-1", "episode-1", NOW)?.section).toBe("dispatches");
  });

  it("does not store an invalid section position", () => {
    const { storage, values } = createMemoryStorage();
    saveEpisodeSectionPosition(
      storage,
      "user-1",
      "episode-1",
      "dispatches",
      { recordId: "dispatch-1", step: -1 },
      NOW,
    );
    saveEpisodeSectionPosition(
      storage,
      "user-1",
      "episode-1",
      "dispatches",
      { recordId: "dispatch-1", step: 1.5 },
      NOW,
    );
    expect(values.size).toBe(0);
  });

  it("treats corrupt JSON, a wrong version or an unknown section as absent and removes the key", () => {
    const key = episodePositionStorageKey("user-1", "episode-1");
    const updatedAt = new Date(NOW).toISOString();
    for (const raw of [
      "{not json",
      "null",
      "[]",
      JSON.stringify({ version: 2, section: "dispatches", sections: {}, updatedAt }),
      JSON.stringify({ version: 1, section: "radio", sections: {}, updatedAt }),
      JSON.stringify({ version: 1, section: "dispatches", sections: {}, updatedAt: "yesterday" }),
    ]) {
      const { storage, values } = createMemoryStorage({ [key]: raw });
      expect(readEpisodePosition(storage, "user-1", "episode-1", NOW)).toBeNull();
      expect(values.has(key)).toBe(false);
    }
  });

  it("drops only the invalid per-section positions", () => {
    const key = episodePositionStorageKey("user-1", "episode-1");
    const { storage } = createMemoryStorage({
      [key]: JSON.stringify({
        version: 1,
        section: "communications",
        sections: {
          communications: { recordId: "call-1", step: 2 },
          dispatches: { recordId: "dispatch-1", step: -1 },
          police: { recordId: "coordination-1", step: 1.5 },
          observations: { recordId: 42, step: 0 },
          radio: { recordId: "x", step: 1 },
        },
        updatedAt: new Date(NOW).toISOString(),
      }),
    });

    expect(readEpisodePosition(storage, "user-1", "episode-1", NOW)?.sections).toEqual({
      communications: { recordId: "call-1", step: 2 },
    });
  });

  it("treats a non-object sections value as empty", () => {
    const key = episodePositionStorageKey("user-1", "episode-1");
    const { storage } = createMemoryStorage({
      [key]: JSON.stringify({
        version: 1,
        section: "police",
        sections: "oops",
        updatedAt: new Date(NOW).toISOString(),
      }),
    });
    expect(readEpisodePosition(storage, "user-1", "episode-1", NOW)).toMatchObject({
      section: "police",
      sections: {},
    });
  });

  it("expires positions older than 48 hours and removes them", () => {
    const { storage, values } = createMemoryStorage();
    saveEpisodeSection(storage, "user-1", "episode-1", "dispatches", NOW);
    const key = episodePositionStorageKey("user-1", "episode-1");

    expect(
      readEpisodePosition(storage, "user-1", "episode-1", NOW + EFA_EPISODE_POSITION_TTL_MS - 1),
    ).not.toBeNull();
    expect(values.has(key)).toBe(true);
    expect(
      readEpisodePosition(storage, "user-1", "episode-1", NOW + EFA_EPISODE_POSITION_TTL_MS),
    ).toBeNull();
    expect(values.has(key)).toBe(false);
  });

  it("treats a position stamped in the future as absent", () => {
    const { storage } = createMemoryStorage();
    saveEpisodeSection(storage, "user-1", "episode-1", "dispatches", NOW + 60_000);
    expect(readEpisodePosition(storage, "user-1", "episode-1", NOW)).toBeNull();
  });

  it("reads null and never throws when storage is unavailable", () => {
    expect(readEpisodePosition(throwingStorage, "user-1", "episode-1", NOW)).toBeNull();
    expect(readEpisodePosition(null, "user-1", "episode-1", NOW)).toBeNull();
    expect(() => {
      saveEpisodeSection(throwingStorage, "user-1", "episode-1", "dispatches", NOW);
      saveEpisodeSectionPosition(
        throwingStorage,
        "user-1",
        "episode-1",
        "dispatches",
        { recordId: "dispatch-1", step: 1 },
        NOW,
      );
      clearEpisodePosition(throwingStorage, "user-1", "episode-1");
      saveEpisodeSection(null, "user-1", "episode-1", "dispatches", NOW);
      clearEpisodePosition(null, "user-1", "episode-1");
    }).not.toThrow();
  });

  it("clears only the given episode for the given user", () => {
    const { storage } = createMemoryStorage();
    saveEpisodeSection(storage, "user-1", "episode-1", "dispatches", NOW);
    saveEpisodeSection(storage, "user-1", "episode-2", "police", NOW);
    saveEpisodeSection(storage, "user-2", "episode-1", "observations", NOW);

    clearEpisodePosition(storage, "user-1", "episode-1");

    expect(readEpisodePosition(storage, "user-1", "episode-1", NOW)).toBeNull();
    expect(readEpisodePosition(storage, "user-1", "episode-2", NOW)?.section).toBe("police");
    expect(readEpisodePosition(storage, "user-2", "episode-1", NOW)?.section).toBe("observations");
  });
});

describe("resolveWorkspaceSection", () => {
  it("prefers an explicit section, then the remembered one, then the fallback", () => {
    expect(resolveWorkspaceSection("police", "dispatches", "communications")).toBe("police");
    expect(resolveWorkspaceSection(undefined, "dispatches", "communications")).toBe("dispatches");
    expect(resolveWorkspaceSection(undefined, null, "communications")).toBe("communications");
  });
});
