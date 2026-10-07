export type EpisodeFormValues = {
  eventAt: string;
  motive: string;
  address: string;
  interventionNumber: string;
};

export type PendingEpisodeCreate = {
  kind: "create";
  operationId: string;
  payload: Readonly<{
    clientCreationKey: string;
    guardId: string;
    eventAt: string;
    motive: string;
    address: string;
    interventionNumber: string;
  }>;
};

export type PendingEpisodeUpdate = {
  kind: "update";
  operationId: string;
  payload: Readonly<{
    episodeId: string;
    expectedVersion: number;
    operationId: string;
    eventAt: string;
    motive: string | null;
    address: string | null;
    interventionNumber: string | null;
  }>;
};
export type PendingEpisodeClose = {
  kind: "close";
  operationId: string;
  payload: Readonly<{
    episodeId: string;
    expectedVersion: number;
    operationId: string;
  }>;
};
export type PendingEpisodeOperation =
  PendingEpisodeCreate | PendingEpisodeUpdate | PendingEpisodeClose;
export type EpisodeFormSource = {
  id: string;
  version: number;
  eventAt: Date | string;
  motive: string | null;
  address: string | null;
  interventionNumber: string | null;
};

export type EpisodeWriterSession = {
  user: { id: string };
  roles: string[];
  expiresAt: string;
} | null;

export function isActiveEpisodeWriterSession(
  session: EpisodeWriterSession,
  actorUserId: string,
  now = Date.now(),
): session is NonNullable<EpisodeWriterSession> {
  const expiresAt = session ? Date.parse(session.expiresAt) : Number.NaN;
  return Boolean(
    session &&
    session.user.id === actorUserId &&
    Number.isFinite(expiresAt) &&
    expiresAt > now &&
    (session.roles.includes("efa") || session.roles.includes("admin")),
  );
}

export async function dispatchEpisodeCloseWithFreshWriter<TResult>(
  payload: PendingEpisodeClose["payload"],
  actorUserId: string,
  readSession: () => Promise<EpisodeWriterSession>,
  close: (payload: PendingEpisodeClose["payload"]) => Promise<TResult>,
  now = Date.now(),
): Promise<TResult> {
  const session = await readSession();
  if (!isActiveEpisodeWriterSession(session, actorUserId, now)) {
    throw new Error("Current active EFA permission is required to close this episode.");
  }
  return close(payload);
}

export async function removeEpisodeOperationAfterFreshWriter<TResult>(
  actorUserId: string,
  readSession: () => Promise<EpisodeWriterSession>,
  isCurrent: () => boolean,
  remove: () => Promise<TResult>,
  now = Date.now(),
): Promise<TResult> {
  const session = await readSession();
  if (!isCurrent() || !isActiveEpisodeWriterSession(session, actorUserId, now)) {
    throw new Error("Current active EFA permission is required to resolve this episode operation.");
  }
  return remove();
}

export function mergeConfirmedEpisodeSnapshot<T extends { id: string; version: number }>(
  current: T[],
  refreshed: T[],
  confirmed: T,
): T[] {
  const merged = new Map<string, T>();
  for (const episode of [...refreshed, ...current, confirmed]) {
    const prior = merged.get(episode.id);
    if (!prior || episode.version >= prior.version) merged.set(episode.id, episode);
  }
  return [...merged.values()];
}

export function adoptConfirmedEpisodeToState<T extends { id: string; version: number }>(
  current: T[],
  confirmed: T,
  commit: (episodes: T[]) => void,
): T[] {
  const next = mergeConfirmedEpisodeSnapshot(current, [], confirmed);
  commit(next);
  return next;
}

export function createPendingCreate(
  guardId: string,
  form: EpisodeFormValues,
  makeId: () => string = () => crypto.randomUUID(),
): PendingEpisodeCreate {
  const operationId = makeId();
  return {
    kind: "create",
    operationId,
    payload: Object.freeze({ clientCreationKey: operationId, guardId, ...form }),
  };
}

export function createPendingUpdate(
  input: Omit<PendingEpisodeUpdate["payload"], "operationId">,
  makeId: () => string = () => crypto.randomUUID(),
): PendingEpisodeUpdate {
  const operationId = makeId();
  return {
    kind: "update",
    operationId,
    payload: Object.freeze({ ...input, operationId }),
  };
}

export function createPendingClose(
  episodeId: string,
  expectedVersion: number,
  makeId: () => string = () => crypto.randomUUID(),
): PendingEpisodeClose {
  const operationId = makeId();
  return {
    kind: "close",
    operationId,
    payload: Object.freeze({ episodeId, expectedVersion, operationId }),
  };
}

export function localDateTimeToIso(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export function isoToLocalDateTimeValue(value: Date | string): string {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return "";
  return new Date(timestamp.getTime() - timestamp.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function validateEpisodeForm(
  form: EpisodeFormValues,
): { valid: true; eventAt: string } | { valid: false } {
  const eventAt = localDateTimeToIso(form.eventAt);
  return eventAt ? { valid: true, eventAt } : { valid: false };
}

export function confirmedEpisodeBaseline<T extends EpisodeFormSource>(
  saved: T,
  refreshed: T[],
): { episode: T; form: EpisodeFormValues } {
  const episode = refreshed.find((item) => item.id === saved.id) ?? saved;
  return {
    episode,
    form: {
      eventAt: isoToLocalDateTimeValue(episode.eventAt),
      motive: episode.motive ?? "",
      address: episode.address ?? "",
      interventionNumber: episode.interventionNumber ?? "",
    },
  };
}

export function episodeErrorKind(error: unknown): "conflict" | "permission" | "uncertain" {
  const message = error instanceof Error ? error.message : String(error);
  if (/cambi[oó]|version-conflict|stale/i.test(message)) return "conflict";
  if (/EFA|inactiva|administraci[oó]n|permiso/i.test(message)) return "permission";
  return "uncertain";
}
