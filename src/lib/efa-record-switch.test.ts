import { describe, expect, it, vi } from "vitest";
import {
  confirmDiscardSwitch,
  createRecordSwitchSequence,
  decideRecordSwitch,
  prepareRecordSwitch,
  recordSwitchConfirmationCopy,
} from "./efa-record-switch";

describe("decideRecordSwitch", () => {
  it("switches when nothing is left unsaved after the flush", () => {
    expect(decideRecordSwitch({ dirtyAfterFlush: false })).toBe("switch");
  });

  it("asks before discarding when the form is still dirty after the flush", () => {
    expect(decideRecordSwitch({ dirtyAfterFlush: true })).toBe("confirm");
  });
});

describe("recordSwitchConfirmationCopy", () => {
  it("names the record with the right article and keeps the shared title and action", () => {
    expect(recordSwitchConfirmationCopy("despacho")).toEqual({
      title: "Cambios sin guardar",
      description: "Tenés cambios sin guardar en este despacho. Si cambiás ahora, se pierden.",
      confirmLabel: "Descartar y cambiar",
    });
    expect(recordSwitchConfirmationCopy("llamada").description).toBe(
      "Tenés cambios sin guardar en esta llamada. Si cambiás ahora, se pierden.",
    );
    expect(recordSwitchConfirmationCopy("coordinación").description).toBe(
      "Tenés cambios sin guardar en esta coordinación. Si cambiás ahora, se pierden.",
    );
    expect(recordSwitchConfirmationCopy("servicio").description).toBe(
      "Tenés cambios sin guardar en este servicio. Si cambiás ahora, se pierden.",
    );
  });
});

describe("createRecordSwitchSequence", () => {
  it("keeps only the latest request current", () => {
    const sequence = createRecordSwitchSequence();
    const first = sequence.begin();
    expect(first()).toBe(true);
    const second = sequence.begin();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
    sequence.cancel();
    expect(second()).toBe(false);
  });
});

describe("prepareRecordSwitch", () => {
  it("waits for the flush and switches when the form ended clean", async () => {
    let dirty = true;
    const flush = vi.fn(async () => {
      dirty = false;
      return true;
    });
    await expect(
      prepareRecordSwitch({ flush, isDirty: () => dirty, isCurrent: () => true }),
    ).resolves.toBe("switch");
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("asks when the record could not autosave and is still dirty", async () => {
    await expect(
      prepareRecordSwitch({
        flush: async () => false,
        isDirty: () => true,
        isCurrent: () => true,
      }),
    ).resolves.toBe("confirm");
  });

  it("asks when typing continued after a successful save", async () => {
    await expect(
      prepareRecordSwitch({
        flush: async () => true,
        isDirty: () => true,
        isCurrent: () => true,
      }),
    ).resolves.toBe("confirm");
  });

  it("switches when a failed flush left nothing dirty", async () => {
    await expect(
      prepareRecordSwitch({
        flush: async () => false,
        isDirty: () => false,
        isCurrent: () => true,
      }),
    ).resolves.toBe("switch");
  });

  it("treats a rejected flush as a failed save and still decides from the dirty state", async () => {
    await expect(
      prepareRecordSwitch({
        flush: () => Promise.reject(new Error("boom")),
        isDirty: () => true,
        isCurrent: () => true,
      }),
    ).resolves.toBe("confirm");
  });

  it("is stale when a newer request or a context change superseded it during the flush", async () => {
    const sequence = createRecordSwitchSequence();
    const isCurrent = sequence.begin();
    const result = prepareRecordSwitch({
      flush: async () => true,
      isDirty: () => false,
      isCurrent,
    });
    sequence.begin();
    await expect(result).resolves.toBe("stale");
  });
});

describe("confirmDiscardSwitch", () => {
  it("waits for the running save to settle and then switches", async () => {
    const order: string[] = [];
    const result = await confirmDiscardSwitch({
      settle: async () => {
        order.push("settle");
      },
      isCurrent: () => true,
      heldOperationId: () => {
        order.push("held");
        return "";
      },
    });
    expect(result).toEqual({ kind: "switch", releaseOperationId: null });
    expect(order).toEqual(["settle", "held"]);
  });

  it("switches and releases an operation still held after the wait", async () => {
    await expect(
      confirmDiscardSwitch({
        settle: async () => false,
        isCurrent: () => true,
        heldOperationId: () => "op-1",
      }),
    ).resolves.toEqual({ kind: "switch", releaseOperationId: "op-1" });
  });

  it("still switches when waiting failed", async () => {
    await expect(
      confirmDiscardSwitch({
        settle: () => Promise.reject(new Error("boom")),
        isCurrent: () => true,
        heldOperationId: () => "",
      }),
    ).resolves.toEqual({ kind: "switch", releaseOperationId: null });
  });

  it("is stale when the editor changed while waiting", async () => {
    await expect(
      confirmDiscardSwitch({
        settle: async () => true,
        isCurrent: () => false,
        heldOperationId: () => "op-1",
      }),
    ).resolves.toEqual({ kind: "stale" });
  });
});
