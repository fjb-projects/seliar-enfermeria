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

    expect(html).toContain("Atención del 6 de octubre");
    expect(html).toContain('aria-label="Secciones del servicio"');
    expect(html).toContain('aria-label="Área de trabajo del servicio Atención del 6 de octubre"');
    expect(html).toContain('aria-label="Contraer área de trabajo"');
    expect(html).toContain('aria-controls="efa-workspace-content"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Llamadas");
    expect(html).toContain("Despachos");
    expect(html).toContain("Coordinación");
    expect(html).toContain("Conductas");
    expect(html).toContain("grid min-w-0 grid-cols-2");
    expect(html).toContain("whitespace-normal break-words");
    expect(html).toContain("h-auto min-h-11");
    expect(html).toContain('<span class="min-w-0 break-words">Coordinación</span>');
    expect(html).not.toContain("overflow-x-auto");
    expect(html).toContain("Contenido de la sección activa");
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
