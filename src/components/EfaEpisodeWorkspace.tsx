import type { ReactNode } from "react";
import { useEffect, useId, useReducer, useRef } from "react";
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
  },
  {
    id: "dispatches",
    label: "Despachos",
    Icon: Ambulance,
  },
  {
    id: "police",
    label: "Apoyo policial",
    Icon: Shield,
  },
  {
    id: "observations",
    label: "Conductas",
    Icon: ClipboardCheck,
  },
] satisfies Array<{
  id: EfaEpisodeWorkspaceSection;
  label: string;
  Icon: typeof Phone;
}>;

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
  const idSuffix = useId().replaceAll(":", "");
  const contentId = "efa-workspace-content-" + idSuffix;
  const panelId = "efa-workspace-panel-" + idSuffix;
  const tabIdFor = (section: EfaEpisodeWorkspaceSection) =>
    "efa-workspace-tab-" + section + "-" + idSuffix;
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
    <section className="min-w-0 space-y-2 sm:space-y-3">
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
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 min-w-11 shrink-0 border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900"
          aria-label={`${collapsed ? "Expandir" : "Contraer"} área de trabajo`}
          aria-expanded={!collapsed}
          aria-controls={contentId}
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
        id={contentId}
        hidden={collapsed}
        inert={collapsed}
        aria-hidden={collapsed}
        className="min-w-0 space-y-2 sm:space-y-3"
      >
        <nav
          role="tablist"
          aria-label="Secciones del servicio"
          className="sticky z-30 grid min-w-0 grid-cols-2 gap-2 bg-background py-2"
          style={{ top: "var(--workflow-header-height, 0px)" }}
        >
          {sections.map((section) => (
            <Button
              key={section.id}
              type="button"
              variant="outline"
              role="tab"
              id={tabIdFor(section.id)}
              aria-selected={activeSection === section.id}
              aria-controls={panelId}
              tabIndex={activeSection === section.id ? 0 : -1}
              className={`h-auto min-h-11 w-full min-w-0 justify-start whitespace-normal break-words border px-2 text-left ${activeSection === section.id ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90" : "border-border bg-background text-foreground hover:bg-muted"}`}
              onClick={() => onSelectSection(section.id)}
              onKeyDown={(event) => {
                const direction =
                  event.key === "ArrowRight" || event.key === "ArrowDown"
                    ? 1
                    : event.key === "ArrowLeft" || event.key === "ArrowUp"
                      ? -1
                      : 0;
                if (!direction) return;
                event.preventDefault();
                const currentIndex = sections.findIndex((item) => item.id === section.id);
                const nextIndex = (currentIndex + direction + sections.length) % sections.length;
                const nextSection = sections[nextIndex]!.id;
                document.getElementById(tabIdFor(nextSection))?.focus();
                onSelectSection(nextSection);
              }}
            >
              <section.Icon aria-hidden="true" className="size-4 shrink-0" />
              <span className="min-w-0 break-words">{section.label}</span>
            </Button>
          ))}
        </nav>
        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={tabIdFor(activeSection)}
          tabIndex={0}
          className="min-w-0"
        >
          {children}
        </div>
      </div>
    </section>
  );
}
