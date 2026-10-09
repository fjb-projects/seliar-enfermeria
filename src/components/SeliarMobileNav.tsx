import { Link, useLocation } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ClipboardClock,
  ClockPlus,
  Home,
  LogIn,
  LogOut,
  Palmtree,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getEfaPanelQuickActions, type EfaPanelQuickAction } from "@/lib/efa-panel-quick-actions";
import { useSeliarNavigation } from "@/components/SeliarNavigationProvider";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isAdministrator } from "@/lib/private-ui";

const NAV_REVEAL_EDGE_PX = 96;
const NAV_TOP_THRESHOLD_PX = 8;
const NAV_HIDE_SCROLL_PX = 6;
const NAV_REVEAL_SCROLL_PX = 4;
const NAV_HIDE_AFTER_SCROLL_PX = 24;

type NavigationPath =
  | "/"
  | "/panel"
  | "/login"
  | "/ingreso"
  | "/control-guardia"
  | "/horarios"
  | "/cambio-guardia"
  | "/compensatorio"
  | "/lao"
  | "/guardia-efa"
  | "/episodios-efa"
  | "/admin-usuarios";

type NavigationItem = { to: NavigationPath; label: string; icon: LucideIcon };

const navigationGroups: {
  id: "guardia" | "gestiones";
  label: string;
  icon: LucideIcon;
  items: NavigationItem[];
}[] = [
  {
    id: "guardia",
    label: "Tu guardia",
    icon: ClipboardClock,
    items: [
      { to: "/ingreso", label: "Registrar ingreso", icon: LogIn },
      { to: "/control-guardia", label: "Control de guardia", icon: ClipboardClock },
    ],
  },
  {
    id: "gestiones",
    label: "Gestiones",
    icon: CalendarDays,
    items: [
      { to: "/horarios", label: "Horarios", icon: CalendarDays },
      { to: "/cambio-guardia", label: "Cambio de guardia", icon: ArrowLeftRight },
      { to: "/compensatorio", label: "Compensatorio", icon: ClockPlus },
      { to: "/lao", label: "Solicitud de LAO", icon: Palmtree },
    ],
  },
];

type NavigationGroupId = "guardia" | "gestiones" | "private";

function NavigationLink({
  item,
  active,
  onNavigate,
}: {
  item: NavigationItem;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={`flex min-h-12 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
        active ? "bg-secondary text-secondary-foreground" : "text-foreground hover:bg-muted"
      }`}
    >
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">{item.label}</span>
      {active ? <span className="sr-only">Página actual</span> : null}
    </Link>
  );
}

function quickActionItem(action: EfaPanelQuickAction): NavigationItem {
  return { to: action.to, label: action.navLabel, icon: action.icon };
}

