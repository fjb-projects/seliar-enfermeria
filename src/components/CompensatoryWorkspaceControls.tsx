import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type CompensatoryWorkspaceTab = "pending" | "scheduled" | "history";

export const COMPENSATORY_WORKSPACE_TABS: ReadonlyArray<{
  value: CompensatoryWorkspaceTab;
  label: string;
}> = [
  { value: "pending", label: "Pendientes" },
  { value: "scheduled", label: "Programados" },
  { value: "history", label: "Historial" },
];

export function compensatoryWorkspaceTabId(idPrefix: string, value: CompensatoryWorkspaceTab) {
  return `${idPrefix}-tab-${value}`;
}

export function compensatoryWorkspacePanelId(idPrefix: string, value: CompensatoryWorkspaceTab) {
  return `${idPrefix}-panel-${value}`;
}

const DEFAULT_ID_PREFIX = "compensatory-workspace";

export function CompensatoryWorkspaceTabs({
  value,
  onValueChange,
  disabled = false,
  idPrefix = DEFAULT_ID_PREFIX,
}: {
  value: CompensatoryWorkspaceTab;
  onValueChange: (value: CompensatoryWorkspaceTab) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<CompensatoryWorkspaceTab, HTMLButtonElement | null>>>({});
  const [indicator, setIndicator] = useState({ x: 0, width: 0 });
  const [painted, setPainted] = useState(indicator);
  const spring = useRef({ x: 0, width: 0, vx: 0, vw: 0 });
  useEffect(() => {
    if (!indicator.width) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const settle = () => {
      window.cancelAnimationFrame(frame);
      spring.current = { ...indicator, vx: 0, vw: 0 };
      setPainted(indicator);
    };
    if (!spring.current.width || preference.matches) settle();
    else {
      let previous = performance.now();
      const tick = (now: number) => {
        const dt = Math.min((now - previous) / 1000, 1 / 30);
        previous = now;
        const current = spring.current;
        current.vx += (-360 * (current.x - indicator.x) - 30 * current.vx) * dt;
        current.vw += (-360 * (current.width - indicator.width) - 30 * current.vw) * dt;
        current.x += current.vx * dt;
        current.width += current.vw * dt;
        setPainted({ x: current.x, width: current.width });
        if (
          Math.abs(current.x - indicator.x) +
            Math.abs(current.width - indicator.width) +
            Math.abs(current.vx) +
            Math.abs(current.vw) >
          0.2
        )
          frame = window.requestAnimationFrame(tick);
        else settle();
      };
      frame = window.requestAnimationFrame(tick);
    }
    const onPreference = () => {
      if (preference.matches) settle();
    };
    preference.addEventListener("change", onPreference);
    return () => {
      window.cancelAnimationFrame(frame);
      preference.removeEventListener("change", onPreference);
    };
  }, [indicator]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === "undefined") return;
    let frame = 0;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const selected = tabRefs.current[value];
        const rootBox = root.getBoundingClientRect();
        const tabBox = selected?.getBoundingClientRect();
        if (!tabBox || rootBox.width === 0) return;
        setIndicator({ x: tabBox.left - rootBox.left, width: tabBox.width });
      });
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(root);
    for (const button of Object.values(tabRefs.current)) if (button) observer?.observe(button);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [value]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = COMPENSATORY_WORKSPACE_TABS.findIndex((tab) => tab.value === value);
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight")
      nextIndex = (currentIndex + 1) % COMPENSATORY_WORKSPACE_TABS.length;
    if (event.key === "ArrowLeft")
      nextIndex =
        (currentIndex - 1 + COMPENSATORY_WORKSPACE_TABS.length) %
        COMPENSATORY_WORKSPACE_TABS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = COMPENSATORY_WORKSPACE_TABS.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    const next = COMPENSATORY_WORKSPACE_TABS[nextIndex];
    if (!next || disabled) return;
    tabRefs.current[next.value]?.focus();
    onValueChange(next.value);
  }

  return (
    <div
      ref={rootRef}
      role="tablist"
      aria-label="Vistas de compensatorios"
      className="relative isolate inline-grid min-w-0 grid-cols-3 items-stretch border-b border-border max-[620px]:flex-1 max-[620px]:grid-cols-[1fr_1.1fr_0.9fr] min-[621px]:shrink-0"
    >
      <span
        aria-hidden="true"
        data-testid="compensatory-workspace-indicator"
        className="pointer-events-none absolute inset-y-0 left-0 -z-10 rounded-t-md border-x border-t border-border bg-primary"
        style={{ transform: `translateX(${painted.x}px)`, width: painted.width } as CSSProperties}
      />
      {COMPENSATORY_WORKSPACE_TABS.map((tab) => (
        <button
          key={tab.value}
          ref={(element) => {
            tabRefs.current[tab.value] = element;
          }}
          id={compensatoryWorkspaceTabId(idPrefix, tab.value)}
          type="button"
          role="tab"
          aria-controls={compensatoryWorkspacePanelId(idPrefix, tab.value)}
          aria-selected={value === tab.value}
          tabIndex={value === tab.value ? 0 : -1}
          disabled={disabled}
          className={`relative min-w-0 min-h-[34px] rounded-t-md px-2.5 text-xs font-semibold whitespace-nowrap focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none max-[620px]:min-h-11 max-[620px]:px-1 ${value === tab.value ? `text-primary-foreground ${!painted.width ? "bg-primary" : ""}` : "bg-muted text-muted-foreground hover:text-foreground"}`}
          onClick={() => onValueChange(tab.value)}
          onKeyDown={handleKeyDown}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function CompensatoryWorkspaceTabPanel({
  value,
  activeTab,
  idPrefix = DEFAULT_ID_PREFIX,
  children,
  className = "",
}: {
  value: CompensatoryWorkspaceTab;
  activeTab: CompensatoryWorkspaceTab;
  idPrefix?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={compensatoryWorkspacePanelId(idPrefix, value)}
      role="tabpanel"
      aria-labelledby={compensatoryWorkspaceTabId(idPrefix, value)}
      hidden={activeTab !== value}
      tabIndex={0}
      className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 ${className}`}
    >
      {children}
    </section>
  );
}

export const COMPENSATORY_WORKSPACE_DOCK_RESERVE_CLASS = "pb-36 min-[621px]:pb-0";

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().trim();
}

export function CompensatoryWorkspaceScope({
  staffOptions,
  selectedStaffId,
  onSelectStaff,
  disabled = false,
}: {
  staffOptions: Array<{ id: string; label: string }>;
  selectedStaffId: string | null;
  onSelectStaff: (id: string | null) => void;
  disabled?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedOption = staffOptions.find((option) => option.id === selectedStaffId);
  const selectedLabel = selectedOption?.label ?? "Vista general";
  const filteredOptions = staffOptions.filter((option) =>
    normalizeSearch(option.label).includes(normalizeSearch(query)),
  );
  const navClearanceRef = useRef("calc(4rem + env(safe-area-inset-bottom, 0px))");
  const [navClearance, setNavClearance] = useState(navClearanceRef.current);

  useEffect(() => {
    if (disabled) setPickerOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const nav = document.querySelector<HTMLElement>('nav[aria-label="Navegación principal"]');
        if (!nav) {
          setNavClearance("calc(4rem + env(safe-area-inset-bottom, 0px))");
          return;
        }
        const clearance = Math.max(0, window.innerHeight - nav.getBoundingClientRect().top);
        setNavClearance(`${clearance}px`);
      });
    };
    update();
    const nav = document.querySelector<HTMLElement>('nav[aria-label="Navegación principal"]');
    const observer =
      nav && typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (nav) observer?.observe(nav);
    window.addEventListener("resize", update);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, []);

  function chooseStaff(id: string | null) {
    if (disabled) return;
    if (id === null) setQuery("");
    onSelectStaff(id);
    setPickerOpen(false);
  }

  const dockStyle = { "--compensatory-workspace-nav-clearance": navClearance } as CSSProperties;

  return (
    <>
      <label className="max-[620px]:hidden">
        <span className="sr-only">Alcance de las solicitudes</span>
        <select
          aria-label="Alcance de las solicitudes"
          value={selectedOption?.id ?? ""}
          disabled={disabled}
          className="h-9 max-w-52 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(event) => chooseStaff(event.currentTarget.value || null)}
        >
          <option value="">Vista general</option>
          {staffOptions.length > 0 && (
            <optgroup label="Por agente">
              {staffOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      <div
        className="fixed inset-x-0 z-40 hidden justify-center px-3 pb-2 max-[620px]:flex"
        style={{ ...dockStyle, bottom: "var(--compensatory-workspace-nav-clearance)" }}
        data-testid="compensatory-workspace-mobile-dock"
      >
        <div className="flex min-h-12 max-w-full items-center gap-1 rounded-full border border-border bg-card/95 p-1 shadow-lg backdrop-blur">
          <button
            type="button"
            aria-pressed={selectedStaffId === null}
            disabled={disabled}
            className={`min-h-11 rounded-full px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedStaffId === null ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            onClick={() => chooseStaff(null)}
          >
            General
          </button>
          <Button
            type="button"
            variant={selectedStaffId === null ? "ghost" : "default"}
            aria-haspopup="dialog"
            aria-expanded={pickerOpen && !disabled}
            aria-label={`Por agente: ${selectedLabel}`}
            disabled={disabled}
            className="min-h-11 max-w-[min(58vw,18rem)] rounded-full px-4"
            onClick={() => {
              if (disabled) return;
              setQuery("");
              setPickerOpen(true);
            }}
          >
            <Users className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{selectedStaffId ? selectedLabel : "Por agente"}</span>
          </Button>
        </div>
      </div>

      <Dialog open={pickerOpen && !disabled} onOpenChange={setPickerOpen}>
        <DialogContent className="max-h-[calc(100svh-2rem-env(safe-area-inset-bottom))] w-[calc(100%-1.5rem)] gap-3 overflow-hidden p-4 sm:max-w-md">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle>Elegir agente</DialogTitle>
            <DialogDescription>Buscá por nombre, apellido o DNI.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              autoFocus
              type="search"
              value={query}
              aria-label="Buscar agente por nombre o DNI"
              placeholder="Nombre, apellido o DNI"
              disabled={disabled}
              className="min-h-11 pl-9"
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </div>
          <div
            role="listbox"
            aria-label="Agentes disponibles"
            className="max-h-[min(50svh,22rem)] overflow-y-auto overscroll-contain rounded-md border border-border p-1"
          >
            {filteredOptions.length === 0 ? (
              <p role="status" className="px-3 py-5 text-center text-sm text-muted-foreground">
                No se encontraron agentes.
              </p>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={selectedStaffId === option.id}
                  disabled={disabled}
                  className="flex min-h-11 w-full items-center rounded-sm px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => chooseStaff(option.id)}
                >
                  <span className="truncate">{option.label}</span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
