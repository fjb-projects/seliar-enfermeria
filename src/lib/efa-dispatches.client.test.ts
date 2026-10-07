import { describe, expect, it } from "vitest";
import {
  canAdoptConfirmedDispatch,
  canApplyConfirmedMutation,
  canEditQueuedDispatch,
  dispatchFormChanged,
  dateToDispatchInput,
  dispatchFormTimes,
  emptyDispatchForm,
  formatDispatchDate,
  restoreDispatchQueueForm,
  rebaseDispatchQueueEntry,
  normalizeConfirmedDispatch,
  shouldAdoptRefreshedDispatch,
} from "./efa-dispatches.client";
import type { DispatchQueueEntry } from "./efa-dispatches.queue";

describe("dispatch client form helpers", () => {
  it("normalizes the real mutation DTO without dropping existing contact history", () => {
    const mutationDto = {
      id: "dispatch-a",
      version: 2,
      t0At: "2026-10-07T12:34:56.789Z",
      canEdit: true,
    };
    const prior = {
      contactAttempts: [{ id: "contact-1", occurredAt: "2026-10-07T12:00:00Z", note: null }],
    };
    expect(normalizeConfirmedDispatch(mutationDto, prior)).toMatchObject({
      id: "dispatch-a",
      contactAttempts: prior.contactAttempts,
    });
    expect(normalizeConfirmedDispatch(mutationDto, null).contactAttempts).toEqual([]);
  });

  it("fences mutation adoption against delayed context or editor changes", async () => {
    let selectedId: string | null = null;
    let release!: () => void;
    const delay = new Promise<void>((resolve) => (release = resolve));
    const applyAfterLoad = async () => {
      await delay;
      return canApplyConfirmedMutation({
        mounted: true,
        ownerMatches: true,
        episodeMatches: true,
        operationInFlight: true,
        kind: "create",
        dispatchId: "dispatch-a",
        submitted: { selectedId: null, form: "frozen" },
        currentSelectedId: selectedId,
        currentForm: "frozen",
      });
    };
    const pending = applyAfterLoad();
    selectedId = "dispatch-b";
    release();
    expect(await pending).toBe(false);
  });

  it("adopts a confirmed mutation before refresh only when its original editor remains active", () => {
    const submitted = { selectedId: null, form: JSON.stringify(emptyDispatchForm()) };
    expect(canAdoptConfirmedDispatch("create", "dispatch-a", submitted, null, submitted.form)).toBe(
      true,
    );
    expect(
      canAdoptConfirmedDispatch("create", "dispatch-a", submitted, "dispatch-b", submitted.form),
    ).toBe(false);
    expect(canAdoptConfirmedDispatch("create", "dispatch-a", submitted, null, "dirty form")).toBe(
      false,
    );
    const update = { selectedId: "dispatch-a", form: submitted.form };
    expect(
      canAdoptConfirmedDispatch("update", "dispatch-a", update, "dispatch-a", submitted.form),
    ).toBe(true);
    expect(
      canAdoptConfirmedDispatch("update", "dispatch-a", update, "dispatch-b", submitted.form),
    ).toBe(false);
  });

  it("never lets an unrelated refresh replace a dirty selected dispatch editor", () => {
    expect(shouldAdoptRefreshedDispatch("dispatch-a", "dispatch-b", false)).toBe(false);
    expect(shouldAdoptRefreshedDispatch("dispatch-a", "dispatch-a", true)).toBe(false);
    expect(shouldAdoptRefreshedDispatch("dispatch-a", "dispatch-a", false)).toBe(true);
  });

  it("keeps entity permission distinct from current EFA and episode permission", () => {
    const create = { kind: "create" } as DispatchQueueEntry;
    const update = { kind: "update" } as DispatchQueueEntry;
    expect(canEditQueuedDispatch(create, true, true, false)).toBe(true);
    expect(canEditQueuedDispatch(update, true, true, false)).toBe(false);
    expect(canEditQueuedDispatch(update, true, false, true)).toBe(false);
  });

  it("uses a stable Buenos Aires display timezone", () => {
    expect(formatDispatchDate("2026-10-06T09:30:00.000Z")).toContain("06:30");
  });

  it("preserves seconds and milliseconds when an unchanged field is saved", () => {
    const original = "2026-10-06T09:30:45.678Z";
    const form = emptyDispatchForm();
    form.t2At = dateToDispatchInput(original);
    expect(
      dispatchFormTimes(form, {
        t0At: null,
        t1At: null,
        t2At: original,
        t3At: null,
        t4At: null,
        t5At: null,
        t6At: null,
      }).t2At,
    ).toBe(original);
  });

  it("detects edits so finalization cannot skip an unconfirmed form change", () => {
    const form = emptyDispatchForm();
    expect(dispatchFormChanged(form, emptyDispatchForm())).toBe(false);
    form.note = "Actualización";
    expect(dispatchFormChanged(form, emptyDispatchForm())).toBe(true);
    form.note = "";
    form.institutionId = "institution-a";
    expect(dispatchFormChanged(form, emptyDispatchForm())).toBe(true);
  });

  it("restores frozen create values and preserves current times for finalize-only entries", () => {
    const entry = {
      ownerUserId: "owner",
      episodeId: "episode",
      operationId: "op",
      kind: "update",
      status: "paused-conflict",
      createdAt: "2026-10-06T00:00:00Z",
      payload: {
        dispatchId: "dispatch",
        expectedVersion: 2,
        operationId: "op",
        baseId: "base",
        institutionId: "institution-a",
        communicationId: null,
        priority: null,
        t0At: "2026-10-06T09:30:45.678Z",
        t0Status: "observed",
        t1At: null,
        t1Status: "not_observed",
        t2At: null,
        t2Status: "not_observed",
        t3At: null,
        t3Status: "not_observed",
        t4At: null,
        t4Status: "not_observed",
        t5At: null,
        t5Status: "not_observed",
        t6At: null,
        t6Status: "not_observed",
        firstResponseRole: null,
        firstResponseAt: null,
        note: "captured",
        result: null,
        resultClarification: null,
      },
    } as DispatchQueueEntry;
    const restored = restoreDispatchQueueForm(entry, emptyDispatchForm())!;
    expect(restored.note).toBe("captured");
    expect(restored.institutionId).toBe("institution-a");
    expect(restored.t0At).toContain(":30:45.678");
    const finalize = {
      ...entry,
      kind: "finalize",
      payload: {
        dispatchId: "dispatch",
        expectedVersion: 2,
        operationId: "op",
        priority: "red",
        result: "transported",
        resultClarification: null,
      },
    } as DispatchQueueEntry;
    expect(restoreDispatchQueueForm(finalize, restored)).toMatchObject({
      t0At: restored.t0At,
      priority: "red",
      result: "transported",
    });
  });

  it("rebases a stale queued edit only by assigning a new operation identity", () => {
    const entry = {
      ownerUserId: "owner",
      episodeId: "episode",
      operationId: "old-op",
      kind: "update",
      status: "paused-conflict",
      createdAt: "2026-10-06T00:00:00Z",
      payload: {
        dispatchId: "dispatch",
        expectedVersion: 2,
        operationId: "old-op",
        note: "frozen",
      },
    } as DispatchQueueEntry;
    const rebased = rebaseDispatchQueueEntry(entry, 4, "new-op", new Date("2026-10-07T00:00:00Z"));
    expect(rebased).toMatchObject({
      operationId: "new-op",
      status: "pending",
      payload: { operationId: "new-op", expectedVersion: 4, note: "frozen" },
    });
    expect(entry.payload).toMatchObject({ operationId: "old-op", expectedVersion: 2 });
  });
});
