import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { EfaPanelSummary } from "@/components/EfaPanelHome";
import { useQuickGuardEnd, type QuickGuardEndController } from "@/components/EfaQuickGuardEnd";
import { EfaLogoutGuardDialog } from "@/components/EfaLogoutGuardDialog";
import { signOut } from "@/lib/auth.functions";
import {
  clearPrivateNavigationCache,
  efaPanelSummaryQueryOptions,
  navigationSessionQueryKey,
  navigationSessionQueryOptions,
} from "@/lib/navigation-query-options";
import {
  canEndGuardOnLogout,
  decideLogout,
  shouldLogoutAfterQuickGuardEnd,
} from "@/lib/efa-quick-guard-end";
import { safePrivateReturnPath } from "@/lib/private-ui";
import type { PrivateSession } from "@/lib/private-ui";

type SessionStatus = "loading" | "unavailable" | "anonymous" | "authenticated";

type SeliarNavigationContextValue = {
  sessionStatus: SessionStatus;
  session: PrivateSession | null;
  summary: EfaPanelSummary | undefined;
  /** Last known open guard, kept while the summary is stale so the shell strip does not flicker. */
  openGuard: EfaPanelSummary["openGuard"];
  quickGuardEnd: QuickGuardEndController;
  summaryLoading: boolean;
  summaryError: boolean;
  retrySession: () => void;
  retrySummary: () => void;
  logout: () => Promise<void>;
  /** Logout entry point for UI: asks first when the user still has an open guard. */
  requestLogout: () => Promise<void>;
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
  const openGuard = session ? (summaryQuery.data?.openGuard ?? null) : null;
  const quickGuardEnd = useQuickGuardEnd({
    userId: session?.user.id ?? null,
    openGuard,
    pathname,
  });
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [logoutPrompt, setLogoutPrompt] = useState<{ startedAt: string; error: string } | null>(
    null,
  );
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
        [
          "/panel",
          "/admin-usuarios",
          "/guardia-efa",
          "/episodios-efa",
          "/coordinacion-efa",
        ].includes(pathname)
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
    const timer = window.setTimeout(
      () => {
        if (Date.now() < expiresAt) {
          void queryClient.invalidateQueries({ queryKey: navigationSessionQueryKey });
          return;
        }
        queryClient.setQueryData(navigationSessionQueryKey, { status: "anonymous" });
        clearPrivateNavigationCache(queryClient);
      },
      Math.min(delay, 2_147_000_000),
    );
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

  const requestLogout = useCallback(async () => {
    if (logoutPending || quickGuardEnd.pending) return;
    let currentOpenGuard = openGuard;
    if (session) {
      try {
        // A stale summary must not hide an open guard, so read it fresh when needed.
        const fresh = await queryClient.fetchQuery(efaPanelSummaryQueryOptions(session.user.id));
        currentOpenGuard = fresh.openGuard;
      } catch {
        // Fall back to the last known summary.
      }
    }
    if (
      decideLogout({ openGuard: currentOpenGuard }) === "confirm-open-guard" &&
      currentOpenGuard
    ) {
      setLogoutPrompt({ startedAt: currentOpenGuard.startedAt, error: "" });
      return;
    }
    await logout();
  }, [logout, logoutPending, openGuard, queryClient, quickGuardEnd.pending, session]);

  const { end: endOpenGuard } = quickGuardEnd;
  const endGuardAndLogout = useCallback(async () => {
    const result = await endOpenGuard({ notify: false });
    if (!shouldLogoutAfterQuickGuardEnd(result)) {
      if (result?.status === "error")
        setLogoutPrompt((current) => current && { ...current, error: result.error.message });
      return;
    }
    setLogoutPrompt(null);
    await logout();
  }, [endOpenGuard, logout]);

  const logoutWithoutEnding = useCallback(() => {
    setLogoutPrompt(null);
    void logout();
  }, [logout]);

  const value = useMemo<SeliarNavigationContextValue>(
    () => ({
      sessionStatus,
      session,
      summary: summaryQuery.isError || summaryQuery.isStale ? undefined : summaryQuery.data,
      openGuard,
      quickGuardEnd,
      summaryLoading: Boolean(session) && summaryQuery.isPending,
      summaryError: Boolean(session) && summaryQuery.isError,
      retrySession,
      retrySummary,
      logout,
      requestLogout,
      logoutPending,
      logoutError,
    }),
    [
      logout,
      requestLogout,
      logoutError,
      logoutPending,
      openGuard,
      quickGuardEnd,
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

  return (
    <SeliarNavigationContext.Provider value={value}>
      {children}
      <EfaLogoutGuardDialog
        open={logoutPrompt !== null}
        startedAt={logoutPrompt?.startedAt ?? null}
        canEndGuard={canEndGuardOnLogout(pathname)}
        pending={quickGuardEnd.pending || logoutPending}
        error={logoutPrompt?.error ?? ""}
        onCancel={() => setLogoutPrompt(null)}
        onEndAndLogout={() => void endGuardAndLogout()}
        onLogout={logoutWithoutEnding}
      />
    </SeliarNavigationContext.Provider>
  );
}

export function useSeliarNavigation() {
  const value = useContext(SeliarNavigationContext);
  if (!value) throw new Error("useSeliarNavigation must be used inside SeliarNavigationProvider");
  return value;
}
