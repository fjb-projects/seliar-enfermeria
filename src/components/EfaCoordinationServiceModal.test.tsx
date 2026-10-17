import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { EfaOversightEpisodeView } from "@/lib/efa-guard-oversight.functions";
import {
  EfaCoordinationServiceDialog,
  EfaCoordinationServiceModal,
  serviceTitle,
  toSummaryEpisode,
} from "./EfaCoordinationServiceModal";

// Radix portals render nothing on the server, so the primitives are replaced by plain markup.
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open?: boolean; children: ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogClose: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
// The summary fetches on mount; here it only needs to prove it receives the right episode.
vi.mock("@/components/EfaEpisodeSummary", () => ({
  EfaEpisodeSummary: ({ episode }: { episode: Record<string, unknown> }) => (
    <div data-testid="summary" data-episode={JSON.stringify(episode)} />
  ),
}));

const episode: EfaOversightEpisodeView = {
  id: "episode-1",
  originGuardId: "g-open",
  eventAt: new Date("2026-10-09T12:15:00.000Z"),
  motive: "Dolor torácico",
  address: "Calle 1 234",
  interventionNumber: "A-77",
  state: "closed",
  closedAt: new Date("2026-10-09T13:00:00.000Z"),
  cancelledAt: null,
  cancelledFromState: null,
  updatedAt: new Date("2026-10-09T13:05:00.000Z"),
  dispatches: [],
};

function renderDialog(
  overrides: Partial<ComponentProps<typeof EfaCoordinationServiceDialog>> = {},
) {
  return renderToStaticMarkup(
    <EfaCoordinationServiceDialog
      episode={episode}
      ownerName="Ana Pérez"
      open
      onOpenChange={vi.fn()}
      {...overrides}
    />,
  );
}

describe("coordination service modal", () => {
  it("offers the CTA with an accessible name that identifies the service", () => {
    const html = renderToStaticMarkup(
      <EfaCoordinationServiceModal episode={episode} ownerName="Ana Pérez" />,
    );

    expect(html).toContain("Ver servicio completo");
    expect(html).toContain('aria-label="Ver servicio completo: 09/10/2026 09:15 · Dolor torácico"');
    expect(html).toContain("min-h-11");
    expect(html).toContain("md:min-h-9");
    // Closed by default: the summary (and its fetches) must not mount.
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('data-testid="summary"');
  });

  it("identifies a service by motive, then intervention number, then a fallback", () => {
    expect(serviceTitle(episode)).toBe("09/10/2026 09:15 · Dolor torácico");
    expect(serviceTitle({ ...episode, motive: null })).toBe("09/10/2026 09:15 · Intervención A-77");
    expect(serviceTitle({ ...episode, motive: " ", interventionNumber: null })).toBe(
      "09/10/2026 09:15 · Sin motivo registrado",
    );
  });

  it("shows the summary of the selected service with its owner when open", () => {
    const html = renderDialog();

    expect(html).toContain('role="dialog"');
    expect(html).toContain("09/10/2026 09:15 · Dolor torácico");
    expect(html).toContain("Servicio de Ana Pérez");
    expect(html).toContain('data-testid="summary"');
    expect(html).toContain("Cerrar");
    expect(html).toContain("overflow-y-auto");
    expect(html).toContain("max-w-3xl");
  });

  it("renders nothing while closed", () => {
    expect(renderDialog({ open: false })).toBe("");
  });

  it("hands the summary ISO strings whether the record carries Dates or strings", () => {
    const fromDates = toSummaryEpisode(episode);
    expect(fromDates).toEqual({
      id: "episode-1",
      eventAt: "2026-10-09T12:15:00.000Z",
      motive: "Dolor torácico",
      address: "Calle 1 234",
      interventionNumber: "A-77",
      state: "closed",
      closedAt: "2026-10-09T13:00:00.000Z",
      cancelledAt: null,
      cancelledFromState: null,
      updatedAt: "2026-10-09T13:05:00.000Z",
    });

    // After server-function serialization the Dates arrive as strings.
    const serialized = JSON.parse(JSON.stringify(episode)) as EfaOversightEpisodeView;
    expect(toSummaryEpisode(serialized)).toEqual(fromDates);

    const cancelledEpisode = {
      ...episode,
      cancelledAt: new Date("2026-10-09T14:00:00.000Z"),
      cancelledFromState: "closed" as const,
    };
    expect(toSummaryEpisode(cancelledEpisode)).toMatchObject({
      cancelledAt: "2026-10-09T14:00:00.000Z",
      cancelledFromState: "closed",
    });
    // The dialog feeds the summary the mapped episode (the mock echoes its props as JSON).
    expect(renderDialog({ episode: cancelledEpisode })).toContain(
      "&quot;cancelledAt&quot;:&quot;2026-10-09T14:00:00.000Z&quot;",
    );
  });
});
