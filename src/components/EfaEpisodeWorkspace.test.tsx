import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  EfaEpisodeWorkspace,
  planEpisodeWorkspaceSelection,
  selectGuardWorkspaceEpisodes,
  toggleEfaWorkspaceCollapsed,
} from "./EfaEpisodeWorkspace";

describe("EfaEpisodeWorkspace", () => {
  it("toggles the mounted workspace content without changing workspace selection", () => {
    expect(toggleEfaWorkspaceCollapsed(false)).toBe(true);
    expect(toggleEfaWorkspaceCollapsed(true)).toBe(false);
  });

  it("renders a focused, accessible workspace for the selected service", () => {
    const html = renderToStaticMarkup(
      <EfaEpisodeWorkspace
        episodeLabel="Atención del 6 de octubre"
        activeSection="communications"
        onSelectSection={() => {}}
      >
        <p>Contenido de la sección activa</p>
      </EfaEpisodeWorkspace>,
    );

    // The "Área de trabajo" row (title + collapse toggle) is commented out for now, so the
    // service label and the collapse control are not rendered until it returns.
    expect(html).toContain('aria-label="Secciones del servicio"');
    expect(html).toContain('role="tablist"');
    expect(html).not.toContain("Contraer área de trabajo");
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain("Llamadas");
    expect(html).toContain("Despachos");
    expect(html).toContain("Apoyo policial");
    expect(html).toContain("Conductas");
    expect(html).toContain("grid min-w-0 grid-cols-2");
    expect(html).toContain("whitespace-normal break-words");
    expect(html).toContain("h-auto min-h-11");
    expect(html).toContain('<span class="min-w-0 break-words">Apoyo policial</span>');
    expect(html).not.toContain("overflow-x-auto");
    expect(html).toContain("Contenido de la sección activa");
  });

  it("keeps tab, panel and collapse IDs unique across simultaneously mounted services", () => {
    const html = renderToStaticMarkup(
      <div>
        <EfaEpisodeWorkspace
          episodeLabel="Servicio Norte"
          activeSection="communications"
          onSelectSection={() => {}}
        >
          <p>Contenido Norte</p>
        </EfaEpisodeWorkspace>
        <EfaEpisodeWorkspace
          episodeLabel="Servicio Sur"
          activeSection="dispatches"
          onSelectSection={() => {}}
        >
          <p>Contenido Sur</p>
        </EfaEpisodeWorkspace>
      </div>,
    );
    const ids = Array.from(html.matchAll(/\sid="([^"]+)"/g), (match) => match[1]!);
    const contentIds = ids.filter((id) => id.startsWith("efa-workspace-content-"));
    const panelIds = ids.filter((id) => id.startsWith("efa-workspace-panel-"));
    const tabIds = ids.filter((id) => id.startsWith("efa-workspace-tab-"));
    const tabPanelControls = Array.from(
      html.matchAll(/aria-controls="(efa-workspace-panel-[^"]+)"/g),
      (match) => match[1]!,
    );
    const labelledTabs = Array.from(
      html.matchAll(/aria-labelledby="(efa-workspace-tab-[^"]+)"/g),
      (match) => match[1]!,
    );

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(contentIds).size).toBe(2);
    expect(new Set(panelIds).size).toBe(2);
    expect(new Set(tabIds).size).toBe(8);
    expect(new Set(tabPanelControls)).toEqual(new Set(panelIds));
    expect(labelledTabs.every((id) => tabIds.includes(id))).toBe(true);
    expect(panelIds.map((id) => tabPanelControls.filter((ref) => ref === id).length)).toEqual([
      4, 4,
    ]);
  });

  it("shows only current-guard services, active first and newest first within each state", () => {
    const selected = selectGuardWorkspaceEpisodes(
      [
        { id: "old", originGuardId: "guard-a", state: "draft", eventAt: "2026-01-01T00:00:00Z" },
        {
          id: "closed",
          originGuardId: "guard-a",
          state: "closed",
          eventAt: "2026-12-01T00:00:00Z",
        },
        { id: "new", originGuardId: "guard-a", state: "draft", eventAt: "2026-10-01T00:00:00Z" },
        {
          id: "foreign",
          originGuardId: "guard-b",
          state: "draft",
          eventAt: "2026-12-02T00:00:00Z",
        },
      ],
      "guard-a",
    );
    expect(selected.map((episode) => episode.id)).toEqual(["new", "old", "closed"]);
    expect(selectGuardWorkspaceEpisodes([], null)).toEqual([]);
  });

  it("preserves visited sections and requires confirmation before changing services", () => {
    const initial = {
      episodeId: "episode-a",
      section: "communications" as const,
      visited: new Set(["communications" as const]),
      requiresDiscardConfirmation: false,
    };
    const nextSection = planEpisodeWorkspaceSelection(initial, "episode-a", "dispatches");
    expect(nextSection.requiresDiscardConfirmation).toBe(false);
    expect([...nextSection.visited]).toEqual(["communications", "dispatches"]);

    const nextEpisode = planEpisodeWorkspaceSelection(nextSection, "episode-b", "police");
    expect(nextEpisode.requiresDiscardConfirmation).toBe(true);
    expect([...nextEpisode.visited]).toEqual(["police"]);
  });
});
