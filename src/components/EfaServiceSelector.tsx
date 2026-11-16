import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  CircleAlert,
  History,
  ListFilter,
  LoaderCircle,
  PanelLeftOpen,
  Plus,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ServiceSelectorItem = {
  id: string;
  label: string;
  priority: "red" | "yellow" | "green" | null;
  mobiles: string[];
  status: "loading" | "ready" | "error";
};

type EfaServiceSelectorProps = {
  items: ServiceSelectorItem[];
  selectedId: string | null;
  onSelect: (id: string) => boolean | void;
  onCreate: () => boolean | void;
  canCreate: boolean;
  onHistory: () => void;
  historyCount: number;
  onRetry: (id: string) => void;
};

const priorityNames = {
  red: "Prioridad roja",
  yellow: "Prioridad amarilla",
  green: "Prioridad verde",
};

const priorityColors = {
  red: "bg-red-400",
  yellow: "bg-yellow-300",
  green: "bg-emerald-400",
};

const selectorFocus =
  "focus-visible:ring-2 focus-visible:ring-[#a9b2ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0f28]";

function mobileDescription(item: ServiceSelectorItem) {
  if (item.mobiles.length) {
    const refresh =
      item.status === "error"
        ? "; no se pudo actualizar"
        : item.status === "loading"
          ? "; actualizando"
          : "";
    return `Móviles: ${item.mobiles.join(", ")}${refresh}`;
  }
  if (item.status === "loading") return "Cargando móviles";
  if (item.status === "error")
    return item.priority
      ? "No se pudieron cargar los móviles"
      : "No se pudieron cargar prioridad ni móviles";
  return item.mobiles.length ? `Móviles: ${item.mobiles.join(", ")}` : "Sin móvil asignado";
}

function priorityDescription(item: ServiceSelectorItem) {
  if (item.priority) return priorityNames[item.priority];
  return item.status === "error" ? "Prioridad no disponible" : "Prioridad sin definir";
}

const priorityLetters = { red: "R", yellow: "A", green: "V" };

/**
 * Square with the initial inside: priority never depends on color alone. A failed load without a
 * known priority gets its own "!" mark so it cannot be mistaken for a service with no priority.
 */
export function PriorityMark({
  item,
}: {
  item: Pick<ServiceSelectorItem, "priority"> & { status?: ServiceSelectorItem["status"] };
}) {
  const unavailable = !item.priority && item.status === "error";
  return (
    <span
      aria-hidden="true"
      data-priority={item.priority ?? (unavailable ? "unavailable" : "unknown")}
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-[4px] text-[11px] font-bold leading-none text-[#0c0f28]",
        item.priority
          ? priorityColors[item.priority]
          : unavailable
            ? "bg-amber-300"
            : "bg-slate-400",
      )}
    >
      {item.priority ? priorityLetters[item.priority] : unavailable ? "!" : "?"}
    </span>
  );
}

/** Priority and unit, shown next to a service name so the context survives leaving the rail. */
export function ServicePriorityTag({
  metadata,
}: {
  metadata: Pick<ServiceSelectorItem, "priority" | "mobiles"> | undefined;
}) {
  if (!metadata) return null;
  const { priority, mobiles } = metadata;
  return (
    <span className="inline-flex items-center gap-2">
      <PriorityMark item={{ priority }} />
      <span className="sr-only">
        {priority ? priorityNames[priority] : "Prioridad sin definir"}
      </span>
      {mobiles.length > 0 && <span className="t-clock text-[13px]">{mobiles.join(" · ")}</span>}
    </span>
  );
}

function CompactMobileLabel({ item }: { item: ServiceSelectorItem }) {
  if (item.status === "loading" && item.mobiles.length === 0) {
    return (
      <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
    );
  }
  if (item.status === "error" && item.mobiles.length === 0)
    return <CircleAlert aria-hidden="true" className="size-4" />;
  return (
    <span className="flex w-full min-w-0 items-center justify-center gap-0.5 text-xs font-semibold tabular-nums">
      <span className="truncate">{item.mobiles[0]?.replace(/^m[oó]vil\s+/i, "") ?? "?"}</span>
      {item.mobiles.length > 1 && <span className="shrink-0">+{item.mobiles.length - 1}</span>}
    </span>
  );
}

