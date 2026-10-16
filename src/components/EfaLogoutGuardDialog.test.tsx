import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { EfaLogoutGuardDialog } from "./EfaLogoutGuardDialog";

// Radix portals render nothing on the server, so the primitives are replaced by plain markup.
vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div role="alertdialog">{children}</div> : null,
  AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  AlertDialogCancel: ({ children, ...props }: ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
}));

function render(overrides: Partial<ComponentProps<typeof EfaLogoutGuardDialog>> = {}) {
  return renderToStaticMarkup(
    <EfaLogoutGuardDialog
      open
      startedAt="2026-10-16T11:09:00.000Z"
      canEndGuard
      pending={false}
      error=""
      onCancel={vi.fn()}
      onEndAndLogout={vi.fn()}
      onLogout={vi.fn()}
      {...overrides}
    />,
  );
}

describe("EfaLogoutGuardDialog", () => {
  it("offers ending, leaving without ending, and cancelling", () => {
    const html = render();
    expect(html).toContain("Tenés una guardia en curso");
    expect(html).toContain("La guardia iniciada a las 08:09 sigue abierta si salís ahora.");
    expect(html).toContain("Terminar guardia y salir");
    expect(html).toContain("Salir sin terminar");
    expect(html).toContain("Cancelar");
  });

  it("does not offer ending on pages that gate closing themselves", () => {
    const html = render({ canEndGuard: false });
    expect(html).not.toContain("Terminar guardia y salir");
    expect(html).toContain("usá el botón Terminar guardia de esta pantalla");
    expect(html).toContain("Salir sin terminar");
  });

  it("shows the end error and disables actions while pending", () => {
    const html = render({ pending: true, error: "La guardia cambió, intentá de nuevo." });
    expect(html).toContain('role="alert"');
    expect(html).toContain("La guardia cambió, intentá de nuevo.");
    expect(html).toContain("Terminando…");
    expect(html.match(/disabled=""/g)).toHaveLength(3);
  });

  it("renders nothing when closed", () => {
    expect(render({ open: false })).toBe("");
    expect(render({ startedAt: null })).toBe("");
  });
});
