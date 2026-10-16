import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EfaCoordinationGuardCard } from "@/components/EfaCoordinationGuardCard";
import type { EfaOversightGuardView } from "@/lib/efa-guard-oversight.functions";
import {
  filterOversightGuards,
  groupGuardsByOwner,
  listGuardOwners,
  type CoordinationSearch,
  type CoordinationStatusFilter,
} from "@/lib/efa-coordination-filters";

const fieldClass = "min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3";

function CoordinationFilters({
  owners,
  search,
  onSearchChange,
}: {
  owners: ReturnType<typeof listGuardOwners>;
  search: CoordinationSearch;
  onSearchChange: (next: CoordinationSearch) => void;
}) {
  const update = (patch: Partial<CoordinationSearch>) => {
    const next: CoordinationSearch = { ...search, ...patch };
    for (const key of ["user", "from", "to"] as const) if (!next[key]) delete next[key];
    if (next.status === "all") delete next.status;
    onSearchChange(next);
  };
  const filtered = Boolean(search.user || search.from || search.to || search.status);
  return (
    <section aria-label="Filtros" className="space-y-3 rounded-lg border p-4">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid min-w-0 gap-1 text-sm">
          Usuario
          <select
            className={fieldClass}
            value={search.user ?? ""}
            onChange={(event) => update({ user: event.target.value })}
          >
            <option value="">Todos los usuarios</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          Estado
          <select
            className={fieldClass}
            value={search.status ?? "all"}
            onChange={(event) => update({ status: event.target.value as CoordinationStatusFilter })}
          >
            <option value="all">Todas</option>
            <option value="open">En curso</option>
            <option value="closed">Finalizadas</option>
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          Inicio desde
          <input
            className={fieldClass}
            type="date"
            value={search.from ?? ""}
            onChange={(event) => update({ from: event.target.value })}
          />
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          Inicio hasta
          <input
            className={fieldClass}
            type="date"
            value={search.to ?? ""}
            onChange={(event) => update({ to: event.target.value })}
          />
        </label>
      </div>
      {filtered && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => onSearchChange({})}
        >
          Limpiar filtros
        </Button>
      )}
    </section>
  );
}

/** Admin oversight of every EFA guard. Sections stay separate so statistics can join later. */
export function EfaCoordinationPanel({
  guards,
  search,
  onSearchChange,
  onGuardsChanged,
}: {
  guards: EfaOversightGuardView[];
  search: CoordinationSearch;
  onSearchChange: (next: CoordinationSearch) => void;
  /** Reloads the loaded guard list, e.g. after an end-time correction. */
  onGuardsChanged: () => Promise<unknown>;
}) {
  const [groupByOwner, setGroupByOwner] = useState(true);
  const owners = useMemo(() => listGuardOwners(guards), [guards]);
  const visible = useMemo(() => filterOversightGuards(guards, search), [guards, search]);
  const groups = useMemo(() => groupGuardsByOwner(visible), [visible]);

  return (
    <div className="min-w-0 space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">Coordinación EFA</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Todas las guardias de todos los usuarios.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Guardias</CardTitle>
          <p className="text-sm text-muted-foreground">
            {visible.length === guards.length
              ? plural(guards.length)
              : `${plural(visible.length)} de ${guards.length}`}
          </p>
        </CardHeader>
        <CardContent className="space-y-4 px-3 pt-0 sm:px-6">
          <CoordinationFilters owners={owners} search={search} onSearchChange={onSearchChange} />
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              className="size-5 accent-primary"
              type="checkbox"
              checked={groupByOwner}
              onChange={(event) => setGroupByOwner(event.target.checked)}
            />
            Agrupar por usuario
          </label>
          <section aria-label="Lista de guardias" className="min-w-0 space-y-4">
            {guards.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Todavía no hay guardias registradas.
              </p>
            ) : visible.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No hay guardias con estos filtros.
              </p>
            ) : groupByOwner ? (
              groups.map((group) => (
                <section
                  key={group.ownerUserId}
                  aria-label={`Guardias de ${group.owner.name}`}
                  className="min-w-0 space-y-3"
                >
                  <div className="border-b pb-1">
                    <h3 className="font-semibold">{group.owner.name}</h3>
                    <p className="break-all text-xs text-muted-foreground">
                      {group.owner.email} · {plural(group.guards.length)}
                    </p>
                  </div>
                  {group.guards.map((guard) => (
                    <EfaCoordinationGuardCard
                      key={guard.id}
                      guard={guard}
                      showOwner={false}
                      onGuardChanged={onGuardsChanged}
                    />
                  ))}
                </section>
              ))
            ) : (
              visible.map((guard) => (
                <EfaCoordinationGuardCard
                  key={guard.id}
                  guard={guard}
                  onGuardChanged={onGuardsChanged}
                />
              ))
            )}
          </section>
        </CardContent>
      </Card>
    </div>
  );
}

function plural(count: number) {
  return `${count} ${count === 1 ? "guardia" : "guardias"}`;
}
