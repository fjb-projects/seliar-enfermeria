import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FARMACOLOGICOS, DESCARTABLES, VIA_AEREA, EQUIPAMIENTOS_VARIOS } from "@/lib/registro-data";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Route } from "./control-guardia";

const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  dependencies: [] as Array<readonly unknown[] | undefined>,
  pending: [] as Array<() => void>,
  stateIndex: 0,
  effectIndex: 0,
  changed: false,
}));
const send = vi.hoisted(() => vi.fn());

// Exercise route handlers and persistence without adding a DOM test dependency.
// Radix owns DOM focus/portal behavior; these tests exercise its controlled API.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = hooks.stateIndex++;
    if (!(index in hooks.states)) hooks.states[index] = initial;
    return [
      hooks.states[index],
      (next: unknown) => {
        const value = typeof next === "function" ? next(hooks.states[index]) : next;
        if (!Object.is(value, hooks.states[index])) hooks.changed = true;
        hooks.states[index] = value;
      },
    ];
  },
  useMemo: (factory: () => unknown) => factory(),
  useEffect: (effect: () => void, dependencies: readonly unknown[]) => {
    const index = hooks.effectIndex++;
    const previous = hooks.dependencies[index];
    if (!previous || dependencies.some((value, i) => !Object.is(value, previous[i]))) {
      hooks.dependencies[index] = dependencies;
      hooks.pending.push(effect);
    }
  },
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => send }));
vi.mock("@/lib/registro.functions", () => ({ enviarRegistro: vi.fn() }));

const STORAGE_KEY = "registro-guardia-seliar-v2";
const HISTORY_KEY = "registro-guardia-seliar-emails-v1";
type Element = ReactElement<Record<string, unknown>>;
const component = Route.options.component as () => Element;
let tree: Element;
let storage: Map<string, string>;

function render() {
  for (let pass = 0; pass < 20; pass++) {
    hooks.stateIndex = 0;
    hooks.effectIndex = 0;
    hooks.changed = false;
    tree = component();
    hooks.pending.splice(0).forEach((effect) => effect());
    if (!hooks.changed) return;
  }
  throw new Error("Route did not settle");
}

function elements(node: ReactNode = tree): Element[] {
  const result: Element[] = [];
  Children.forEach(node, (child) => {
    if (!isValidElement<Record<string, unknown>>(child)) return;
    result.push(child);
    if (child.props["children"] !== undefined) {
      result.push(...elements(child.props["children"] as ReactNode));
    }
  });
  return result;
}

function find(type: unknown) {
  const element = elements().find((node) => node.type === type);
  expect(element, `Expected ${String(type)} in route`).toBeDefined();
  return element!;
}

function text(element: Element): string {
  return Children.toArray(element.props["children"] as ReactNode)
    .map((child) => (typeof child === "string" ? child : ""))
    .join("");
}

function discardButton() {
  return elements().find((node) => node.type === "button" && text(node) === "Descartar borrador");
}

function changeDialog(open: boolean) {
  (find(AlertDialog).props["onOpenChange"] as (open: boolean) => void)(open);
  render();
}

function attachments() {
  const element = elements().find((node) => "adjuntos" in node.props);
  expect(element).toBeDefined();
  return element!;
}

function seedDraft() {
  storage.set(
    STORAGE_KEY,
    JSON.stringify({
      datos: {
        guardia: {
          email: "nurse@example.com",
          fecha: "2026-10-24",
          turno: "Mañana",
          movilNumero: "7",
          patenteMovil: "AB123CD",
          enfermeroEntrante: "Nurse",
          choferGuardia: "Driver",
          medicoGuardia: "Doctor",
        },
        ...Object.fromEntries(
          [
            ["farmacologicos", FARMACOLOGICOS],
            ["descartables", DESCARTABLES],
            ["viaAerea", VIA_AEREA],
            ["equipamientosVarios", EQUIPAMIENTOS_VARIOS],
          ].map(([key, items]) => [
            key,
            Object.fromEntries(
              (items as typeof FARMACOLOGICOS).map((item) => [item.nombre, ["completo"]]),
            ),
          ]),
        ),
        anotacionesFarmacologicos: { medication: "Broken packaging" },
        observacionesGenerales: "Handover notes",
        intervencionesCantidad: "1",
        enfermeroRecibe: "Receiving nurse",
        confirmaciones: ["checked"],
      },
      emailRequested: true,
    }),
  );
  storage.set(HISTORY_KEY, JSON.stringify(["previous@example.com"]));
  storage.set("unrelated-record", "keep");
  render();
  (attachments().props["onCambio"] as (files: File[]) => void)([
    new File(["photo"], "guard.jpg", { type: "image/jpeg" }),
  ]);
  render();
}

