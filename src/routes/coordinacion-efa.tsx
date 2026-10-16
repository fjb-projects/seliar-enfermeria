import { createFileRoute, redirect } from "@tanstack/react-router";
import { PrivateAccountShell, type PrivateSession } from "@/components/PrivateAccountShell";
import { SessionLoadError } from "@/components/SessionLoadError";
import { listEfaGuardOversight } from "@/lib/efa-guard-oversight.functions";
import {
  navigationSessionQueryOptions,
  type NavigationSessionSnapshot,
} from "@/lib/navigation-query-options";
import { isAdministrator } from "@/lib/private-ui";

/** Admits only administrators; the server functions re-check the role on every call. */
export function resolveCoordinationSession(snapshot: NavigationSessionSnapshot) {
  if (snapshot.status === "unavailable") throw new Error("Session could not be verified");
  if (snapshot.status === "anonymous") {
    throw redirect({ href: "/login?returnTo=%2Fcoordinacion-efa" });
  }
  if (!isAdministrator(snapshot.session.roles)) throw redirect({ href: "/panel" });
  return { session: snapshot.session as PrivateSession };
}

export const Route = createFileRoute("/coordinacion-efa")({
  errorComponent: SessionLoadError,
  beforeLoad: async ({ context }) =>
    resolveCoordinationSession(
      await context.queryClient.fetchQuery(navigationSessionQueryOptions()),
    ),
  loader: async () => ({ guards: await listEfaGuardOversight() }),
  component: EfaCoordinationPage,
});

function EfaCoordinationPage() {
  const { session } = Route.useRouteContext();
  const { guards } = Route.useLoaderData();
  return (
    <PrivateAccountShell session={session}>
      <header>
        <h2 className="text-2xl font-semibold">Coordinación EFA</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Todas las guardias de todos los usuarios · {guards.length} en total
        </p>
      </header>
    </PrivateAccountShell>
  );
}
