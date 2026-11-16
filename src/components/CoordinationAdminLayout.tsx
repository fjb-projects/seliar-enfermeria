import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Banknote, Menu, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type CoordinationAdminSection = "home" | "compensatorios" | "users";
const entries = [
  {
    href: "/admin-usuarios",
    label: "Usuarios y accesos",
    icon: UsersRound,
    section: "users" as const,
  },
  {
    href: "/coordinacion/compensatorios",
    label: "Compensatorios",
    icon: Banknote,
    section: "compensatorios" as const,
  },
  { href: "/coordinacion-efa", label: "Coordinación EFA", icon: UsersRound },
];

const onGradientText = "font-semibold text-white [text-shadow:0_2px_2px_rgb(0_0_0/0.75)]";

function AdminNav({
  active,
  onNavigate,
}: {
  active: CoordinationAdminSection;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Navegación de coordinación">
      <ul className="space-y-1">
        {entries.map(({ href, label, icon: Icon, section }) => {
          const current = section === active;
          return (
            <li key={href}>
              <Link
                to={href}
                aria-current={current ? "page" : undefined}
                aria-label={label}
                title={label}
                onClick={onNavigate}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                  "[text-shadow:0_2px_2px_rgb(0_0_0/0.75)]",
                  current && "bg-white text-primary [text-shadow:none]",
                  "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2",
                )}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span className="group-data-[collapsible=icon]:hidden">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function AdminNavigation({ active }: { active: CoordinationAdminSection }) {
  const { state } = useSidebar();
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <>
      <aside
        aria-label="Coordinación"
        data-state={state}
        data-collapsible={state === "collapsed" ? "icon" : undefined}
        className={cn(
          "group sticky top-[var(--workflow-header-height,0px)] hidden h-[calc(100svh-var(--coordination-content-offset,0px))] shrink-0 overflow-y-auto rounded-2xl bg-[image:var(--workflow-background)] p-3 shadow-sm transition-[width] duration-200 md:block",
          state === "expanded" ? "w-60" : "w-16",
        )}
      >
        <div className="mb-3 flex min-h-11 items-center justify-between gap-2 px-1">
          {state === "expanded" && (
            <h1 className={cn("px-2 text-lg font-semibold", onGradientText)}>Coordinación</h1>
          )}
          <SidebarTrigger
            aria-label="Contraer o expandir el panel lateral"
            className="size-11 text-white hover:bg-white/20"
          />
        </div>
        <AdminNav active={active} />
      </aside>
      <div className="flex items-center gap-2 px-3 pt-2 md:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 gap-2"
              aria-label="Abrir navegación de coordinación"
            >
              <Menu aria-hidden="true" className="size-4" /> Navegación
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 bg-[image:var(--workflow-background)] p-4">
            <SheetHeader className="text-left">
              <SheetTitle className="text-white">Coordinación</SheetTitle>
              <SheetDescription className="text-white/90">
                Herramientas administrativas.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-5">
              <AdminNav active={active} onNavigate={() => setMobileOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

export function CoordinationAdminLayout({
  active,
  children,
}: {
  active: CoordinationAdminSection;
  children: ReactNode;
}) {
  const layoutRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const layout = layoutRef.current;
    if (!layout) return;
    const updateOffset = () =>
      layout.style.setProperty(
        "--coordination-content-offset",
        `${Math.max(0, layout.getBoundingClientRect().top + window.scrollY)}px`,
      );
    updateOffset();
    const observer = new ResizeObserver(updateOffset);
    observer.observe(layout);
    window.addEventListener("resize", updateOffset);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateOffset);
    };
  }, []);
  return (
    <SidebarProvider
      ref={layoutRef}
      className="min-h-0 flex-col items-start gap-2 md:min-h-[calc(100svh-var(--coordination-content-offset,0px))] md:flex-row md:gap-6"
      style={{ "--sidebar-width": "15rem" } as CSSProperties}
    >
      <AdminNavigation active={active} />
      <div className="@container/main w-full min-w-0 flex-1 space-y-3 p-3 md:py-3 md:pl-0 md:pr-4">
        {children}
      </div>
    </SidebarProvider>
  );
}
