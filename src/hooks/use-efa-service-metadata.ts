import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  createEfaServiceMetadataStore,
  type EfaMetadataCall,
  type EfaMetadataDispatch,
  type EfaServiceMetadata,
  type EfaServiceMetadataStore,
} from "@/lib/efa-service-metadata";

/** Delays before the automatic retries of services whose metadata failed to load. */
const metadataRetryDelaysMs = [1500, 5000];
const emptySnapshot: ReadonlyMap<string, EfaServiceMetadata> = new Map();
const subscribeEmpty = () => () => {};
const getEmptySnapshot = () => emptySnapshot;

/** Effect-owned instances survive StrictMode replay without reusing a disposed store. */
export function useEfaServiceMetadata({
  ownerUserId,
  guardId,
  episodeIds,
  loadCalls,
  loadDispatches,
}: {
  ownerUserId: string;
  guardId: string | null;
  episodeIds: string[];
  loadCalls: (episodeId: string) => Promise<EfaMetadataCall[]>;
  loadDispatches: (episodeId: string) => Promise<EfaMetadataDispatch[]>;
}) {
  const [scope, setScope] = useState<{
    ownerUserId: string;
    guardId: string | null;
    store: EfaServiceMetadataStore;
  } | null>(null);
  const loaders = useRef({ loadCalls, loadDispatches });
  loaders.current = { loadCalls, loadDispatches };
  useEffect(() => {
    const store = createEfaServiceMetadataStore(ownerUserId);
    setScope({ ownerUserId, guardId, store });
    return () => store.dispose();
  }, [ownerUserId, guardId]);
  const store =
    scope?.ownerUserId === ownerUserId && scope.guardId === guardId ? scope.store : undefined;
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? subscribeEmpty,
    store?.getSnapshot ?? getEmptySnapshot,
    getEmptySnapshot,
  );
  const reload = useCallback(
    async (episodeId: string) => {
      if (!store || !guardId) return;
      await store.load(episodeId, {
        calls: () => loaders.current.loadCalls(episodeId),
        dispatches: () => loaders.current.loadDispatches(episodeId),
      });
    },
    [store, guardId],
  );
  const episodeKey = JSON.stringify(episodeIds);
  useEffect(() => {
    if (!store || !guardId) return;
    let active = true;
    let wake: (() => void) | null = null;
    const ids: string[] = JSON.parse(episodeKey);
    // A long guard must not flood the server with one request pair per service at once.
    const loadAll = async (list: string[]) => {
      let next = 0;
      const worker = async () => {
        while (active && next < list.length) {
          const id = list[next++]!;
          await reload(id);
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, list.length) }, worker));
    };
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    void (async () => {
      await loadAll(ids);
      // A failed first read (for example while the session is still settling after a reload)
      // must not leave the service looking unassigned: retry the failed ones a couple of times.
      for (const delay of metadataRetryDelaysMs) {
        const failed = ids.filter((id) => store.get(id).status === "error");
        if (!active || failed.length === 0) return;
        await wait(delay);
        if (!active) return;
        await loadAll(failed);
      }
    })();
    return () => {
      active = false;
      wake?.();
    };
  }, [store, guardId, episodeKey, reload]);
  return { store, snapshot, reload };
}
