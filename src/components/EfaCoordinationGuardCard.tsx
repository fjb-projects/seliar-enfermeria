import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { EfaCoordinationGuardDetail } from "@/components/EfaCoordinationGuardDetail";
import {
  EfaGuardStatus,
  EfaMetricValue,
  EfaOwnerAvatar,
} from "@/components/EfaCoordinationGuardPieces";
import { formatGuardSpan, guardMetrics, ownerGroupSummary } from "@/lib/efa-coordination-display";
import { groupGuardsByOwner } from "@/lib/efa-coordination-filters";
import type { EfaOversightGuardView } from "@/lib/efa-guard-oversight.functions";
import { formatHygieneDuration } from "@/lib/efa-labels";
import { cn } from "@/lib/utils";

/** Compact phone card: identity and status, the time span, and a 4-up row of figures. */
export function EfaCoordinationGuardCard({
  guard,
  showOwner = true,
  now,
  onGuardChanged,
}: {
  guard: EfaOversightGuardView;
  showOwner?: boolean;
  now: Date;
  /** Reloads the guard list after an admin change such as an end-time correction. */
  onGuardChanged: () => Promise<unknown>;
}) {
  const [expanded, setExpanded] = useState(false);
  const open = !guard.endedAt;
  const duration = guard.endedAt ? formatHygieneDuration(guard.startedAt, guard.endedAt) : null;
  const detailId = `guard-card-detail-${guard.id}`;
  const bases = guard.bases.map((base) => base.name).join(", ");
  return (
    <article
      aria-label={`Guardia de ${guard.owner.name}`}
      className={cn(
        "min-w-0 rounded-lg border bg-card px-3 pt-3",
        open && "border-primary/40 bg-primary/5",
      )}
    >
      <div className="flex min-w-0 items-center gap-2 text-sm">
        {showOwner && (
          <>
            <EfaOwnerAvatar userId={guard.ownerUserId} name={guard.owner.name} />
            <span className="min-w-0 truncate font-medium">{guard.owner.name}</span>
          </>
        )}
        <span className={cn("shrink-0", showOwner && "ml-auto")}>
          <EfaGuardStatus startedAt={guard.startedAt} endedAt={guard.endedAt} now={now} />
        </span>
      </div>
      <p className="mt-1 break-words text-sm tabular-nums text-muted-foreground">
        {[formatGuardSpan(guard.startedAt, guard.endedAt), duration, bases || null]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <dl className="mt-3 grid grid-cols-4 gap-2">
        {guardMetrics(guard.totals).map((metric) => (
          <div key={metric.id} className="flex min-w-0 flex-col-reverse">
            <dt className="truncate text-[11px] text-muted-foreground">{metric.label}</dt>
            <dd className="text-lg font-semibold leading-tight">
              <EfaMetricValue metric={metric} />
            </dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailId}
        className="mt-1 flex min-h-11 w-full items-center justify-between text-sm font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? "Ocultar detalle" : "Ver servicios y detalle"}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 transition-transform motion-reduce:transition-none",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded && (
        <div id={detailId} className="border-t py-3">
          <EfaCoordinationGuardDetail
            guard={guard}
            onGuardChanged={onGuardChanged}
            idPrefix="card-guard-end"
          />
        </div>
      )}
    </article>
  );
}

/** Phone guard list, optionally under owner headings. */
export function EfaCoordinationGuardCards({
  guards,
  grouped,
  now,
  onGuardChanged,
}: {
  guards: EfaOversightGuardView[];
  grouped: boolean;
  now: Date;
  onGuardChanged: () => Promise<unknown>;
}) {
  if (!grouped) {
    return (
      <div className="space-y-2">
        {guards.map((guard) => (
          <EfaCoordinationGuardCard
            key={guard.id}
            guard={guard}
            now={now}
            onGuardChanged={onGuardChanged}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {groupGuardsByOwner(guards).map((group) => (
        <section
          key={group.ownerUserId}
          aria-label={`Guardias de ${group.owner.name}`}
          className="min-w-0 space-y-2"
        >
          <header className="flex min-w-0 items-center gap-3">
            <EfaOwnerAvatar userId={group.ownerUserId} name={group.owner.name} size="md" />
            <div className="min-w-0">
              <h3 className="truncate font-semibold">{group.owner.name}</h3>
              <p className="truncate text-xs text-muted-foreground">
                {ownerGroupSummary(group.guards)}
              </p>
            </div>
          </header>
          {group.guards.map((guard) => (
            <EfaCoordinationGuardCard
              key={guard.id}
              guard={guard}
              showOwner={false}
              now={now}
              onGuardChanged={onGuardChanged}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
