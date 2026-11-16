import {
  QueryClient,
  type DehydratedState,
  defaultShouldDehydrateQuery,
  dehydrate,
  hydrate,
} from "@tanstack/react-query";
import { createRouter, type Serializable } from "@tanstack/react-router";
import { RoutePending } from "./components/RoutePending";
import { routeTree } from "./routeTree.gen";

/**
 * Dehydrates only the queries (no mutations) for the SSR payload.
 *
 * The router checks `dehydrate` results at compile time against its `Serializable`
 * allow-list, and `DehydratedState` fails it because query data, keys and metadata are typed
 * `unknown`. At runtime the payload goes through the router serializer, which handles whatever
 * the loaders returned. This is the only assertion: it states the serializability the type
 * system cannot see, and `hydrate` still receives a real `DehydratedState`.
 */
export function dehydrateQueryClient(queryClient: QueryClient): DehydratedState & Serializable {
  return dehydrate(queryClient, {
    shouldDehydrateQuery: defaultShouldDehydrateQuery,
    shouldDehydrateMutation: () => false,
  }) as DehydratedState & Serializable;
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: RoutePending,
    defaultPendingMs: Infinity,
    defaultPendingMinMs: 0,
    dehydrate: () => ({
      queryClientState: dehydrateQueryClient(queryClient),
    }),
    hydrate: ({ queryClientState }) => {
      hydrate(queryClient, queryClientState);
    },
  });

  return router;
};
