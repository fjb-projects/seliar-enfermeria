import { it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createEfaServiceMetadataStore } from "@/lib/efa-service-metadata";
import { EfaServiceSelector } from "@/components/EfaServiceSelector";
const call = {
  id: "c",
  episodeId: "e",
  ownerUserId: "o",
  createdAt: "2026-11-13T10:00:00Z",
  priority: "green",
  version: 2,
};
const dispatch = {
  id: "d",
  episodeId: "e",
  ownerUserId: "o",
  createdAt: "2026-11-13T10:00:00Z",
  baseId: "b",
  baseName: "Móvil 99",
  version: 2,
};
function markup(store: ReturnType<typeof createEfaServiceMetadataStore>) {
  return renderToStaticMarkup(
    <EfaServiceSelector
      items={[{ id: "e", label: "Service", ...store.get("e") }]}
      selectedId="e"
      onSelect={vi.fn()}
      onCreate={vi.fn()}
      canCreate
      onHistory={vi.fn()}
      historyCount={0}
      onRetry={vi.fn()}
    />,
  );
}
it("retains confirmed mobile after a preceding GET fails late", async () => {
  const store = createEfaServiceMetadataStore("o");
  let reject!: (e: Error) => void;
  const pending = store.load("e", {
    calls: async () => [call],
    dispatches: () =>
      new Promise((_r, no) => {
        reject = no;
      }),
  });
  store.upsertDispatch("e", dispatch);
  reject(new Error("temporary network error"));
  await pending;
  expect(store.get("e").mobiles).toEqual(["99"]);
  expect(store.get("e").status).toBe("ready");
  expect(markup(store)).toContain(">99</span>");
  expect(markup(store)).toContain("Móviles: 99");
});
it("retains confirmed mobile during a later refresh", async () => {
  const store = createEfaServiceMetadataStore("o");
  store.publishCalls("e", [call]);
  store.upsertDispatch("e", dispatch);
  let resolve!: (v: (typeof dispatch)[]) => void;
  const pending = store.load("e", {
    calls: async () => [call],
    dispatches: () =>
      new Promise((yes) => {
        resolve = yes;
      }),
  });
  const html = markup(store);
  resolve([dispatch]);
  await pending;
  expect(html).toContain(">99</span>");
  expect(html).toContain("Móviles: 99; actualizando");
});
it("shows known confirmed mobile when only calls refresh fails", async () => {
  const store = createEfaServiceMetadataStore("o");
  store.publishCalls("e", [call]);
  store.upsertDispatch("e", dispatch);
  await store.load("e", {
    calls: async () => {
      throw new Error("offline");
    },
    dispatches: async () => [dispatch],
  });
  expect(store.get("e").mobiles).toEqual(["99"]);
  expect(markup(store)).toContain(">99</span>");
  expect(markup(store)).toContain("Móviles: 99; no se pudo actualizar");
});
