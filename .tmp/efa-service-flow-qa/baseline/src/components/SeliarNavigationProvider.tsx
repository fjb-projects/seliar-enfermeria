import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { EfaPanelSummary } from "@/components/EfaPanelHome";
import { signOut } from "@/lib/auth.functions";
import {
  clearPrivateNavigationCache,
  efaPanelSummaryQueryOptions,
  navigationSessionQueryKey,
  navigationSessionQueryOptions,
} from "@/lib/navigation-query-options";
import { safePrivateReturnPath } from "@/lib/private-ui";
import type { PrivateSession } from "@/lib/private-ui";

type SessionStatus = "loading" | "unavailable" | "anonymous" | "authenticated";

type SeliarNavigationContextValue = {
  sessionStatus: SessionStatus;
  session: PrivateSession | null;
  summary: EfaPanelSummary | undefined;
  summaryLoading: boolean;
  summaryError: boolean;
  retrySession: () => void;
  retrySummary: () => void;
  logout: () => Promise<void>;
  logoutPending: boolean;
  logoutError: string;
};

const SeliarNavigationContext = createContext<SeliarNavigationContextValue | null>(null);

export function SeliarNavigationProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const signOutFn = useServerFn(signOut);
  const sessionQuery = useQuery(navigationSessionQueryOptions());
  const sessionSnapshot = sessionQuery.data;
  const session = sessionSnapshot?.status === "authenticated" ? sessionSnapshot.session : null;
  const summaryQuery = useQuery({
    ...efaPanelSummaryQueryOptions(session?.user.id ?? "anonymous"),
    enabled: Boolean(session),
  });
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const previousActorId = useRef<string | null>(null);
  const previousPathname = useRef(pathname);
  const logoutCompleted = useRef(false);

  const sessionStatus: SessionStatus = sessionQuery.isPending
    ? "loading"
    : (sessionSnapshot?.status ?? "unavailable");

  useEffect(() => {
    const pathChanged = previousPathname.current !== pathname;
    previousPathname.current = pathname;
    if (!pathChanged) return;
    if (sessionQuery.isStale && sessionQuery.fetchStatus === "idle") {
      void sessionQuery.refetch();
    }
    if (session && summaryQuery.isStale && summaryQuery.fetchStatus === "idle") {
      void summaryQuery.refetch();
    }
  }, [
    pathname,
    session,
    sessionQuery.fetchStatus,
    sessionQuery.isStale,
    sessionQuery.refetch,
    summaryQuery.fetchStatus,
    summaryQuery.isStale,
    summaryQuery.refetch,
  ]);

  useEffect(() => {
    if (sessionStatus === "authenticated" && session) {
      if (previousActorId.current && previousActorId.current !== session.user.id) {
        queryClient.removeQueries({
          queryKey: ["efa-panel-summary"],
          predicate: (query) => query.queryKey[1] !== session.user.id,
        });
      }
      previousActorId.current = session.user.id;
      return;
    }

    if (sessionStatus === "anonymous") {
      const hadAuthenticatedSession = previousActorId.current !== null;
      previousActorId.current = null;
      clearPrivateNavigationCache(queryClient);
      if (
        hadAuthenticatedSession &&
        !logoutCompleted.current &&
        ["/panel", "/admin-usuarios", "/guardia-efa", "/episodios-efa"].includes(pathname)
      ) {
        const returnTo = safePrivateReturnPath(pathname);
        window.location.assign(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      }
    }
  }, [pathname, queryClient, session, sessionStatus]);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !session) return;
    const expiresAt = Date.parse(session.expiresAt);
    if (!Number.isFinite(expiresAt)) return;
    const delay = Math.max(0, expiresAt - Date.now());
    const timer = window.setTimeout(() => {
      if (Date.now() < expiresAt) {
        void queryClient.invalidateQueries({ queryKey: navigationSessionQueryKey });
        return;
      }
      queryClient.setQueryData(navigationSessionQueryKey, { status: "anonymous" });
      clearPrivateNavigationCache(queryClient);
    }, Math.min(delay, 2_147_000_000));
    return () => window.clearTimeout(timer);
  }, [queryClient, session, sessionStatus]);

  const retrySession = useCallback(() => {
    void sessionQuery.refetch();
  }, [sessionQuery.refetch]);
  const retrySummary = useCallback(() => {
    if (session) void summaryQuery.refetch();
  }, [session, summaryQuery.refetch]);

  const logout = useCallback(async () => {
    if (logoutPending) return;
    setLogoutPending(true);
    setLogoutError("");
    try {
      const result = await signOutFn();
      if (!result?.ok) throw new Error("signout-failed");
      logoutCompleted.current = true;
      clearPrivateNavigationCache(queryClient);
      queryClient.setQueryData(navigationSessionQueryKey, { status: "anonymous" });
      window.location.assign("/");
    } catch {
      setLogoutError("No se pudo cerrar la sesión. Inténtalo nuevamente.");
      setLogoutPending(false);
    }
  }, [logoutPending, queryClient, signOutFn]);

  const value = useMemo<SeliarNavigationContextValue>(
    () => ({
      sessionStatus,
      session,
      summary: summaryQuery.isError || summaryQuery.isStale ? undefined : summaryQuery.data,
      summaryLoading: Boolean(session) && summaryQuery.isPending,
      summaryError: Boolean(session) && summaryQuery.isError,
      retrySession,
      retrySummary,
      logout,
      logoutPending,
      logoutError,
    }),
    [
      logout,
      logoutError,
      logoutPending,
      retrySession,
      retrySummary,
      session,
      sessionStatus,
      summaryQuery.data,
      summaryQuery.isError,
      summaryQuery.isPending,
      summaryQuery.isStale,
    ],
  );

  return <SeliarNavigationContext.Provider value={value}>{children}</SeliarNavigationContext.Provider>;
}

export function useSeliarNavigation() {
  const value = useContext(SeliarNavigationContext);
  if (!value) throw new Error("useSeliarNavigation must be used inside SeliarNavigationProvider");
  return value;
}
