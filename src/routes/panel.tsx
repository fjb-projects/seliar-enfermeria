import { createFileRoute, redirect } from "@tanstack/react-router";
import { PrivateAccountShell, type PrivateSession } from "@/components/PrivateAccountShell";
import { EfaPanelHome, type EfaPanelSummary } from "@/components/EfaPanelHome";
import { getEfaPanelSummary } from "@/lib/efa-panel.functions";
import { readSession } from "@/lib/auth.functions";
import { SessionLoadError } from "@/components/SessionLoadError";

export const Route = createFileRoute("/panel")({
  errorComponent: SessionLoadError,
  beforeLoad: async () => {
    const session = await readSession();
    if (!session) throw redirect({ href: "/login?returnTo=%2Fpanel" });
    return { session: session as PrivateSession };
  },
  loader: async () => ({ summary: (await getEfaPanelSummary()) as EfaPanelSummary }),
  component: PanelPage,
});

function PanelPage() {
  const { session } = Route.useRouteContext();
  const { summary } = Route.useLoaderData();
  return (
    <PrivateAccountShell session={session}>
      <EfaPanelHome summary={summary} />
    </PrivateAccountShell>
  );
}
