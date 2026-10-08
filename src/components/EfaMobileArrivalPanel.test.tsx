import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  EfaMobileArrivalPanel,
  createSecureOperationId,
  getStableArrivalOperation,
  parseLocalArrivalTimestamp,
  setBusyArrivalOperation,
  type MobileArrivalView,
} from "./EfaMobileArrivalPanel";

vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => vi.fn(async () => []),
}));
vi.mock("@/lib/efa-mobile-arrivals.functions", () => ({
  createEfaMobileArrival: vi.fn(),
  deleteEfaMobileArrival: vi.fn(),
  updateEfaMobileArrival: vi.fn(),
}));

const base = { id: "base-a", name: "Central", isActive: true };

describe("EfaMobileArrivalPanel", () => {
  it("offers one-tap registration for each role on a selected mobile", () => {
    const html = renderToStaticMarkup(
      <EfaMobileArrivalPanel
        guardId="guard-a"
        bases={[base]}
        arrivals={[]}
        canWrite
        onArrivalsChange={vi.fn()}
      />,
    );

    expect(html).toContain("Central");
    expect(html.match(/Registrar ingreso/g)).toHaveLength(3);
    expect(html).toContain("Enfermería");
    expect(html).toContain("Conducción");
    expect(html).toContain("Medicina");
    expect(html).toContain("min-h-11");
  });

  it("shows saved time with edit and delete actions only when the server permits changes", () => {
    const arrival: MobileArrivalView = {
      id: "arrival-a",
      guardId: "guard-a",
      baseId: "base-a",
      baseNameSnapshot: "Central",
      role: "nurse",
      arrivedAt: "2026-10-07T12:00:00.000Z",
      deletedAt: null,
      version: 1,
      canEdit: false,
    };
    const html = renderToStaticMarkup(
      <EfaMobileArrivalPanel
        guardId="guard-a"
        bases={[]}
        arrivals={[arrival]}
        canWrite
        onArrivalsChange={vi.fn()}
      />,
    );

    expect(html).toContain("Ingresos históricos");
    expect(html).toContain("Central · Enfermería");
    expect(html).toContain("2026-10-07T12:00:00.000Z");
    expect(html).not.toContain("Editar");
    expect(html).not.toContain("Eliminar");
    expect(html).not.toContain("Registrar ingreso");
  });

  it("reuses the same operation identity for an unchanged retry payload", () => {
    let nextId = 0;
    const pending = new Map();
    const createId = () => `operation-${++nextId}`;
    const payload = { guardId: "guard-a", baseId: "base-a", role: "nurse" };

    const first = getStableArrivalOperation(pending, "create:base-a:nurse", payload, createId);
    const retry = getStableArrivalOperation(pending, "create:base-a:nurse", payload, createId);
    const changed = getStableArrivalOperation(
      pending,
      "create:base-a:nurse",
      { ...payload, role: "doctor" },
      createId,
    );

    expect(retry).toBe(first);
    expect(changed).not.toBe(first);
  });

  it("uses secure random bytes when randomUUID is unavailable", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.fill(0);
      return bytes;
    });

    expect(createSecureOperationId({ getRandomValues } as unknown as Crypto)).toBe(
      "00000000-0000-4000-8000-000000000000",
    );
    expect(getRandomValues).toHaveBeenCalledOnce();
  });

  it("fails closed when secure randomness is unavailable", () => {
    expect(() => createSecureOperationId({} as Crypto)).toThrow(/secure random/i);
  });

  it("rejects invalid local datetimes instead of allowing date normalization", () => {
    expect(parseLocalArrivalTimestamp("2026-02-31T09:30")).toBeNull();
    expect(parseLocalArrivalTimestamp("not-a-date")).toBeNull();
  });

  it("keeps each row busy state independent while another operation completes", () => {
    let busy = new Set<string>();
    busy = setBusyArrivalOperation(busy, "row-a", true);
    busy = setBusyArrivalOperation(busy, "row-b", true);
    busy = setBusyArrivalOperation(busy, "row-a", false);

    expect([...busy]).toEqual(["row-b"]);
  });
});
