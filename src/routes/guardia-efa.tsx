import { createFileRoute, redirect } from "@tanstack/react-router";
import { EfaGuardPanel, type GuardBase, type GuardView } from "@/components/EfaGuardPanel";
import { PrivateAccountShell, type PrivateSession } from "@/components/PrivateAccountShell";
import { listActiveEfaGuardBases, listEfaGuards } from "@/lib/efa-guards.functions";
import { readSession } from "@/lib/auth.functions";

export const Route = createFileRoute("/guardia-efa")({
  beforeLoad: async () => {
    let session;
    try {
      session = await readSession();
    } catch {
      throw redirect({ href: "/login?returnTo=%2Fguardia-efa" });
    }
    if (!session) throw redirect({ href: "/login?returnTo=%2Fguardia-efa" });
    if (!session.roles.includes("efa") && !session.roles.includes("admin")) {
      throw redirect({ to: "/panel" });
    }
    return { session: session as PrivateSession };
  },
  loader: async () => ({ guards: await listEfaGuards(), bases: await listActiveEfaGuardBases() }),
  component: EfaGuardPage,
});

function EfaGuardPage() {
  const { session } = Route.useRouteContext();
  const { guards, bases } = Route.useLoaderData();
  return (
    <PrivateAccountShell session={session}>
      <EfaGuardPanel
        initialGuards={guards as GuardView[]}
        activeBases={bases as GuardBase[]}
        currentUserId={session.user.id}
        isAdmin={session.roles.includes("admin")}
      />
    </PrivateAccountShell>
  );
}
