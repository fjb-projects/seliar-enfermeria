import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EfaCoordinationServiceModal } from "@/components/EfaCoordinationServiceModal";
import {
  listEfaGuardServices,
  type EfaOversightEpisodeView,
  type EfaOversightGuardView,
} from "@/lib/efa-guard-oversight.functions";
import { correctEfaGuardEnd } from "@/lib/efa-guards.functions";
import {
  dispatchResultLabel,
  dispatchTimeSteps,
  formatDateTimeMinutes,
  formatDispatchPriority,
  formatHygieneDuration,
  formatTimeMinutes,
} from "@/lib/efa-labels";

const coordinationServicesQueryKey = (guardId: string) =>
  ["efa-coordination-services", guardId] as const;

function episodeStateLabel(episode: EfaOversightEpisodeView) {
  if (episode.cancelledAt) return "Cancelado";
  return episode.state === "closed" ? "Cerrado" : "Borrador";
}

const dispatchStateLabels: Record<string, string> = {
  draft: "Borrador",
  finalized: "Finalizado",
  cancelled: "Cancelado",
};

type ShownDispatchStep = "t0At" | "t1At" | "t2At" | "t3At" | "t4At";
const shownDispatchSteps = dispatchTimeSteps.slice(0, 5) as ReadonlyArray<
  readonly [ShownDispatchStep, string]
>;

/** Services of one guard with their dispatches. Presentational, so it renders in tests. */
export function EfaCoordinationServiceList({
  episodes,
  ownerName,
}: {
  episodes: EfaOversightEpisodeView[];
  /** Names whose service it is in the full-service dialog. */
  ownerName?: string;
}) {
  if (episodes.length === 0) {
    return <p className="text-sm text-muted-foreground">No hubo servicios en esta guardia.</p>;
  }
  return (
    <ul className="divide-y">
      {episodes.map((episode) => (
        <li key={episode.id} className="min-w-0 space-y-1 py-2 text-sm first:pt-0 last:pb-0">
          <p className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-medium tabular-nums">
              {formatDateTimeMinutes(episode.eventAt)}
            </span>
            <span className="text-muted-foreground">{episodeStateLabel(episode)}</span>
            {episode.interventionNumber && (
              <span className="text-muted-foreground">
                Intervención {episode.interventionNumber}
              </span>
            )}
          </p>
          <p className="break-words">
            {episode.motive || "Sin motivo registrado"}
            <span className="text-muted-foreground">
              {" · "}
              {episode.address || "Sin dirección registrada"}
            </span>
          </p>
          {episode.dispatches.length > 0 ? (
            <ul className="space-y-1 pl-3">
              {episode.dispatches.map((dispatch) => (
                <li key={dispatch.id} className="min-w-0">
                  <p>
                    <span className="font-medium">{dispatch.baseName}</span> ·{" "}
                    {dispatch.priority
                      ? `Prioridad ${formatDispatchPriority(dispatch.priority)}`
                      : "Sin prioridad"}{" "}
                    · {dispatchResultLabel(dispatch.result)} ·{" "}
                    {dispatchStateLabels[dispatch.state] ?? dispatch.state}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {shownDispatchSteps
                      .map(([key, label]) => `${label} ${formatTimeMinutes(dispatch[key])}`)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Sin despachos.</p>
          )}
          <EfaCoordinationServiceModal episode={episode} {...(ownerName ? { ownerName } : {})} />
        </li>
      ))}
    </ul>
  );
}

/** Fetches the services only once the detail is shown. */
function GuardServices({ guardId, ownerName }: { guardId: string; ownerName: string }) {
  const listServices = useServerFn(listEfaGuardServices);
  const query = useQuery({
    queryKey: coordinationServicesQueryKey(guardId),
    queryFn: async () => (await listServices({ data: { guardId } })) as EfaOversightEpisodeView[],
  });
  if (query.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Cargando servicios…
      </p>
    );
  }
  if (query.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        No se pudieron cargar los servicios de esta guardia. Intentá nuevamente.
      </p>
    );
  }
  return <EfaCoordinationServiceList episodes={query.data} ownerName={ownerName} />;
}

/** datetime-local value in the browser's time zone. */
function toLocalDateTimeValue(value: Date | string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** Admin-only end-time correction for a closed guard; the server keeps the audit trail. */
export function EfaCoordinationEndCorrection({
  guard,
  onCorrected,
  idPrefix = "guard-end",
}: {
  guard: EfaOversightGuardView & { endedAt: Date | string };
  onCorrected: () => Promise<unknown>;
  /** Keeps the input id unique when the table and the phone cards are both in the page. */
  idPrefix?: string;
}) {
  const correctGuardEnd = useServerFn(correctEfaGuardEnd);
  const [value, setValue] = useState(() => toLocalDateTimeValue(guard.endedAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const unchanged = !value || new Date(value).getTime() === new Date(guard.endedAt).getTime();
  const inputId = `${idPrefix}-${guard.id}`;

  async function save() {
    if (busy || unchanged) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await correctGuardEnd({
        data: {
          guardId: guard.id,
          expectedVersion: guard.version,
          endedAt: new Date(value).toISOString(),
        },
      });
      await onCorrected();
      setMessage("La hora de cierre se corrigió y quedó en el historial.");
    } catch {
      setError("No se pudo guardar el cambio. Actualizá la guardia e intentá nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>Corregir hora de cierre</Label>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,16rem)_auto] sm:justify-start">
        <input
          id={inputId}
          className="min-h-11 rounded-md border bg-background px-3 text-sm md:min-h-9"
          type="datetime-local"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button
          variant="outline"
          className="min-h-11 md:min-h-9"
          disabled={busy || unchanged}
          onClick={() => void save()}
        >
          {busy ? "Guardando…" : "Guardar corrección"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          {message}
        </p>
      )}
    </div>
  );
}

/**
 * The expanded detail of a guard: the facts the compact row leaves out, its services and
 * dispatches (fetched on demand), and the end-time correction for closed guards.
 */
export function EfaCoordinationGuardDetail({
  guard,
  onGuardChanged,
  idPrefix,
}: {
  guard: EfaOversightGuardView;
  onGuardChanged: () => Promise<unknown>;
  idPrefix?: string;
}) {
  const duration = guard.endedAt ? formatHygieneDuration(guard.startedAt, guard.endedAt) : null;
  const facts = [
    ["Usuario", `${guard.owner.name} · ${guard.owner.email}`],
    ["Inicio", formatDateTimeMinutes(guard.startedAt)],
    ["Fin", guard.endedAt ? formatDateTimeMinutes(guard.endedAt) : "En curso"],
    ["Duración", duration ?? "—"],
    ["Bases", guard.bases.length ? guard.bases.map((base) => base.name).join(", ") : "Sin base"],
  ] as const;
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
      <dl className="grid content-start gap-x-3 gap-y-1 text-sm [grid-template-columns:auto_minmax(0,1fr)]">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="min-w-0 space-y-4">
        <GuardServices guardId={guard.id} ownerName={guard.owner.name} />
        {guard.endedAt && (
          <EfaCoordinationEndCorrection
            key={`${guard.id}:${guard.version}`}
            guard={{ ...guard, endedAt: guard.endedAt }}
            onCorrected={onGuardChanged}
            {...(idPrefix ? { idPrefix } : {})}
          />
        )}
      </div>
    </div>
  );
}
