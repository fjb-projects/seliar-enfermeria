import { createFileRoute, redirect } from "@tanstack/react-router";
import { PrivateAccountShell, type PrivateSession } from "@/components/PrivateAccountShell";
import { EfaPanelHome, type EfaPanelSummary } from "@/components/EfaPanelHome";
import { SessionLoadError } from "@/components/SessionLoadError";
import { efaPanelSummaryQueryOptions, navigationSessionQueryOptions } from "@/lib/navigation-query-options";

export const Route = createFileRoute("/panel")({
  errorComponent: SessionLoadError,
  beforeLoad: async ({ context }) => {
    const snapshot = await context.queryClient.fetchQuery(navigationSessionQueryOptions());
    if (snapshot.status === "unavailable") throw new Error("Session could not be verified");
    if (snapshot.status === "anonymous") throw redirect({ href: "/login?returnTo=%2Fpanel" });
    return { session: snapshot.session as PrivateSession };
  },
  loader: async ({ context }) => {
    const { session } = context as typeof context & { session: PrivateSession };
    const summary = await context.queryClient.fetchQuery(
      efaPanelSummaryQueryOptions(session.user.id),
    );
    return { summary: summary as EfaPanelSummary };
  },
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
