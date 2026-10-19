import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { EfaCoordinationPanel } from "@/components/EfaCoordinationPanel";
import { PrivateAccountShell, type PrivateSession } from "@/components/PrivateAccountShell";
import { SessionLoadError } from "@/components/SessionLoadError";
import { validateCoordinationSearch } from "@/lib/efa-coordination-filters";
import {
  listEfaGuardOversight,
  type EfaOversightGuardView,
} from "@/lib/efa-guard-oversight.functions";
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
  validateSearch: validateCoordinationSearch,
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
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  return (
    <PrivateAccountShell
      session={session}
      title="Coordinación EFA"
      description="Guardias de todos los usuarios"
      contentWidth="full"
      surface="calm"
    >
      <EfaCoordinationPanel
        guards={guards as EfaOversightGuardView[]}
        search={search}
        onSearchChange={(next) => void navigate({ search: next, replace: true })}
        onGuardsChanged={() => router.invalidate()}
      />
    </PrivateAccountShell>
  );
}
