import {
  QueryClient,
  defaultShouldDehydrateQuery,
  dehydrate,
  hydrate,
} from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { RoutePending } from "./components/RoutePending";
import { routeTree } from "./routeTree.gen";

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
      queryClientState: dehydrate(queryClient, {
        shouldDehydrateQuery: defaultShouldDehydrateQuery,
        shouldDehydrateMutation: () => false,
      }),
    }),
    hydrate: ({ queryClientState }) => {
      hydrate(queryClient, queryClientState);
    },
  });

  return router;
};
