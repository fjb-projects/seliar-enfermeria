import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  isGroupedByOwner,
  patchCoordinationSearch,
  type CoordinationSearchPatch,
  type CoordinationSearch,
  type CoordinationStatusFilter,
  listGuardOwners,
} from "@/lib/efa-coordination-filters";
import { cn } from "@/lib/utils";

export type CoordinationOwnerOption = ReturnType<typeof listGuardOwners>[number];

const statusOptions: ReadonlyArray<readonly [CoordinationStatusFilter, string]> = [
  ["all", "Todas"],
  ["open", "En curso"],
  ["closed", "Finalizadas"],
];

/**
 * The guard filters of the coordination area. It edits a search value and reports the next one;
 * the sidebar applies it at once and the mobile drawer keeps it as a draft until "Aplicar".
 */
export function EfaCoordinationFilterFields({
  idPrefix,
  owners,
  value,
  onChange,
  touch = false,
}: {
  /** Keeps label ids unique when the sidebar and the drawer render the fields together. */
  idPrefix: string;
  owners: readonly CoordinationOwnerOption[];
  value: CoordinationSearch;
  onChange: (next: CoordinationSearch) => void;
  /** Larger targets for the mobile drawer. */
  touch?: boolean;
}) {
  const update = (patch: CoordinationSearchPatch) =>
    onChange(patchCoordinationSearch(value, patch));
  const field = cn(
    "w-full min-w-0 rounded-md border bg-background px-2 text-sm",
    touch ? "min-h-11" : "h-9",
  );
  const caption = "text-xs font-medium text-muted-foreground";

  return (
    <div className="grid min-w-0 gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-user`} className={caption}>
          Usuario
        </Label>
        <select
          id={`${idPrefix}-user`}
          className={field}
          value={value.user ?? ""}
          onChange={(event) => update({ user: event.target.value })}
        >
          <option value="">Todos los usuarios</option>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <span id={`${idPrefix}-status`} className={caption}>
          Estado
        </span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-labelledby={`${idPrefix}-status`}
          className="grid grid-cols-3 gap-1"
          value={value.status ?? "all"}
          onValueChange={(status) => {
            if (status) update({ status: status as CoordinationStatusFilter });
          }}
        >
          {statusOptions.map(([status, label]) => (
            <ToggleGroupItem
              key={status}
              value={status}
              className={cn("px-1 text-xs", touch && "h-11")}
            >
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={`${idPrefix}-from`} className={caption}>
            Desde
          </Label>
          <input
            id={`${idPrefix}-from`}
            className={field}
            type="date"
            value={value.from ?? ""}
            max={value.to}
            onChange={(event) => update({ from: event.target.value })}
          />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={`${idPrefix}-to`} className={caption}>
            Hasta
          </Label>
          <input
            id={`${idPrefix}-to`}
            className={field}
            type="date"
            value={value.to ?? ""}
            min={value.from}
            onChange={(event) => update({ to: event.target.value })}
          />
        </div>
      </div>
      <div className={cn("flex items-center justify-between gap-3", touch && "min-h-11")}>
        <Label htmlFor={`${idPrefix}-group`} className="text-sm font-normal">
          Agrupar por usuario
        </Label>
        <Switch
          id={`${idPrefix}-group`}
          checked={isGroupedByOwner(value)}
          onCheckedChange={(checked) => update({ group: checked ? undefined : 0 })}
        />
      </div>
    </div>
  );
}
