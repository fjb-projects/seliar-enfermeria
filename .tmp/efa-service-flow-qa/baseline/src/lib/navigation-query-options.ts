import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { EfaPanelSummary } from "@/components/EfaPanelHome";
import { readSession } from "@/lib/auth.functions";
import { getEfaPanelSummary } from "@/lib/efa-panel.functions";
import type { PrivateSession } from "@/lib/private-ui";

export const navigationSessionQueryKey = ["navigation-session"] as const;
export const efaPanelSummaryQueryKey = ["efa-panel-summary"] as const;

export type NavigationSessionSnapshot =
  | { status: "authenticated"; session: PrivateSession }
  | { status: "anonymous" }
  | { status: "unavailable" };

export function navigationSessionQueryOptions() {
  return queryOptions({
    queryKey: navigationSessionQueryKey,
    queryFn: async (): Promise<NavigationSessionSnapshot> => {
      try {
        const session = await readSession();
        return session
          ? { status: "authenticated", session: session as PrivateSession }
          : { status: "anonymous" };
      } catch {
        return { status: "unavailable" };
      }
    },
    staleTime: 15_000,
  });
}

export function efaPanelSummaryQueryOptions(userId: string) {
  return queryOptions({
    queryKey: [...efaPanelSummaryQueryKey, userId] as const,
    queryFn: async () => (await getEfaPanelSummary()) as EfaPanelSummary,
    staleTime: 30_000,
  });
}

export function clearPrivateNavigationCache(queryClient: QueryClient) {
  queryClient.removeQueries({ queryKey: efaPanelSummaryQueryKey });
}
