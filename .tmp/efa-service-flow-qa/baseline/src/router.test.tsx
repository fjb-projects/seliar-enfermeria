import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";
import { RoutePending } from "./components/RoutePending";
import { getRouter } from "./router";

describe("application router pending feedback", () => {
  it("registers the accessible pending view without a delay or minimum hold", () => {
    const router = getRouter();

    expect(router.options.defaultPendingComponent).toBe(RoutePending);
    expect(router.options.defaultPendingMs).toBe(0);
    expect(router.options.defaultPendingMinMs).toBe(0);
  });

  it("enters pending state while an asynchronous route loader is unresolved", async () => {
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
    });
    await router.load();

    const navigation = router.navigate({ to: "/slow" as never });
    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce());
    expect(router.state.isLoading).toBe(true);

    finishLoad();
    await navigation;
    expect(router.state.isLoading).toBe(false);
  });
});
