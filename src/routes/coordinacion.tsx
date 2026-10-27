import { createFileRoute, redirect, Outlet, useRouterState } from "@tanstack/react-router";
import { CoordinationAdminLayout } from "@/components/CoordinationAdminLayout";
import { PrivateAccountShell, type PrivateSession } from "@/components/PrivateAccountShell";
import { SessionLoadError } from "@/components/SessionLoadError";
import {
  navigationSessionQueryOptions,
  type NavigationSessionSnapshot,
} from "@/lib/navigation-query-options";
import { isAdministrator } from "@/lib/private-ui";

export function resolveCoordinationAdminSession(snapshot: NavigationSessionSnapshot) {
  if (snapshot.status === "unavailable") throw new Error("Session could not be verified");
  if (snapshot.status === "anonymous") throw redirect({ href: "/login?returnTo=%2Fcoordinacion" });
  if (!isAdministrator(snapshot.session.roles)) throw redirect({ href: "/panel" });
  return { session: snapshot.session as PrivateSession };
}

export const Route = createFileRoute("/coordinacion")({
  errorComponent: SessionLoadError,
  beforeLoad: async ({ context }) =>
    resolveCoordinationAdminSession(
      await context.queryClient.fetchQuery(navigationSessionQueryOptions()),
    ),
  component: CoordinationAdminPage,
});

function CoordinationAdminPage() {
  const { session } = Route.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <PrivateAccountShell
      session={session}
      title="Coordinación"
      description="Herramientas administrativas"
      contentWidth="full"
      surface="calm"
    >
      <CoordinationAdminLayout
        active={pathname.startsWith("/coordinacion/compensatorios") ? "compensatorios" : "home"}
      >
        <Outlet />
      </CoordinationAdminLayout>
    </PrivateAccountShell>
  );
}
