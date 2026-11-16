import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  CommunicationCallSwitcher,
  shouldShowCallSwitcher,
} from "@/components/EfaCommunicationStepper";
import type { EfaCommunicationView } from "@/lib/efa-communications.server";

const call = (overrides: Partial<EfaCommunicationView>) =>
  ({
    id: "call-1",
    direction: "incoming",
    state: "draft",
    priority: "red",
    startedAt: "2026-11-14T09:15:00.000Z",
    endedAt: null,
    createdAt: "2026-11-14T09:13:37.000Z",
    canEdit: true,
    ...overrides,
  }) as unknown as EfaCommunicationView;

describe("shouldShowCallSwitcher", () => {
  it("hides the switcher for a single open call and for none", () => {
    expect(shouldShowCallSwitcher(0, false)).toBe(false);
    expect(shouldShowCallSwitcher(1, true)).toBe(false);
  });

  it("offers a way into a single call that is not open yet, and chips for several", () => {
    expect(shouldShowCallSwitcher(1, false)).toBe(true);
    expect(shouldShowCallSwitcher(2, true)).toBe(true);
    expect(shouldShowCallSwitcher(3, false)).toBe(true);
  });
});

describe("CommunicationCallSwitcher", () => {
  const calls = [
    call({ id: "a", priority: "red" }),
    call({ id: "b", priority: null, startedAt: null, state: "finalized" }),
  ];

  it("numbers calls in order and marks only the open one as pressed", () => {
    const html = renderToStaticMarkup(
      <CommunicationCallSwitcher
        calls={calls}
        selectedId="b"
        disabled={false}
        onSelect={vi.fn()}
      />,
    );
    expect(html).toContain("Llamada 1");
    expect(html).toContain("Llamada 2");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(1);
    expect(html).toMatch(
      /aria-label="Llamada 2\.[^"]*"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*aria-label="Llamada 2\./,
    );
  });

  it("keeps priority readable without color and shows when a call has no start time", () => {
    const html = renderToStaticMarkup(
      <CommunicationCallSwitcher
        calls={calls}
        selectedId={null}
        disabled={false}
        onSelect={vi.fn()}
      />,
    );
    expect(html).toContain('data-priority="red"');
    expect(html).toContain('data-priority="unknown"');
    expect(html).toContain(">R<");
    expect(html).toContain(">?<");
    expect(html).toContain("sin hora");
    expect(html).toContain("Sin prioridad");
  });

  it("disables every chip while an operation is in flight", () => {
    const html = renderToStaticMarkup(
      <CommunicationCallSwitcher calls={calls} selectedId="a" disabled onSelect={vi.fn()} />,
    );
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
});
