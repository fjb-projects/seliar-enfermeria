import { QueryClient } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";
import { RoutePending } from "./components/RoutePending";
import { dehydrateQueryClient, getRouter } from "./router";

describe("application router pending feedback", () => {
  it("keeps the current view while loading and leaves the feedback to RouteTransition", () => {
    const router = getRouter();

    // session-aware-navigation N4: "Installed router keeps active matches separate from pending
    // matches. setupPendingTimeout explicitly excludes Infinity, [...] so defaultPendingMs
    // Infinity preserves committed view until load readiness without creating an overflowing
    // browser timer." The loading overlay is RouteTransition, with no artificial minimum delay.
    expect(router.options.defaultPendingComponent).toBe(RoutePending);
    expect(router.options.defaultPendingMs).toBe(Infinity);
    expect(router.options.defaultPendingMinMs).toBe(0);
  });

  it("reports loading while an asynchronous route loader is unresolved", async () => {
    let finishLoad!: () => void;
    const loader = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishLoad = resolve;
        }),
    );
    const rootRoute = createRootRoute();
    const homeRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => null,
    });
    const slowRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/slow",
      loader,
      component: () => null,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([homeRoute, slowRoute]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
      defaultPendingComponent: RoutePending,
      defaultPendingMs: 0,
      defaultPendingMinMs: 0,
      // Node has no document, so the router would assume it runs on the server and ignore
      // client navigations. Declare a browser-like router with an explicit origin (no window).
      isServer: false,
      origin: "http://localhost",
    });
    await router.load();

    const navigation = router.navigate({ to: "/slow" as never });
    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce());
    expect(router.state.isLoading).toBe(true);
    expect(router.state.resolvedLocation?.pathname).toBe("/");

    finishLoad();
    await navigation;
    expect(router.state.isLoading).toBe(false);
    expect(router.state.resolvedLocation?.pathname).toBe("/slow");
  });
});

describe("application router dehydration", () => {
  it("dehydrates fetched queries into a JSON-serializable payload without mutations", async () => {
    const queryClient = new QueryClient();
    await queryClient.prefetchQuery({
      queryKey: ["shifts", { month: "2026-10" }],
      queryFn: async () => ({ total: 3, days: [1, 2, 3] }),
    });
    queryClient.getMutationCache().build(queryClient, { mutationFn: async () => 1 });

    const state = dehydrateQueryClient(queryClient);

    expect(state.mutations).toEqual([]);
    expect(state.queries).toHaveLength(1);
    expect(state.queries[0]?.queryKey).toEqual(["shifts", { month: "2026-10" }]);
    expect(state.queries[0]?.state.data).toEqual({ total: 3, days: [1, 2, 3] });
    const roundTripped = JSON.parse(JSON.stringify(state)) as typeof state;
    expect(roundTripped.queries[0]?.queryKey).toEqual(["shifts", { month: "2026-10" }]);
    expect(roundTripped.queries[0]?.state.data).toEqual({ total: 3, days: [1, 2, 3] });
  });

  it("wires the same payload shape into the router dehydrate and hydrate hooks", async () => {
    const router = getRouter();
    const { queryClient } = router.options.context as { queryClient: QueryClient };
    await queryClient.prefetchQuery({ queryKey: ["ping"], queryFn: async () => "pong" });

    const dehydrated = (await router.options.dehydrate?.()) as {
      queryClientState: ReturnType<typeof dehydrateQueryClient>;
    };
    expect(dehydrated.queryClientState.queries.map((query) => query.queryKey)).toEqual([["ping"]]);

    queryClient.clear();
    await router.options.hydrate?.(dehydrated as never);
    expect(queryClient.getQueryData(["ping"])).toBe("pong");
  });
});
