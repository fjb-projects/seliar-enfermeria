import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  DispatchActionsMenu,
  DispatchSwitcher,
  shouldShowDispatchSwitcher,
} from "@/components/EfaDispatchStepper";

describe("shouldShowDispatchSwitcher", () => {
  it("hides the switcher for none and for a single open dispatch", () => {
    expect(shouldShowDispatchSwitcher(0, false)).toBe(false);
    expect(shouldShowDispatchSwitcher(1, true)).toBe(false);
  });

  it("shows a way into a single dispatch that is not open, and chips for several", () => {
    expect(shouldShowDispatchSwitcher(1, false)).toBe(true);
    expect(shouldShowDispatchSwitcher(2, true)).toBe(true);
  });
});

describe("DispatchSwitcher", () => {
  const rows = [
    {
      id: "a",
      state: "draft" as const,
      priority: "red",
      baseName: "Base Norte",
      t0At: "2026-11-14T09:15:00.000Z",
      createdAt: "2026-11-14T09:13:00.000Z",
    },
    {
      id: "b",
      state: "finalized" as const,
      priority: "",
      baseName: "Base Sur",
      t0At: null,
      createdAt: "2026-11-14T09:20:00.000Z",
    },
    {
      id: "c",
      state: "cancelled" as const,
      priority: "green",
      baseName: "Base Este",
      t0At: null,
      createdAt: "2026-11-14T09:30:00.000Z",
    },
  ];

  it("numbers dispatches in order and marks only the open one as pressed", () => {
    const html = renderToStaticMarkup(
      <DispatchSwitcher rows={rows} selectedId="b" disabled={false} onSelect={vi.fn()} />,
    );
    expect(html).toContain("Despacho 1");
    expect(html).toContain("Despacho 3");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(2);
  });

  it("keeps priority and state readable without color and never prints identifiers", () => {
    const html = renderToStaticMarkup(
      <DispatchSwitcher rows={rows} selectedId={null} disabled={false} onSelect={vi.fn()} />,
    );
    expect(html).toContain(">R<");
    expect(html).toContain(">?<");
    expect(html).toContain("Base Norte");
    expect(html).toContain("sin hora");
    expect(html).toContain("Anulado");
    expect(html).toContain('aria-label="Despacho 2. Base Sur, Finalizado"');
    expect(html).not.toContain("ID ");
    expect(html).not.toContain('"a"');
  });

  it("disables every chip while an operation is in flight", () => {
    const html = renderToStaticMarkup(
      <DispatchSwitcher rows={rows} selectedId="a" disabled onSelect={vi.fn()} />,
    );
    expect(html.match(/disabled=""/g)).toHaveLength(3);
  });
});

describe("DispatchActionsMenu", () => {
  it("renders one labelled trigger and keeps its actions closed", () => {
    const html = renderToStaticMarkup(
      <DispatchActionsMenu
        historyOpen={false}
        onToggleHistory={vi.fn()}
        lifecycle={{
          label: "Anular despacho",
          destructive: true,
          disabled: false,
          onSelect: vi.fn(),
        }}
      />,
    );
    expect(html).toContain('aria-label="Más acciones del despacho"');
    expect(html).not.toContain("Anular despacho");
    expect(html).not.toContain("Ver historial");
  });
});
