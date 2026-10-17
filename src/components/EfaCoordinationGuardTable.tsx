import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { EfaCoordinationGuardDetail } from "@/components/EfaCoordinationGuardDetail";
import {
  EfaGuardStatus,
  EfaMetricValue,
  EfaOwnerAvatar,
} from "@/components/EfaCoordinationGuardPieces";
import {
  formatGuardSpan,
  guardMetrics,
  ownerGroupSummary,
  shortName,
} from "@/lib/efa-coordination-display";
import { groupGuardsByOwner } from "@/lib/efa-coordination-filters";
import type { EfaOversightGuardView } from "@/lib/efa-guard-oversight.functions";
import { formatHygieneDuration } from "@/lib/efa-labels";
import { cn } from "@/lib/utils";

type ListProps = {
  /** Already filtered and sorted, open guards first. */
  guards: EfaOversightGuardView[];
  grouped: boolean;
  now: Date;
  onGuardChanged: () => Promise<unknown>;
};

const metricLabels = ["Servicios", "Despachos", "Arribos", "Higiene"];
// Rows sit directly on the workflow gradient, where no single text color reaches 4.5:1;
// a dense dark shadow keeps white text legible across orange, pink and violet.
const onGradientText =
  "font-semibold text-white [text-shadow:0_2px_2px_rgb(0_0_0/0.90)] [&_*]:text-white!";
const headerCell =
  "sticky top-0 z-[1] h-9 bg-background px-2 text-left text-xs font-medium text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]";
// Container queries keep the table readable next to the sidebar: the table appears at a
// 44rem main column, Duración joins at 46rem and Bases at 56rem.
const durationCell = "hidden @[46rem]:table-cell";
const basesCell = "hidden @[56rem]:table-cell";

function toggleIn(set: ReadonlySet<string>, id: string) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function GuardRow({
  guard,
  grouped,
  now,
  expanded,
  columnCount,
  onToggle,
  onGuardChanged,
}: {
  guard: EfaOversightGuardView;
  grouped: boolean;
  now: Date;
  expanded: boolean;
  columnCount: number;
  onToggle: () => void;
  onGuardChanged: () => Promise<unknown>;
}) {
  const open = !guard.endedAt;
  const span = formatGuardSpan(guard.startedAt, guard.endedAt);
  const detailId = `guard-detail-${guard.id}`;
  const bases = guard.bases.map((base) => base.name).join(", ");
  return (
    <>
      <tr
        className={cn(
          "h-12 cursor-pointer border-b transition-colors hover:bg-muted/40",
          open && "bg-primary/5 hover:bg-primary/10",
          expanded && "border-b-0",
          onGradientText,
        )}
        onClick={onToggle}
      >
        {!grouped && (
          <td className="px-2 pl-3">
            <span className="flex min-w-0 items-center gap-2" title={guard.owner.name}>
              <EfaOwnerAvatar userId={guard.ownerUserId} name={guard.owner.name} />
              <span className="max-w-[9rem] truncate font-medium">
                {shortName(guard.owner.name)}
              </span>
            </span>
          </td>
        )}
        <td className={cn("whitespace-nowrap px-2", grouped && "pl-3")}>
          <EfaGuardStatus startedAt={guard.startedAt} endedAt={guard.endedAt} now={now} />
        </td>
        <td className="whitespace-nowrap px-2 tabular-nums">{span}</td>
        <td
          className={cn(durationCell, "whitespace-nowrap px-2 tabular-nums text-muted-foreground")}
        >
          <span suppressHydrationWarning>
            {formatHygieneDuration(guard.startedAt, guard.endedAt ?? now) ?? "—"}
          </span>
        </td>
        <td className={cn(basesCell, "px-2")}>
          <span className="block max-w-[10rem] truncate" title={bases || undefined}>
            {bases || <span className="text-muted-foreground/70">—</span>}
          </span>
        </td>
        {guardMetrics(guard.totals).map((metric) => (
          <td key={metric.id} className="w-0 whitespace-nowrap px-2 text-right">
            <EfaMetricValue metric={metric} />
          </td>
        ))}
        <td className="w-0 px-2 text-right">
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={expanded}
            aria-controls={detailId}
            aria-label={`${expanded ? "Ocultar" : "Ver"} detalle de la guardia de ${guard.owner.name}, ${span}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "size-4 transition-transform motion-reduce:transition-none",
                expanded && "rotate-180",
              )}
            />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr id={detailId} className={cn("border-b", open && "bg-primary/5")}>
          <td colSpan={columnCount} className="px-3 pb-4 pt-1">
            <EfaCoordinationGuardDetail
              guard={guard}
              onGuardChanged={onGuardChanged}
              idPrefix="table-guard-end"
            />
          </td>
        </tr>
      )}
    </>
  );
}

/** Desktop guard list: one dense row per guard, optional collapsible owner groups. */
export function EfaCoordinationGuardTable({ guards, grouped, now, onGuardChanged }: ListProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [collapsedOwners, setCollapsedOwners] = useState<ReadonlySet<string>>(() => new Set());
  const columnCount = (grouped ? 0 : 1) + 4 + metricLabels.length + 1;

  const rows = (list: EfaOversightGuardView[]) =>
    list.map((guard) => (
      <GuardRow
        key={guard.id}
        guard={guard}
        grouped={grouped}
        now={now}
        expanded={expanded.has(guard.id)}
        columnCount={columnCount}
        onToggle={() => setExpanded((current) => toggleIn(current, guard.id))}
        onGuardChanged={onGuardChanged}
      />
    ));

  return (
    <div className="@container min-w-0">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {!grouped && <th className={cn(headerCell, "pl-3")}>Usuario</th>}
            <th className={cn(headerCell, grouped && "pl-3")}>Estado</th>
            <th className={headerCell}>Inicio → Fin</th>
            <th className={cn(headerCell, durationCell)}>Duración</th>
            <th className={cn(headerCell, basesCell)}>Bases</th>
            {metricLabels.map((label) => (
              <th key={label} className={cn(headerCell, "text-right")}>
                {label}
              </th>
            ))}
            <th className={headerCell}>
              <span className="sr-only">Detalle</span>
            </th>
          </tr>
        </thead>
        {grouped ? (
          groupGuardsByOwner(guards).map((group) => {
            const collapsed = collapsedOwners.has(group.ownerUserId);
            return (
              <tbody key={group.ownerUserId} aria-label={`Guardias de ${group.owner.name}`}>
                <tr>
                  <th colSpan={columnCount} scope="rowgroup" className="border-b p-0 font-normal">
                    <button
                      type="button"
                      aria-expanded={!collapsed}
                      className={cn(
                        "flex w-full min-w-0 items-center gap-3 px-3 py-2 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        onGradientText,
                      )}
                      onClick={() =>
                        setCollapsedOwners((current) => toggleIn(current, group.ownerUserId))
                      }
                    >
                      <ChevronRight
                        aria-hidden="true"
                        className={cn(
                          "size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
                          !collapsed && "rotate-90",
                        )}
                      />
                      <EfaOwnerAvatar
                        userId={group.ownerUserId}
                        name={group.owner.name}
                        size="md"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{group.owner.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {group.owner.email}
                        </span>
                      </span>
                      <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                        {ownerGroupSummary(group.guards)}
                      </span>
                    </button>
                  </th>
                </tr>
                {!collapsed && rows(group.guards)}
              </tbody>
            );
          })
        ) : (
          <tbody>{rows(guards)}</tbody>
        )}
      </table>
    </div>
  );
}
