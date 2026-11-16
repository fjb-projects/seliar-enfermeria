/** Saved selector metadata stays in the current route, never in browser storage. */
export type EfaMetadataCall = {
  id: string;
  episodeId: string;
  ownerUserId: string;
  version?: number | undefined;
  createdAt: Date | string;
  priority?: string | null | undefined;
  state?: string | undefined;
  cancelledAt?: Date | string | null | undefined;
};
export type EfaMetadataDispatch = Omit<EfaMetadataCall, "priority"> & {
  baseId: string;
  baseName?: string | null | undefined;
  finalizedAt?: Date | string | null | undefined;
};
export type EfaServiceMetadata = {
  priority: "red" | "yellow" | "green" | null;
  mobiles: string[];
  status: "loading" | "ready" | "error";
};
/**
 * Input of the selector's list reads. `listEfaCommunicationsForEpisode` and
 * `listEfaDispatchesForEpisode` validate the episode id itself (a UUID string), not an object.
 */
export function selectorListRequest(episodeId: string) {
  return { data: episodeId };
}
type Loader<T> = () => Promise<T[]>;
type Loaders = { calls: Loader<EfaMetadataCall>; dispatches: Loader<EfaMetadataDispatch> };
export type EfaServiceMetadataStore = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): ReadonlyMap<string, EfaServiceMetadata>;
  get(episodeId: string): EfaServiceMetadata;
  load(episodeId: string, loaders: Loaders): Promise<void>;
  readCalls<T extends EfaMetadataCall>(episodeId: string, loader: Loader<T>): Promise<T[]>;
  readDispatches<T extends EfaMetadataDispatch>(episodeId: string, loader: Loader<T>): Promise<T[]>;
  publishCalls(episodeId: string, calls: EfaMetadataCall[]): void;
  publishDispatches(episodeId: string, dispatches: EfaMetadataDispatch[]): void;
  upsertCall(episodeId: string, call: EfaMetadataCall): void;
  upsertDispatch(episodeId: string, dispatch: EfaMetadataDispatch): void;
  dispose(): void;
};

function compareCreation(a: EfaMetadataCall, b: EfaMetadataCall) {
  const aTime = new Date(a.createdAt).getTime();
  const bTime = new Date(b.createdAt).getTime();
  const timeDifference =
    (Number.isFinite(aTime) ? aTime : 0) - (Number.isFinite(bTime) ? bTime : 0);
  return timeDifference || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function deriveEfaServiceMetadata(
  calls: readonly EfaMetadataCall[],
  dispatches: readonly EfaMetadataDispatch[],
): Pick<EfaServiceMetadata, "priority" | "mobiles"> {
  const latest = calls
    .filter(
      (row) =>
        row.state !== "cancelled" &&
        !row.cancelledAt &&
        ["red", "yellow", "green"].includes(row.priority ?? ""),
    )
    .reduce<EfaMetadataCall | null>(
      (selected, row) => (!selected || compareCreation(row, selected) > 0 ? row : selected),
      null,
    );
  const activeBases = new Map<string, EfaMetadataDispatch>();
  for (const row of dispatches) {
    if (
      !row.baseId ||
      row.state === "cancelled" ||
      row.state === "finalized" ||
      row.cancelledAt ||
      row.finalizedAt
    )
      continue;
    const previous = activeBases.get(row.baseId);
    if (!previous || compareCreation(row, previous) > 0) activeBases.set(row.baseId, row);
  }
  const mobiles = [...activeBases.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, row]) => {
      const name = row.baseName?.trim();
      if (!name) return "Móvil asignado";
      const compact = /^m[oó]vil\s+(?:n(?:ro\.?|[°º.]|úmero)?\s*)?(\d+)$/iu.exec(name);
      return compact?.[1] ?? name;
    });
  return { priority: (latest?.priority as EfaServiceMetadata["priority"]) ?? null, mobiles };
}

type Kind = "calls" | "dispatches";
type RecordRow = EfaMetadataCall | EfaMetadataDispatch;
type Resource = {
  rows: RecordRow[];
  generation: number;
  status: EfaServiceMetadata["status"];
  inflight: Promise<RecordRow[]> | null;
};
type Entry = Record<Kind, Resource>;
const emptyMetadata: EfaServiceMetadata = { priority: null, mobiles: [], status: "loading" };
const resource = (): Resource => ({ rows: [], generation: 0, status: "loading", inflight: null });
function metadataFields(row: RecordRow): EfaMetadataCall {
  return {
    id: row.id,
    episodeId: row.episodeId,
    ownerUserId: row.ownerUserId,
    version: row.version,
    createdAt: row.createdAt,
    state: row.state,
    cancelledAt: row.cancelledAt,
    priority: "priority" in row ? row.priority : undefined,
  };
}

