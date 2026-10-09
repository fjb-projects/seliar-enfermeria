import { createFileRoute, redirect } from "@tanstack/react-router";
import { EfaGuardPanel, type GuardBase, type GuardView } from "@/components/EfaGuardPanel";
import { PrivateAccountShell, type PrivateSession } from "@/components/PrivateAccountShell";
import {
  getEfaGuardRouteAccess,
  listActiveEfaGuardBases,
  listEfaGuards,
} from "@/lib/efa-guards.functions";
import { listEfaStaffing } from "@/lib/efa-staffing.functions";
import { listEfaMobileArrivalsForGuard } from "@/lib/efa-mobile-arrivals.functions";
import { SessionLoadError } from "@/components/SessionLoadError";
import { navigationSessionQueryOptions } from "@/lib/navigation-query-options";

export const Route = createFileRoute("/guardia-efa")({
  errorComponent: SessionLoadError,
  beforeLoad: async ({ context }) => {
    const snapshot = await context.queryClient.fetchQuery(navigationSessionQueryOptions());
    if (snapshot.status === "unavailable") throw new Error("Session could not be verified");
    if (snapshot.status === "anonymous") throw redirect({ href: "/login?returnTo=%2Fguardia-efa" });
    return { session: snapshot.session as PrivateSession };
  },
  loader: async ({ context }) => {
    const session = context.session as PrivateSession;
    const { canWrite, isAdmin } = getEfaGuardRouteAccess(session.roles);
    const [guards, bases] = await Promise.all([
      listEfaGuards(),
      canWrite ? listActiveEfaGuardBases() : Promise.resolve([]),
    ]);
    const guardEntries = await Promise.all(
      guards.map(async (guard) => {
        const arrivals = await listEfaMobileArrivalsForGuard({ data: guard.id });
        const staffing = canWrite ? await listEfaStaffing({ data: { guardId: guard.id } }) : [];
        return { id: guard.id, staffing, arrivals };
      }),
    );
    return {
      guards,
      bases,
      staffingByGuard: Object.fromEntries(guardEntries.map(({ id, staffing }) => [id, staffing])),
      arrivalsByGuard: Object.fromEntries(guardEntries.map(({ id, arrivals }) => [id, arrivals])),
      canWrite,
      isAdmin,
    };
  },
  component: EfaGuardPage,
});

function EfaGuardPage() {
  const { session } = Route.useRouteContext();
  const { guards, bases, staffingByGuard, arrivalsByGuard, canWrite, isAdmin } =
    Route.useLoaderData();
  return (
    <PrivateAccountShell session={session}>
      <EfaGuardPanel
        initialGuards={guards as GuardView[]}
        activeBases={bases as GuardBase[]}
        initialStaffing={staffingByGuard}
        initialArrivals={arrivalsByGuard}
        currentUserId={session.user.id}
        isAdmin={isAdmin}
        canWrite={canWrite}
      />
    </PrivateAccountShell>
  );
}