function SelectorContents({
  expanded,
  close,
  items,
  selectedId,
  onSelect,
  onCreate,
  canCreate,
  onHistory,
  historyCount,
  onRetry,
}: EfaServiceSelectorProps & { expanded: boolean; close: () => void }) {
  return (
    <>
      <nav aria-label="Servicios activos" className="p-2">
        {items.length ? (
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.id} className="flex flex-col gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`${item.label}. ${priorityDescription(item)}. ${mobileDescription(item)}`}
                  aria-pressed={selectedId === item.id}
                  aria-busy={item.status === "loading"}
                  title={`${item.label} · ${priorityDescription(item)} · ${mobileDescription(item)}`}
                  onClick={() => {
                    if (onSelect(item.id) !== false) close();
                  }}
                  className={cn(
                    "h-14 min-h-14 w-full min-w-0 shrink-0 rounded-lg px-2 py-2 text-[#f2f3ff] hover:bg-white/10 hover:text-white",
                    expanded ? "justify-start gap-3 text-left" : "flex-col gap-1.5",
                    selectedId === item.id && "bg-white/15 ring-1 ring-inset ring-white/30",
                    selectorFocus,
                  )}
                >
                  <PriorityMark item={item} />
                  {expanded ? (
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block truncate text-sm font-semibold">{item.label}</span>
                      <span className="block truncate text-xs font-normal text-[#c4c8f0]">
                        {mobileDescription(item)}
                      </span>
                    </span>
                  ) : (
                    <CompactMobileLabel item={item} />
                  )}
                </Button>
                {item.status === "error" && (
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Reintentar ${item.label}`}
                    title={`Reintentar ${item.label}`}
                    className={cn(
                      "h-11 min-h-11 min-w-11 shrink-0 px-2 text-[#f2f3ff] hover:bg-white/10 hover:text-white",
                      expanded && "justify-start",
                      selectorFocus,
                    )}
                    onClick={() => onRetry(item.id)}
                  >
                    <RotateCcw aria-hidden="true" />
                    {expanded && "Reintentar"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex h-20 items-center justify-center break-words px-1 text-center text-xs text-[#c4c8f0]">
            No hay servicios activos
          </p>
        )}
      </nav>
      <div className="shrink-0 space-y-1 border-t border-white/15 p-2">
        <Button
          type="button"
          variant="ghost"
          aria-label="Crear servicio"
          title={canCreate ? "Crear servicio" : "No se puede crear un servicio en esta guardia"}
          disabled={!canCreate}
          onClick={() => {
            if (onCreate() !== false) close();
          }}
          className={cn(
            "min-h-11 w-full px-2 text-[#f2f3ff] hover:bg-white/10 hover:text-white",
            expanded && "justify-start",
            selectorFocus,
          )}
        >
          <Plus aria-hidden="true" />
          {expanded && "Crear servicio"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          aria-label={`Ver historial de servicios (${historyCount})`}
          title={`Ver historial de servicios (${historyCount})`}
          onClick={() => {
            onHistory();
            close();
          }}
          className={cn(
            "min-h-11 w-full px-2 text-[#f2f3ff] hover:bg-white/10 hover:text-white",
            expanded && "justify-start",
            selectorFocus,
          )}
        >
          <History aria-hidden="true" />
          {expanded && <span className="flex-1 text-left">Historial</span>}
          {historyCount > 0 && <span className="text-xs tabular-nums">{historyCount}</span>}
        </Button>
      </div>
    </>
  );
}

export function EfaServiceSelector(props: EfaServiceSelectorProps) {
  const [desktopExpanded, setDesktopExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const desktopToggle = useRef<HTMLButtonElement>(null);
  const toggleWasExpanded = useRef(false);
  const desktopContentId = useId();
  const selectedItem = props.items.find((item) => item.id === props.selectedId);

  useEffect(() => setPortalTarget(document.body), []);

  return (
    <>
      <aside
        aria-label="Selector de servicios activos"
        data-service-selector="rail"
        className="sticky top-[calc(var(--workflow-header-height,0px)+1rem)] z-40 hidden w-20 shrink-0 self-start md:block"
        onPointerEnter={(event) => {
          if (
            event.pointerType === "mouse" &&
            window.matchMedia("(hover: hover) and (pointer: fine)").matches
          ) {
            setDesktopExpanded(true);
          }
        }}
        onPointerLeave={(event) => {
          if (!event.currentTarget.contains(document.activeElement)) setDesktopExpanded(false);
        }}
        onFocusCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setDesktopExpanded(true);
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setDesktopExpanded(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            desktopToggle.current?.focus();
            setDesktopExpanded(false);
          }
        }}
      >
        <div
          className={cn(
            "card-focus flex max-h-[calc(100dvh-12rem)] flex-col overflow-hidden",
            desktopExpanded ? "w-[19rem] shadow-xl" : "w-20",
          )}
          style={desktopExpanded ? { backgroundColor: "rgb(12 15 40 / .97)" } : undefined}
        >
          <div className="flex min-h-14 shrink-0 items-center justify-between gap-2 p-2">
            {desktopExpanded && (
              <h2 className="pl-1 text-sm font-semibold">
                Servicios activos <span className="text-[#c4c8f0]">({props.items.length})</span>
              </h2>
            )}
            <Button
              ref={desktopToggle}
              type="button"
              variant="ghost"
              aria-label={
                desktopExpanded
                  ? "Contraer selector de servicios"
                  : "Expandir selector de servicios"
              }
              aria-expanded={desktopExpanded}
              aria-controls={desktopContentId}
              className={cn(
                "min-h-11 min-w-11 shrink-0 px-2 text-[#f2f3ff] hover:bg-white/10 hover:text-white",
                !desktopExpanded && "mx-auto",
                selectorFocus,
              )}
              onPointerDown={() => {
                toggleWasExpanded.current = desktopExpanded;
              }}
              onClick={(event) =>
                setDesktopExpanded(
                  event.detail === 0 ? !desktopExpanded : !toggleWasExpanded.current,
                )
              }
            >
              {desktopExpanded ? (
                <ChevronLeft aria-hidden="true" />
              ) : (
                <PanelLeftOpen aria-hidden="true" />
              )}
            </Button>
          </div>
          <div
            id={desktopContentId}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-color:#a9b2ff_transparent] [scrollbar-width:thin]"
          >
            <SelectorContents
              {...props}
              expanded={desktopExpanded}
              close={() => setDesktopExpanded(false)}
            />
          </div>
        </div>
      </aside>
      {portalTarget &&
        createPortal(
          <Popover open={mobileOpen} onOpenChange={setMobileOpen}>
            <div
              data-service-selector="floating"
              className="fixed left-4 z-[45] md:hidden"
              style={{ bottom: "calc(8.5rem + env(safe-area-inset-bottom, 0px))" }}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  aria-label={`Seleccionar servicio activo (${props.items.length})${selectedItem ? `. Seleccionado: ${selectedItem.label}. ${priorityDescription(selectedItem)}. ${mobileDescription(selectedItem)}` : ""}`}
                  title={
                    selectedItem
                      ? `${selectedItem.label} · ${priorityDescription(selectedItem)} · ${mobileDescription(selectedItem)}`
                      : "Seleccionar servicio activo"
                  }
                  className={cn(
                    "min-h-14 max-w-[calc(100vw-2rem)] gap-2.5 rounded-xl border border-white/20 bg-[#0c0f28]/95 px-4 text-[#f2f3ff] shadow-lg hover:bg-[#1c2149]",
                    selectorFocus,
                  )}
                >
                  {selectedItem ? (
                    <PriorityMark item={selectedItem} />
                  ) : (
                    <ListFilter aria-hidden="true" />
                  )}
                  <span>
                    Servicios <span className="text-[#c4c8f0]">({props.items.length})</span>
                  </span>
                  {selectedItem && (
                    <span className="max-w-24">
                      <CompactMobileLabel item={selectedItem} />
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
            </div>
            <PopoverContent
              side="top"
              align="start"
              sideOffset={12}
              collisionPadding={16}
              aria-label="Seleccionar servicio activo"
              data-service-selector="popup"
              className="card-focus z-[45] flex w-[min(20rem,calc(100vw-2rem))] flex-col overflow-hidden p-0 md:hidden"
              style={{
                zIndex: 45,
                backgroundColor: "rgb(12 15 40 / .97)",
                maxHeight:
                  "min(32rem, var(--radix-popover-content-available-height, calc(100dvh - 11rem)))",
              }}
            >
              <h2 className="shrink-0 px-4 pb-2 pt-4 text-base font-semibold">
                Servicios activos <span className="text-[#c4c8f0]">({props.items.length})</span>
              </h2>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-color:#a9b2ff_transparent] [scrollbar-width:thin]">
                <SelectorContents {...props} expanded close={() => setMobileOpen(false)} />
              </div>
            </PopoverContent>
          </Popover>,
          portalTarget,
        )}
    </>
  );
}
