import { useState, type CSSProperties, type ReactNode } from "react";
import { ClipboardList, Menu, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  EfaCoordinationFilterFields,
  type CoordinationOwnerOption,
} from "@/components/EfaCoordinationFilters";
import {
  clearCoordinationFilters,
  countActiveFilters,
  type CoordinationSearch,
} from "@/lib/efa-coordination-filters";

export type CoordinationSectionId = "guards";
type CoordinationSection = { id: CoordinationSectionId; label: string; icon: LucideIcon };

/** Sections of the area. Statistics joins this list once it exists. */
const coordinationSections: readonly CoordinationSection[] = [
  { id: "guards", label: "Guardias", icon: ClipboardList },
];

type FilterProps = {
  owners: readonly CoordinationOwnerOption[];
  search: CoordinationSearch;
  onSearchChange: (next: CoordinationSearch) => void;
};

function filterCountLabel(count: number) {
  return count ? `Filtros (${count})` : "Filtros";
}

function SectionMenu({
  active,
  onNavigate,
}: {
  active: CoordinationSectionId;
  onNavigate?: () => void;
}) {
  return (
    <SidebarMenu>
      {coordinationSections.map((section) => (
        <SidebarMenuItem key={section.id}>
          <SidebarMenuButton
            isActive={section.id === active}
            aria-current={section.id === active ? "page" : undefined}
            tooltip={section.label}
            onClick={onNavigate}
          >
            <section.icon aria-hidden="true" />
            <span>{section.label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

function DesktopSidebar({
  active,
  owners,
  search,
  onSearchChange,
}: FilterProps & { active: CoordinationSectionId }) {
  const { isMobile, setOpen } = useSidebar();
  const activeCount = countActiveFilters(search);
  // On phones the sections live in their own sheet and the filters in a drawer.
  if (isMobile) return null;
  return (
    <Sidebar
      collapsible="icon"
      aria-label="Coordinación EFA"
      // The page keeps its centered layout, so the sidebar is a sticky column, not a fixed rail.
      className="sticky top-4 h-[calc(100svh-2rem)] [&>[data-sidebar=sidebar]]:bg-transparent"
    >
      <SidebarHeader className="flex-row items-center justify-between">
        <span className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground group-data-[collapsible=icon]:hidden">
          Secciones
        </span>
        <SidebarTrigger aria-label="Contraer o expandir el panel lateral" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="pt-0">
          <SidebarGroupContent>
            <SectionMenu active={active} />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator />
        <SidebarGroup>
          <SidebarGroupLabel className="justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Filtros</span>
            {activeCount > 0 && (
              <span className="font-medium normal-case tabular-nums">{activeCount} activos</span>
            )}
          </SidebarGroupLabel>
          <SidebarGroupContent className="group-data-[collapsible=icon]:hidden">
            <div className="space-y-4 px-2 pt-1">
              <EfaCoordinationFilterFields
                idPrefix="sidebar-filter"
                owners={owners}
                value={search}
                onChange={onSearchChange}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-center"
                disabled={activeCount === 0}
                onClick={() => onSearchChange(clearCoordinationFilters(search))}
              >
                {activeCount ? `Limpiar filtros (${activeCount})` : "Limpiar filtros"}
              </Button>
            </div>
          </SidebarGroupContent>
          <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={filterCountLabel(activeCount)}
                aria-label={`Mostrar ${filterCountLabel(activeCount).toLowerCase()}`}
                onClick={() => setOpen(true)}
              >
                <SlidersHorizontal aria-hidden="true" />
              </SidebarMenuButton>
              {activeCount > 0 && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-0.5 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold tabular-nums text-primary-foreground"
                >
                  {activeCount}
                </span>
              )}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

function MobileSections({ active }: { active: CoordinationSectionId }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 md:hidden"
          aria-label="Secciones de Coordinación EFA"
        >
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-4">
        <SheetHeader className="text-left">
          <SheetTitle>Coordinación EFA</SheetTitle>
          <SheetDescription>Elegí una sección.</SheetDescription>
        </SheetHeader>
        <nav aria-label="Secciones" className="mt-4">
          <ul className="space-y-1">
            {coordinationSections.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  aria-current={section.id === active ? "page" : undefined}
                  className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-medium aria-[current=page]:bg-secondary aria-[current=page]:text-secondary-foreground"
                  onClick={() => setOpen(false)}
                >
                  <section.icon className="size-4" aria-hidden="true" />
                  {section.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function MobileFilters({ owners, search, onSearchChange }: FilterProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(search);
  const activeCount = countActiveFilters(search);
  return (
    <Drawer
      open={open}
      shouldScaleBackground={false}
      onOpenChange={(next) => {
        if (next) setDraft(search);
        setOpen(next);
      }}
    >
      <DrawerTrigger asChild>
        <Button type="button" variant="outline" className="min-h-11 shrink-0 gap-2 md:hidden">
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          {filterCountLabel(activeCount)}
        </Button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[90svh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>Filtros de guardias</DrawerTitle>
          <DrawerDescription>Los cambios se aplican al tocar Aplicar.</DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4">
          <EfaCoordinationFilterFields
            idPrefix="drawer-filter"
            owners={owners}
            value={draft}
            onChange={setDraft}
            touch
          />
        </div>
        <DrawerFooter className="grid grid-cols-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setDraft(clearCoordinationFilters(draft))}
          >
            Limpiar
          </Button>
          <Button
            type="button"
            className="min-h-11"
            onClick={() => {
              onSearchChange(draft);
              setOpen(false);
            }}
          >
            Aplicar
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * The "Coordinación EFA" area: a collapsible sidebar with the sections and the current
 * section's filters on desktop, and a sections sheet plus a filters drawer on phones.
 */
export function EfaCoordinationLayout({
  active,
  owners,
  search,
  onSearchChange,
  meta,
  children,
}: FilterProps & {
  active: CoordinationSectionId;
  /** Short context next to the section title, such as the visible guard count. */
  meta?: ReactNode;
  children: ReactNode;
}) {
  const section = coordinationSections.find((item) => item.id === active)!;
  return (
    <SidebarProvider
      className="min-h-0 gap-6"
      style={{ "--sidebar-width": "15rem" } as CSSProperties}
    >
      <DesktopSidebar
        active={active}
        owners={owners}
        search={search}
        onSearchChange={onSearchChange}
      />
      <div className="min-w-0 flex-1 space-y-4">
        <header className="flex min-h-11 items-center gap-2">
          <MobileSections active={active} />
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3">
            <h2 className="text-xl font-semibold">{section.label}</h2>
            {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
          </div>
          <MobileFilters owners={owners} search={search} onSearchChange={onSearchChange} />
        </header>
        {children}
      </div>
    </SidebarProvider>
  );
}
