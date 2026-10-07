import { createFileRoute, redirect } from "@tanstack/react-router";
import { EfaGuardPanel, type GuardBase, type GuardView } from "@/components/EfaGuardPanel";
import { PrivateAccountShell, type PrivateSession } from "@/components/PrivateAccountShell";
import {
  getEfaGuardRouteAccess,
  listActiveEfaGuardBases,
  listEfaGuards,
} from "@/lib/efa-guards.functions";
import { readSession } from "@/lib/auth.functions";
import { SessionLoadError } from "@/components/SessionLoadError";

export const Route = createFileRoute("/guardia-efa")({
  errorComponent: SessionLoadError,
  beforeLoad: async () => {
    const session = await readSession();
    if (!session) throw redirect({ href: "/login?returnTo=%2Fguardia-efa" });
    return { session: session as PrivateSession };
  },
  loader: async ({ context }) => {
    const session = context.session as PrivateSession;
    const { canWrite, isAdmin } = getEfaGuardRouteAccess(session.roles);
    const [guards, bases] = await Promise.all([
      listEfaGuards(),
      canWrite ? listActiveEfaGuardBases() : Promise.resolve([]),
    ]);
    return { guards, bases, canWrite, isAdmin };
  },
  component: EfaGuardPage,
});

function EfaGuardPage() {
  const { session } = Route.useRouteContext();
  const { guards, bases, canWrite, isAdmin } = Route.useLoaderData();
  return (
    <PrivateAccountShell session={session}>
      <EfaGuardPanel
        initialGuards={guards as GuardView[]}
        activeBases={bases as GuardBase[]}
        currentUserId={session.user.id}
        isAdmin={isAdmin}
        canWrite={canWrite}
      />
    </PrivateAccountShell>
  );
}
