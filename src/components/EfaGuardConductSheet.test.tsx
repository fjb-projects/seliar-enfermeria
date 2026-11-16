import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Sheet } from "@/components/ui/sheet";
import {
  EfaGuardConductAction,
  EfaGuardConductSheetHeader,
  GUARD_CONDUCT_DESCRIPTION,
  GUARD_CONDUCT_TITLE,
} from "./EfaGuardConductSheet";

vi.mock("@tanstack/react-start", () => ({
  createClientOnlyFn: (fn: () => unknown) => fn,
  useServerFn: () => vi.fn(async () => []),
}));
vi.mock("@/lib/efa-observations.functions", () => ({
  createEfaObservation: vi.fn(),
  getEfaObservation: vi.fn(),
  getEfaObservationCatalog: vi.fn(),
  getEfaObservationHistory: vi.fn(),
  listEfaObservationNotices: vi.fn(),
  listEfaObservationsForEpisode: vi.fn(),
  listEfaObservationsForGuard: vi.fn(),
  markEfaObservationNoticeRead: vi.fn(),
  updateEfaObservation: vi.fn(),
}));
vi.mock("@/lib/efa-episodes.functions", () => ({ listEfaEpisodes: vi.fn() }));
vi.mock("@/lib/efa-communications.functions", () => ({ listEfaCommunicationsForEpisode: vi.fn() }));
vi.mock("@/lib/efa-dispatches.functions", () => ({ listEfaDispatchesForEpisode: vi.fn() }));
vi.mock("@/lib/efa-police-coordination.functions", () => ({
  getEfaPoliceCoordination: vi.fn(),
  listEfaPoliceCoordinationsForEpisode: vi.fn(),
}));
vi.mock("@/lib/efa-guards.functions", () => ({
  listActiveEfaGuardBases: vi.fn(),
  listEfaGuards: vi.fn(),
}));

describe("EfaGuardConductSheet", () => {
  it("titles the sheet and explains that the conduct has no associated service", () => {
    expect(GUARD_CONDUCT_TITLE).toBe("Registrar conducta");
    expect(GUARD_CONDUCT_DESCRIPTION).toBe(
      "Sin servicio asociado: problemas u oportunidades de mejora que observes en la guardia.",
    );
    const html = renderToStaticMarkup(
      <Sheet open>
        <EfaGuardConductSheetHeader />
      </Sheet>,
    );
    expect(html).toContain(GUARD_CONDUCT_TITLE);
    expect(html).toContain(GUARD_CONDUCT_DESCRIPTION);
  });

  it("renders the button trigger with its helper and keeps the form unmounted while closed", () => {
    const html = renderToStaticMarkup(
      <EfaGuardConductAction
        guardId="guard-1"
        currentUserId="user-1"
        isAdmin={false}
        appearance="button"
      />,
    );
    const helperId = html.match(/<p id="([^"]+)"[^>]*>Sin servicio asociado/)?.[1];
    expect(helperId).toBeTruthy();
    expect(html).toContain(`aria-describedby="${helperId}"`);
    expect(html).toContain(">Registrar conducta<");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain("Cargando catálogo e historial");
  });

  it("renders the link trigger with its own label", () => {
    const html = renderToStaticMarkup(
      <EfaGuardConductAction
        guardId="guard-1"
        currentUserId="user-1"
        isAdmin={false}
        appearance="link"
        label="Registrar conducta sin servicio"
      />,
    );
    expect(html).toContain(">Registrar conducta sin servicio<");
    expect(html).toContain("underline-offset-4");
    expect(html).not.toContain("<p id=");
  });
});
