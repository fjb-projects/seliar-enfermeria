import type { EfaEpisodeWorkspaceSection } from "@/components/EfaEpisodeWorkspace";

/**
 * Remembers, per user and per service (episode), where the user left its work area:
 * the last active section and, per section, the selected record and step.
 * Only ids and step numbers are stored, never patient data.
 */

export type EfaEpisodeSectionPosition = {
  recordId: string | null;
  step: number;
};

export type EfaEpisodePosition = {
  version: 1;
  section: EfaEpisodeWorkspaceSection;
  sections: Partial<Record<EfaEpisodeWorkspaceSection, EfaEpisodeSectionPosition>>;
  updatedAt: string;
};

export type EfaEpisodePositionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const EPISODE_POSITION_VERSION = 1;
export const EFA_EPISODE_POSITION_TTL_MS = 48 * 60 * 60 * 1000;

const WORKSPACE_SECTIONS = {
  communications: true,
  dispatches: true,
  police: true,
  observations: true,
} satisfies Record<EfaEpisodeWorkspaceSection, true>;

function isWorkspaceSection(value: unknown): value is EfaEpisodeWorkspaceSection {
  return typeof value === "string" && Object.hasOwn(WORKSPACE_SECTIONS, value);
}

function isSectionPosition(value: unknown): value is EfaEpisodeSectionPosition {
  if (typeof value !== "object" || value === null) return false;
  const { recordId, step } = value as Record<string, unknown>;
  return (
    (recordId === null || (typeof recordId === "string" && recordId.length > 0)) &&
    typeof step === "number" &&
    Number.isSafeInteger(step) &&
    step >= 0
  );
}

export function episodePositionStorageKey(userId: string, episodeId: string) {
  return `efa:episode-position:v${EPISODE_POSITION_VERSION}:${encodeURIComponent(userId)}:${encodeURIComponent(episodeId)}`;
}

/** Returns `window.localStorage`, or null on the server or when the browser blocks it. */
export function getEpisodePositionStorage(): EfaEpisodePositionStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function parseEpisodePosition(raw: string, now: number): EfaEpisodePosition | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const {
    version,
    section,
    sections: storedSections,
    updatedAt: storedUpdatedAt,
  } = value as Record<string, unknown>;
  if (version !== EPISODE_POSITION_VERSION || !isWorkspaceSection(section)) return null;
  if (typeof storedUpdatedAt !== "string") return null;
  const updatedAt = Date.parse(storedUpdatedAt);
  if (!Number.isFinite(updatedAt) || updatedAt > now) return null;
  if (now - updatedAt >= EFA_EPISODE_POSITION_TTL_MS) return null;

  const sections: EfaEpisodePosition["sections"] = {};
  if (
    typeof storedSections === "object" &&
    storedSections !== null &&
    !Array.isArray(storedSections)
  ) {
    for (const [sectionId, position] of Object.entries(storedSections)) {
      if (!isWorkspaceSection(sectionId) || !isSectionPosition(position)) continue;
      sections[sectionId] = { recordId: position.recordId, step: position.step };
    }
  }

  return { version: EPISODE_POSITION_VERSION, section, sections, updatedAt: storedUpdatedAt };
}

/** Reads a remembered position; invalid or expired entries are removed and read as null. */
export function readEpisodePosition(
  storage: EfaEpisodePositionStorage | null,
  userId: string,
  episodeId: string,
  now: number = Date.now(),
): EfaEpisodePosition | null {
  if (!storage) return null;
  const key = episodePositionStorageKey(userId, episodeId);
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const position = parseEpisodePosition(raw, now);
    if (!position) storage.removeItem(key);
    return position;
  } catch {
    return null;
  }
}

function writeEpisodePosition(
  storage: EfaEpisodePositionStorage,
  userId: string,
  episodeId: string,
  position: EfaEpisodePosition,
) {
  try {
    storage.setItem(episodePositionStorageKey(userId, episodeId), JSON.stringify(position));
  } catch {
    // Remembering the position is a convenience; the work area keeps working without it.
  }
}

/** Remembers the active section, keeping the per-section positions already stored. */
export function saveEpisodeSection(
  storage: EfaEpisodePositionStorage | null,
  userId: string,
  episodeId: string,
  section: EfaEpisodeWorkspaceSection,
  now: number = Date.now(),
) {
  if (!storage || !isWorkspaceSection(section)) return;
  const current = readEpisodePosition(storage, userId, episodeId, now);
  writeEpisodePosition(storage, userId, episodeId, {
    version: EPISODE_POSITION_VERSION,
    section,
    sections: current?.sections ?? {},
    updatedAt: new Date(now).toISOString(),
  });
}

/** Remembers one section's selected record and step, keeping the active section and the others. */
export function saveEpisodeSectionPosition(
  storage: EfaEpisodePositionStorage | null,
  userId: string,
  episodeId: string,
  section: EfaEpisodeWorkspaceSection,
  position: EfaEpisodeSectionPosition,
  now: number = Date.now(),
) {
  if (!storage || !isWorkspaceSection(section) || !isSectionPosition(position)) return;
  const current = readEpisodePosition(storage, userId, episodeId, now);
  writeEpisodePosition(storage, userId, episodeId, {
    version: EPISODE_POSITION_VERSION,
    section: current?.section ?? section,
    sections: {
      ...current?.sections,
      [section]: { recordId: position.recordId, step: position.step },
    },
    updatedAt: new Date(now).toISOString(),
  });
}

/** Forgets a service's position, e.g. after it was closed or cancelled. */
export function clearEpisodePosition(
  storage: EfaEpisodePositionStorage | null,
  userId: string,
  episodeId: string,
) {
  if (!storage) return;
  try {
    storage.removeItem(episodePositionStorageKey(userId, episodeId));
  } catch {
    // A failing storage has nothing reliable to clear.
  }
}

/** An explicit section wins over the remembered one, which wins over the fallback. */
export function resolveWorkspaceSection(
  explicit: EfaEpisodeWorkspaceSection | undefined,
  remembered: EfaEpisodeWorkspaceSection | null | undefined,
  fallback: EfaEpisodeWorkspaceSection,
): EfaEpisodeWorkspaceSection {
  return explicit ?? remembered ?? fallback;
}
