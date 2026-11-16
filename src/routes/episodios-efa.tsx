import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  EfaEpisodePanel,
  type EpisodeNoticeView,
  type EpisodeView,
} from "@/components/EfaEpisodePanel";
import { EfaGuardInfo } from "@/components/EfaGuardInfo";
import { PrivateAccountShell, type PrivateSession } from "@/components/PrivateAccountShell";
import type { GuardView } from "@/components/EfaGuardPanel";
import { readSession } from "@/lib/auth.functions";
import { listEfaGuards } from "@/lib/efa-guards.functions";
import { listEfaEpisodes, listEfaEpisodeNotices } from "@/lib/efa-episodes.functions";

export async function loadEpisodeRouteData(userId: string) {
  const [episodes, notices, guards] = await Promise.all([
    listEfaEpisodes(),
    listEfaEpisodeNotices(),
    listEfaGuards(),
  ]);
  const openOwnGuard = (guards as GuardView[]).find(
    (guard) => guard.ownerUserId === userId && !guard.endedAt,
  );
  return {
    episodes: episodes as EpisodeView[],
    notices: notices as EpisodeNoticeView[],
    openOwnGuard: openOwnGuard ?? null,
  };
}

export const Route = createFileRoute("/episodios-efa")({
  beforeLoad: async () => {
    let session;
    try {
      session = await readSession();
    } catch {
      throw redirect({ href: "/login?returnTo=%2Fepisodios-efa" });
    }
    if (!session) throw redirect({ href: "/login?returnTo=%2Fepisodios-efa" });
    return { session: session as PrivateSession };
  },
  loader: async ({ context }) => {
    const session = context.session as PrivateSession;
    return loadEpisodeRouteData(session.user.id);
  },
  component: EfaEpisodesPage,
});

function EfaEpisodesPage() {
  const { session } = Route.useRouteContext();
  const { episodes, notices, openOwnGuard } = Route.useLoaderData();
  const canWrite = session.roles.includes("efa") || session.roles.includes("admin");
  return (
    <PrivateAccountShell
      session={session}
      title="Atenciones de la guardia"
      description="Registro y seguimiento de servicios"
      eyebrow=""
      surface="santafe-focus"
      contentWidth="full"
      titleAction={openOwnGuard ? <EfaGuardInfo startedAt={openOwnGuard.startedAt} /> : undefined}
    >
      <EfaEpisodePanel
        key={`${session.user.id}:${openOwnGuard?.id ?? "no-guard"}`}
        initialEpisodes={episodes}
        initialNotices={notices}
        openOwnGuard={openOwnGuard}
        currentUserId={session.user.id}
        canWrite={canWrite}
        isAdmin={session.roles.includes("admin")}
      />
    </PrivateAccountShell>
  );
}