beforeEach(() => {
  hooks.states = [];
  hooks.dependencies = [];
  hooks.pending = [];
  storage = new Map();
  send.mockReset();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal("window", { scrollTo: vi.fn() });
});

afterEach(() => vi.unstubAllGlobals());

async function submit() {
  const button = elements().find(
    (node) => node.type === "button" && text(node) === "Enviar registro",
  );
  expect(button).toBeDefined();
  await (button!.props["onClick"] as () => Promise<void>)();
  render();
}

describe("guard handover draft discard", () => {
  it("offers the secondary action above the first section only for a nonempty draft", () => {
    render();
    expect(discardButton()).toBeUndefined();
    (attachments().props["onCambio"] as (files: File[]) => void)([
      new File(["photo"], "guard.jpg", { type: "image/jpeg" }),
    ]);
    render();
    const nodes = elements();
    const firstSection = nodes.findIndex((node) => node.props["id"] === "seccion-0");
    expect(discardButton()).toBeDefined();
    expect(nodes.indexOf(discardButton()!)).toBeLessThan(firstSection);
  });

  it("explains the scope and preserves the full draft and photos when opened or cancelled", () => {
    seedDraft();
    const saved = storage.get(STORAGE_KEY);
    const files = attachments().props["adjuntos"];
    changeDialog(true);
    expect(find(AlertDialog).props["open"]).toBe(true);
    expect(text(find(AlertDialogTitle))).toBe("¿Descartar el borrador actual?");
    const description = text(find(AlertDialogDescription));
    for (const phrase of [
      "datos",
      "selecciones",
      "anotaciones",
      "fotos adjuntas",
      "No se eliminarán registros ya enviados",
      "no se puede deshacer",
    ]) {
      expect(description).toContain(phrase);
    }
    expect(text(find(AlertDialogCancel))).toBe("Cancelar");
    expect(storage.get(STORAGE_KEY)).toBe(saved);
    expect(attachments().props["adjuntos"]).toBe(files);
    changeDialog(false);
    expect(find(AlertDialog).props["open"]).toBe(false);
    expect(storage.get(STORAGE_KEY)).toBe(saved);
    expect(attachments().props["adjuntos"]).toBe(files);
    expect(send).not.toHaveBeenCalled();
  });

  it("clears the current draft and photos only on confirmation, keeping unrelated storage", () => {
    seedDraft();
    const history = storage.get(HISTORY_KEY);
    changeDialog(true);
    (find(AlertDialogAction).props["onClick"] as (event: { preventDefault: () => void }) => void)({
      preventDefault: vi.fn(),
    });
    render();
    expect(storage.has(STORAGE_KEY)).toBe(false);
    expect(attachments().props["adjuntos"]).toEqual([]);
    expect(discardButton()).toBeUndefined();
    expect(elements().find((node) => node.props["id"] === "email")?.props["valor"]).toBe("");
    expect(elements().find((node) => node.props["id"] === "seccion-0")?.props["abierta"]).toBe(
      true,
    );
    expect(find(AlertDialog).props["open"]).toBe(false);
    expect(storage.get(HISTORY_KEY)).toBe(history);
    expect(storage.get("unrelated-record")).toBe("keep");
    expect(send).not.toHaveBeenCalled();
    hooks.states = [];
    hooks.dependencies = [];
    render();
    expect(discardButton()).toBeUndefined();
    expect(attachments().props["adjuntos"]).toEqual([]);
  });

  it("retains autosaving and restoring drafts without requesting a discard", () => {
    seedDraft();
    const saved = storage.get(STORAGE_KEY);
    hooks.states = [];
    hooks.dependencies = [];
    render();
    expect(storage.get(STORAGE_KEY)).toBe(saved);
    expect(elements().find((node) => node.props["id"] === "email")?.props["valor"]).toBe(
      "nurse@example.com",
    );
    expect(attachments().props["adjuntos"]).toEqual([]);
  });

  it("disables discarding while sending and retains the draft after a failed send", async () => {
    seedDraft();
    const saved = storage.get(STORAGE_KEY);
    const files = attachments().props["adjuntos"];
    let resolveSend!: (value: unknown) => void;
    send.mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve;
      }),
    );
    const pending = submit();
    render();
    expect(discardButton()?.props["disabled"]).toBe(true);
    expect(find(AlertDialogAction).props["disabled"]).toBe(true);
    changeDialog(true);
    expect(find(AlertDialog).props["open"]).toBe(false);
    resolveSend({ estado: "error", detalle: "Offline" });
    await pending;
    expect(storage.get(STORAGE_KEY)).toBe(saved);
    expect(attachments().props["adjuntos"]).toBe(files);
    expect(discardButton()?.props["disabled"]).toBe(false);
  });

  it.each(["enviado", "no_configurado"])("starts empty after %s", async (estado) => {
    seedDraft();
    send.mockResolvedValue({ estado });
    await submit();
    const button = elements().find(
      (node) => node.type === "button" && text(node) === "Iniciar un nuevo pase de guardia",
    );
    expect(button).toBeDefined();
    (button!.props["onClick"] as () => void)();
    render();
    expect(attachments().props["adjuntos"]).toEqual([]);
    expect(storage.has(STORAGE_KEY)).toBe(false);
  });

  it("keeps the dialog and draft intact when local deletion fails", () => {
    seedDraft();
    changeDialog(true);
    const saved = new Map(storage);
    const files = attachments().props["adjuntos"];
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: () => {
        throw new Error("Storage unavailable");
      },
    });
    (find(AlertDialogAction).props["onClick"] as (event: { preventDefault: () => void }) => void)({
      preventDefault: vi.fn(),
    });
    render();
    expect(find(AlertDialog).props["open"]).toBe(true);
    expect(storage).toEqual(saved);
    expect(attachments().props["adjuntos"]).toBe(files);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("draft reset invariants", () => {
  it("keeps every state field and the complete storage hash unchanged after cancel", async () => {
    seedDraft();
    const { createHash } = await import("node:crypto");
    const hash = () =>
      createHash("sha256")
        .update(JSON.stringify([...storage]))
        .digest("hex");
    const beforeHash = hash();
    const beforeState = hooks.states.slice();
    changeDialog(true);
    changeDialog(false);
    expect(hash()).toBe(beforeHash);
    expect(hooks.states).toEqual(beforeState);
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps every state field and complete storage hash unchanged on rejected deletion", async () => {
    seedDraft();
    changeDialog(true);
    const { createHash } = await import("node:crypto");
    const before = createHash("sha256")
      .update(JSON.stringify([...storage]))
      .digest("hex");
    const state = hooks.states.slice();
    const local = globalThis.localStorage;
    vi.stubGlobal("localStorage", {
      ...local,
      removeItem: () => {
        throw new Error("Denied");
      },
    });
    (find(AlertDialogAction).props["onClick"] as (event: { preventDefault: () => void }) => void)({
      preventDefault: vi.fn(),
    });
    render();
    expect(
      createHash("sha256")
        .update(JSON.stringify([...storage]))
        .digest("hex"),
    ).toBe(before);
    expect(hooks.states).toEqual(state);
    expect(send).not.toHaveBeenCalled();
  });

  it("returns all form fields and validation state to the exact initial values", async () => {
    render();
    const initial = hooks.states.slice();
    hooks.states = [];
    hooks.dependencies = [];
    seedDraft();
    const email = elements().find((node) => node.props["id"] === "email")!;
    (email.props["onChange"] as (value: string) => void)("");
    render();
    await submit();
    expect(hooks.states[3]).toBe(true);
    changeDialog(true);
    (find(AlertDialogAction).props["onClick"] as (event: { preventDefault: () => void }) => void)({
      preventDefault: vi.fn(),
    });
    render();
    // The email suggestion list intentionally survives resetting the form.
    hooks.states.forEach((value, index) => {
      if (index !== 8) expect(value).toEqual(initial[index]);
    });
    expect(storage.has(STORAGE_KEY)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
