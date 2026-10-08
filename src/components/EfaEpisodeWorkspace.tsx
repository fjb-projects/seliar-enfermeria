import type { ReactNode } from "react";
import { useEffect, useReducer, useRef } from "react";
import { Ambulance, ChevronDown, ChevronUp, ClipboardCheck, Phone, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export type EfaEpisodeWorkspaceSection =
  "communications" | "dispatches" | "police" | "observations";
export type EfaEpisodeWorkspaceSelection = {
  episodeId: string | null;
  section: EfaEpisodeWorkspaceSection;
  visited: Set<EfaEpisodeWorkspaceSection>;
  requiresDiscardConfirmation: boolean;
};

export function toggleEfaWorkspaceCollapsed(collapsed: boolean): boolean {
  return !collapsed;
}

export function planEpisodeWorkspaceSelection(
  current: EfaEpisodeWorkspaceSelection,
  episodeId: string,
  section: EfaEpisodeWorkspaceSection,
): EfaEpisodeWorkspaceSelection {
  const changingEpisode = current.episodeId !== null && current.episodeId !== episodeId;
  return {
    episodeId,
    section,
    visited: changingEpisode ? new Set([section]) : new Set(current.visited).add(section),
    requiresDiscardConfirmation: changingEpisode,
  };
}

const sections = [
  {
    id: "communications",
    label: "Llamadas",
    Icon: Phone,
    style:
      "bg-sky-50 text-sky-900 border-sky-200 dark:bg-sky-950/40 dark:text-sky-100 dark:border-sky-800",
  },
  {
    id: "dispatches",
    label: "Despachos",
    Icon: Ambulance,
    style:
      "bg-amber-50 text-amber-950 border-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-800",
  },
  {
    id: "police",
    label: "Coordinación",
    Icon: Shield,
    style:
      "bg-violet-50 text-violet-950 border-violet-200 dark:bg-violet-950/40 dark:text-violet-100 dark:border-violet-800",
  },
  {
    id: "observations",
    label: "Conductas",
    Icon: ClipboardCheck,
    style:
      "bg-emerald-50 text-emerald-950 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100 dark:border-emerald-800",
  },
] satisfies Array<{
  id: EfaEpisodeWorkspaceSection;
  label: string;
  Icon: typeof Phone;
  style: string;
}>;

const sectionSurfaces: Record<EfaEpisodeWorkspaceSection, string> = {
  communications: "border-sky-200 bg-sky-50/50 dark:border-sky-900 dark:bg-sky-950/20",
  dispatches: "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20",
  police: "border-violet-200 bg-violet-50/50 dark:border-violet-900 dark:bg-violet-950/20",
  observations:
    "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20",
};

export type WorkspaceEpisode = {
  id: string;
  originGuardId: string;
  state: "draft" | "closed";
  eventAt: Date | string;
};

export function selectGuardWorkspaceEpisodes<T extends WorkspaceEpisode>(
  episodes: T[],
  activeGuardId: string | null,
): T[] {
  if (!activeGuardId) return [];
  return episodes
    .filter((episode) => episode.originGuardId === activeGuardId)
    .sort((left, right) => {
      if (left.state !== right.state) return left.state === "draft" ? -1 : 1;
      const byEventDate = new Date(right.eventAt).getTime() - new Date(left.eventAt).getTime();
      return byEventDate || left.id.localeCompare(right.id);
    });
}

export function EfaEpisodeWorkspace({
  episodeLabel,
  activeSection,
  onSelectSection,
  children,
}: {
  episodeLabel: string;
  activeSection: EfaEpisodeWorkspaceSection;
  onSelectSection: (section: EfaEpisodeWorkspaceSection) => void;
  children: ReactNode;
}) {
  const [collapsed, toggleCollapsed] = useReducer(
    (value: boolean) => toggleEfaWorkspaceCollapsed(value),
    false,
  );
  const contentRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const heading = headingRef.current;
    if (!heading) return;
    heading.focus({ preventScroll: true });
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    heading.scrollIntoView?.({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest" });
  }, []);
  return (
    <section className="space-y-3">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h4
            ref={headingRef}
            tabIndex={-1}
            aria-label={`Área de trabajo del servicio ${episodeLabel}`}
            className="font-semibold focus:outline-none"
          >
            Área de trabajo
          </h4>
          <p className="text-sm text-muted-foreground">Registros vinculados al servicio actual.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 min-w-11 shrink-0 border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900"
          aria-label={`${collapsed ? "Expandir" : "Contraer"} área de trabajo`}
          aria-expanded={!collapsed}
          aria-controls="efa-workspace-content"
          onClick={() => {
            if (!collapsed && contentRef.current?.contains(document.activeElement)) {
              (document.activeElement as HTMLElement).blur();
            }
            toggleCollapsed();
          }}
        >
          {collapsed ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
        </Button>
      </header>
      <div
        ref={contentRef}
        id="efa-workspace-content"
        hidden={collapsed}
        inert={collapsed}
        aria-hidden={collapsed}
        className="space-y-3"
      >
        <nav
          aria-label="Secciones del servicio"
          className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap"
        >
          {sections.map((section) => (
            <Button
              key={section.id}
              type="button"
              variant="outline"
              className={`h-auto min-h-11 w-full min-w-0 justify-start whitespace-normal break-words border px-2 text-left sm:w-auto sm:px-3 ${section.style} ${activeSection === section.id ? "ring-2 ring-primary ring-offset-1" : "opacity-80"}`}
              aria-pressed={activeSection === section.id}
              onClick={() => onSelectSection(section.id)}
            >
              <section.Icon aria-hidden="true" className="size-4 shrink-0" />
              <span className="min-w-0 break-words">{section.label}</span>
            </Button>
          ))}
        </nav>
        <div className={`border-l-2 pl-2 ${sectionSurfaces[activeSection]}`}>{children}</div>
      </div>
    </section>
  );
}