export function SeliarMobileNav() {
  const { pathname } = useLocation();
  const navigation = useSeliarNavigation();
  const navRef = useRef<HTMLElement | null>(null);
  const groupButtonRefs = useRef<Partial<Record<NavigationGroupId, HTMLButtonElement | null>>>({});
  const visibilityRef = useRef(true);
  const [isVisible, setIsVisible] = useState(true);
  const [openGroup, setOpenGroup] = useState<NavigationGroupId | null>(null);
  const isAuthenticated = navigation.sessionStatus === "authenticated";
  const authenticatedSession = isAuthenticated ? navigation.session : null;
  const homeTo: NavigationPath = isAuthenticated ? "/panel" : "/";
  const privateItems = useMemo(() => {
    if (navigation.summary) {
      const uniqueItems = new Map<NavigationPath, NavigationItem>();
      for (const action of getEfaPanelQuickActions(navigation.summary)) {
        if (!uniqueItems.has(action.to)) uniqueItems.set(action.to, quickActionItem(action));
      }
      return [...uniqueItems.values()];
    }
    if (isAuthenticated) {
      return [{ to: "/guardia-efa" as const, label: "Consulta EFA", icon: ClipboardClock }];
    }
    return [];
  }, [isAuthenticated, navigation.summary]);

  const setVisibility = useCallback((visible: boolean) => {
    if (visibilityRef.current === visible) return;
    visibilityRef.current = visible;
    setIsVisible(visible);
  }, []);

  const reveal = useCallback(() => setVisibility(true), [setVisibility]);

  useEffect(() => {
    const lastScrollY = { current: window.scrollY };
    const nav = navRef.current;
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const scrollDelta = currentScrollY - lastScrollY.current;
      lastScrollY.current = currentScrollY;
      if (currentScrollY <= NAV_TOP_THRESHOLD_PX) {
        reveal();
        return;
      }
      if (nav?.contains(document.activeElement)) return;
      if (scrollDelta <= -NAV_REVEAL_SCROLL_PX) reveal();
      else if (scrollDelta >= NAV_HIDE_SCROLL_PX && currentScrollY > NAV_HIDE_AFTER_SCROLL_PX)
        setVisibility(false);
    };
    const revealNearBottomEdge = (clientY: number) => {
      if (clientY >= window.innerHeight - NAV_REVEAL_EDGE_PX) reveal();
    };
    const handlePointerMove = (event: PointerEvent) => revealNearBottomEdge(event.clientY);
    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) revealNearBottomEdge(touch.clientY);
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (nav?.contains(event.target as Node)) reveal();
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("focusin", handleFocusIn);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("focusin", handleFocusIn);
    };
  }, [reveal, setVisibility]);

  useEffect(() => {
    reveal();
    setOpenGroup(null);
  }, [pathname, navigation.sessionStatus, reveal]);

  useEffect(() => {
    if (!openGroup) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenGroup(null);
        groupButtonRefs.current[openGroup]?.focus();
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpenGroup(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [openGroup]);

  const groups = isAuthenticated
    ? [{ id: "private" as const, label: "Área privada", icon: ClipboardClock, items: privateItems }]
    : navigation.sessionStatus === "anonymous"
      ? navigationGroups
      : [];
  const activeHome = pathname === homeTo;
  const statusText =
    navigation.sessionStatus === "loading"
      ? "Verificando sesión…"
      : navigation.sessionStatus === "unavailable"
        ? "No se pudo verificar la sesión."
        : "";

  return (
    <>
      <nav aria-label="Navegación principal" className="relative z-40 hidden border-b bg-card/95 shadow-sm backdrop-blur md:block">
        <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-1.5 xl:grid-cols-[auto_minmax(0,1fr)_auto]">
          <Link
            to={homeTo}
            aria-current={activeHome ? "page" : undefined}
            className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-2 font-display text-sm font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <img src="/logoSIES.jpg" alt="Logo SIES" className="h-8 w-12 shrink-0 rounded bg-white p-1 object-contain" />
            <span className="whitespace-nowrap">Enfermería SeLIAR</span>
          </Link>
          <div className="col-span-2 row-start-2 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 xl:col-span-1 xl:col-start-2 xl:row-start-auto">
            <Link
              to={homeTo}
              aria-current={activeHome ? "page" : undefined}
              className={`flex min-h-11 items-center rounded-lg px-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeHome ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              Inicio
            </Link>
            {navigation.sessionStatus === "anonymous" &&
              navigationGroups.flatMap(({ items }) => items).map((item) => (
              <Link
                key={item.to}
                to={item.to}
                aria-current={pathname === item.to ? "page" : undefined}
                className={`flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${pathname === item.to ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <item.icon className="size-4" aria-hidden="true" />
                {item.label}
              </Link>
              ))}
            {isAuthenticated && privateItems.map((item) => (
            <Link
              key={item.to + item.label}
              to={item.to}
              aria-current={pathname === item.to ? "page" : undefined}
              className={`flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${pathname === item.to ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              <item.icon className="size-4" aria-hidden="true" />
              {item.label}
            </Link>
            ))}
            {isAuthenticated && navigation.summaryError && (
              <div className="flex min-h-11 items-center gap-2 text-xs text-muted-foreground" role="status">
                <span>No se cargaron las acciones EFA.</span>
                <button className="min-h-11 px-1 font-semibold text-foreground underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={navigation.retrySummary}>
                  Reintentar
                </button>
              </div>
            )}
            {navigation.sessionStatus === "unavailable" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                {statusText}
                <button className="min-h-11 px-2 font-semibold text-foreground underline" onClick={navigation.retrySession}>
                  Reintentar
                </button>
              </div>
            )}
            {navigation.sessionStatus === "loading" && <span role="status" className="text-xs text-muted-foreground">{statusText}</span>}
          </div>
          {navigation.sessionStatus === "anonymous" && (
            <Link to="/login" aria-current={pathname === "/login" ? "page" : undefined} className="col-start-2 row-start-1 flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:col-start-3 xl:row-start-auto">
              <LogIn className="size-4" aria-hidden="true" />
              Login
            </Link>
          )}
          {authenticatedSession && (
            <div className="col-start-2 row-start-1 flex min-w-0 items-center justify-end gap-2 xl:col-start-3 xl:row-start-auto">
              {navigation.logoutError && <p role="alert" className="max-w-48 text-xs text-destructive">{navigation.logoutError}</p>}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex min-h-11 max-w-52 min-w-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="truncate">{authenticatedSession.user.name}</span>
                    <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-2rem)]">
                  <DropdownMenuLabel className="break-all font-normal text-muted-foreground">
                    {authenticatedSession.user.email}
                  </DropdownMenuLabel>
                  <div className="flex flex-wrap gap-1 px-2 pb-2">
                    <Badge variant="secondary">Enfermería</Badge>
                    {authenticatedSession.roles.includes("efa") && <Badge>Acceso EFA</Badge>}
                    {isAdministrator(authenticatedSession.roles) && <Badge variant="outline">Administración</Badge>}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={navigation.logoutPending} onSelect={() => void navigation.logout()} className="min-h-11 text-destructive focus:text-destructive">
                    <LogOut aria-hidden="true" />
                    {navigation.logoutPending ? "Logging out…" : "Logout"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </nav>

      <nav
        ref={navRef}
        aria-label="Navegación principal"
        className={`fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 shadow-[0_-8px_24px_oklch(0.27_0.035_202/0.12)] backdrop-blur transition-transform duration-200 motion-reduce:transition-none md:hidden ${isVisible ? "translate-y-0" : "translate-y-full"}`}
      >
        {openGroup ? (
          <div
            id={`${openGroup}-menu`}
            className="absolute inset-x-3 bottom-full mx-auto mb-2 max-w-lg rounded-2xl border border-border bg-card p-2 shadow-[0_-8px_24px_oklch(0.27_0.035_202/0.18)]"
            role="group"
            aria-label={`${groups.find(({ id }) => id === openGroup)?.label ?? "Área privada"} destinos`}
          >
            <div className="grid gap-1 sm:grid-cols-2">
              {groups.find(({ id }) => id === openGroup)?.items.map((item) => (
                <NavigationLink
                  key={item.to + item.label}
                  item={item}
                  active={pathname === item.to}
                  onNavigate={() => setOpenGroup(null)}
                />
              ))}
            </div>
          </div>
        ) : null}
        {navigation.sessionStatus === "loading" || navigation.sessionStatus === "unavailable" ? (
          <div className="flex min-h-14 items-center justify-center gap-2 px-3 pb-[max(env(safe-area-inset-bottom),0.25rem)] pt-1 text-xs text-muted-foreground">
            <span role="status">{statusText}</span>
            {navigation.sessionStatus === "unavailable" && (
              <button className="min-h-11 px-2 font-semibold text-foreground underline" onClick={navigation.retrySession}>Reintentar</button>
            )}
          </div>
        ) : (
          <div className={`mx-auto grid max-w-lg ${isAuthenticated ? "grid-cols-3" : "grid-cols-4"} gap-1 px-2 pb-[max(env(safe-area-inset-bottom),0.25rem)] pt-1`}>
            <Link
              to={homeTo}
              aria-current={activeHome ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg px-2 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${activeHome ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              <Home className="size-5" aria-hidden="true" />
              <span>Inicio</span>
            </Link>
            {groups.map(({ id, label, icon: Icon, items }) => {
              const activeRoute = items.find(({ to }) => pathname === to);
              const isOpen = openGroup === id;
              return (
                <button
                  key={id}
                  ref={(element) => { groupButtonRefs.current[id] = element; }}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={isOpen ? `${id}-menu` : undefined}
                  aria-label={`${label}${activeRoute ? `, página actual: ${activeRoute.label}` : ""}`}
                  onClick={(event) => {
                    if (isOpen) {
                      setOpenGroup(null);
                      return;
                    }
                    setOpenGroup(id);
                    if (event.detail === 0) {
                      window.requestAnimationFrame(() => {
                        document.querySelector<HTMLAnchorElement>(`#${id}-menu a`)?.focus();
                      });
                    }
                  }}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg px-2 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${activeRoute || isOpen ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <span className="flex items-center gap-1">
                    <Icon className="size-5" aria-hidden="true" />
                    <ChevronUp className={`size-3 transition-transform motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                  </span>
                  <span>{isAuthenticated ? "Accesos" : label}</span>
                  {activeRoute ? <span className="sr-only">Página actual en este grupo</span> : null}
                </button>
              );
            })}
            {navigation.sessionStatus === "anonymous" && (
              <Link to="/login" aria-current={pathname === "/login" ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg px-2 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${pathname === "/login" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                <LogIn className="size-5" aria-hidden="true" />
                <span>Login</span>
              </Link>
            )}
            {isAuthenticated && (
              <button type="button" onClick={() => void navigation.logout()} disabled={navigation.logoutPending} className="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg px-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60">
                <LogOut className="size-5" aria-hidden="true" />
                <span>{navigation.logoutPending ? "Saliendo…" : "Logout"}</span>
              </button>
            )}
          </div>
        )}
        {isAuthenticated && navigation.logoutError && (
          <p role="alert" className="px-3 pb-1 text-center text-xs text-destructive">{navigation.logoutError}</p>
        )}
        {isAuthenticated && navigation.summaryError && (
          <div className="flex items-center justify-center gap-2 px-2 pb-1 text-xs text-muted-foreground" role="status">
            <span>No se cargaron las acciones EFA.</span>
            <button className="min-h-11 px-1 font-semibold text-foreground underline" onClick={navigation.retrySummary}>Reintentar</button>
          </div>
        )}
      </nav>
    </>
  );
}