export function createEfaServiceMetadataStore(ownerUserId: string): EfaServiceMetadataStore {
  let disposed = false;
  let snapshot: ReadonlyMap<string, EfaServiceMetadata> = new Map();
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  // The array carries the generation of its GET without changing server DTOs.
  const reads = new WeakMap<object, { episodeId: string; kind: Kind; generation: number }>();
  const entryFor = (episodeId: string) => {
    let entry = entries.get(episodeId);
    if (!entry) {
      entry = { calls: resource(), dispatches: resource() };
      entries.set(episodeId, entry);
    }
    return entry;
  };
  const notify = (episodeId: string) => {
    if (disposed) return;
    const entry = entryFor(episodeId);
    const state = [entry.calls.status, entry.dispatches.status];
    const next: EfaServiceMetadata = {
      ...deriveEfaServiceMetadata(entry.calls.rows, entry.dispatches.rows as EfaMetadataDispatch[]),
      status: state.includes("error")
        ? "error"
        : state.every((value) => value === "ready")
          ? "ready"
          : "loading",
    };
    const previous = snapshot.get(episodeId);
    if (
      previous &&
      previous.priority === next.priority &&
      previous.status === next.status &&
      previous.mobiles.join("\0") === next.mobiles.join("\0")
    )
      return;
    snapshot = new Map(snapshot).set(episodeId, next);
    for (const listener of [...listeners]) listener();
  };
  const owned = (episodeId: string, row: RecordRow) =>
    row.ownerUserId === ownerUserId && row.episodeId === episodeId;
  const publish = (episodeId: string, kind: Kind, rows: RecordRow[], mutation = false) => {
    if (disposed) return;
    const entry = entryFor(episodeId);
    const target = entry[kind];
    const read = reads.get(rows);
    if (
      !mutation &&
      read &&
      (read.episodeId !== episodeId || read.kind !== kind || read.generation !== target.generation)
    )
      return;
    const accepted = rows.filter((row) => owned(episodeId, row));
    if (mutation && accepted.length === 0) return;
    if (mutation) target.generation += 1;
    const merged = new Map(target.rows.map((row) => [row.id, row]));
    for (const row of accepted) {
      const previous = merged.get(row.id);
      if (
        previous?.version !== undefined &&
        (row.version === undefined || row.version < previous.version)
      )
        continue;
      if (kind === "dispatches") {
        const dispatch = row as EfaMetadataDispatch;
        const knownName = (target.rows as EfaMetadataDispatch[]).find(
          (candidate) => candidate.baseId === dispatch.baseId && candidate.baseName,
        )?.baseName;
        merged.set(row.id, {
          ...metadataFields(dispatch),
          baseId: dispatch.baseId,
          baseName: dispatch.baseName ?? knownName,
          finalizedAt: dispatch.finalizedAt,
        });
      } else merged.set(row.id, metadataFields(row));
    }
    target.rows = [...merged.values()];
    if (!mutation || target.status !== "error") target.status = "ready";
    notify(episodeId);
  };
  const read = <T extends RecordRow>(
    episodeId: string,
    kind: Kind,
    loader: Loader<T>,
  ): Promise<T[]> => {
    if (disposed) return Promise.reject(new Error("Service metadata store is disposed."));
    const target = entryFor(episodeId)[kind];
    if (target.inflight) return target.inflight as Promise<T[]>;
    const generation = target.generation;
    target.status = "loading";
    notify(episodeId);
    let request: Promise<T[]>;
    try {
      request = loader();
    } catch (reason) {
      request = Promise.reject(reason);
    }
    const pending = request
      .then((rows) => {
        if (!disposed) reads.set(rows, { episodeId, kind, generation });
        return rows;
      })
      .catch((reason: unknown) => {
        if (!disposed && target.generation === generation) {
          target.status = "error";
          notify(episodeId);
        }
        throw reason;
      })
      .finally(() => {
        if (target.inflight === pending) target.inflight = null;
      });
    target.inflight = pending;
    return pending;
  };
  const store: EfaServiceMetadataStore = {
    subscribe(listener) {
      if (disposed) return () => {};
      const subscription = () => listener();
      listeners.add(subscription);
      return () => {
        listeners.delete(subscription);
      };
    },
    getSnapshot: () => snapshot,
    get: (episodeId) => snapshot.get(episodeId) ?? emptyMetadata,
    async load(episodeId, loaders) {
      if (disposed) return;
      await Promise.allSettled([
        store
          .readCalls(episodeId, loaders.calls)
          .then((rows) => store.publishCalls(episodeId, rows)),
        store
          .readDispatches(episodeId, loaders.dispatches)
          .then((rows) => store.publishDispatches(episodeId, rows)),
      ]);
    },
    readCalls: (episodeId, loader) => read(episodeId, "calls", loader),
    readDispatches: (episodeId, loader) => read(episodeId, "dispatches", loader),
    publishCalls: (episodeId, rows) => publish(episodeId, "calls", rows),
    publishDispatches: (episodeId, rows) => publish(episodeId, "dispatches", rows),
    upsertCall: (episodeId, row) => publish(episodeId, "calls", [row], true),
    upsertDispatch: (episodeId, row) => publish(episodeId, "dispatches", [row], true),
    dispose() {
      disposed = true;
      listeners.clear();
      entries.clear();
      snapshot = new Map();
    },
  };
  return store;
}
