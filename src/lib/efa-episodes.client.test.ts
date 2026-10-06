import { describe, expect, it } from "vitest";
import {
  createPendingCreate,
  createPendingUpdate,
  confirmedEpisodeBaseline,
  episodeErrorKind,
  localDateTimeToIso,
  validateEpisodeForm,
} from "./efa-episodes.client";

describe("EFA episode client operation helpers", () => {
  it("retains an exact immutable create payload and stable operation identity for retries", () => {
    const form = {
      eventAt: "2026-10-06T09:30:00.000Z",
      motive: "Traslado",
      address: " Calle privada 12 ",
      interventionNumber: "00017",
    };
    const first = createPendingCreate("guard-1", form, () => "stable-create-id");
    const retry = first;
    expect(retry).toBe(first);
    expect(retry.operationId).toBe("stable-create-id");
    expect(retry.payload).toEqual({
      clientCreationKey: "stable-create-id",
      guardId: "guard-1",
      ...form,
    });
    expect(Object.isFrozen(first.payload)).toBe(true);
  });

  it("keeps update retries tied to their original expected version and classifies conflicts", () => {
    const pending = createPendingUpdate(
      {
        episodeId: "episode-1",
        expectedVersion: 3,
        eventAt: "2026-10-06T09:30:00.000Z",
        motive: "Traslado",
        address: null,
        interventionNumber: null,
      },
      () => "stable-update-id",
    );
    expect(pending.payload).toMatchObject({ operationId: "stable-update-id", expectedVersion: 3 });
    expect(episodeErrorKind(new Error("El episodio cambió; actualiza el historial"))).toBe(
      "conflict",
    );
    expect(episodeErrorKind(new Error("network timeout"))).toBe("uncertain");
    expect(episodeErrorKind(new Error("Se requiere acceso EFA vigente."))).toBe("permission");
  });

  it("converts local date/time input into an absolute ISO timestamp", () => {
    const local = "2026-10-06T09:30";
    expect(localDateTimeToIso(local)).toBe(new Date(local).toISOString());
    expect(localDateTimeToIso("")).toBeNull();
  });

  it("accepts a timestamp-only draft and allows both optional identifiers to be cleared", () => {
    const form = {
      eventAt: "2026-10-06T09:30",
      motive: "",
      address: "",
      interventionNumber: "",
    };
    expect(validateEpisodeForm(form)).toEqual({
      valid: true,
      eventAt: new Date(form.eventAt).toISOString(),
    });
    expect(validateEpisodeForm({ ...form, eventAt: "" }).valid).toBe(false);
    expect(
      createPendingCreate("guard-1", {
        ...form,
        eventAt: new Date(form.eventAt).toISOString(),
      }).payload,
    ).toMatchObject({ motive: "", address: "" });
  });

  it("uses the current server episode as the confirmed form baseline", () => {
    const saved = {
      id: "episode-1",
      version: 2,
      eventAt: "2026-10-06T09:30:00.000Z",
      motive: "My accepted value",
      address: null,
      interventionNumber: null,
    };
    const refreshed = {
      ...saved,
      version: 3,
      eventAt: "2026-10-06T10:30:00.000Z",
      motive: "Later administrator correction",
    };
    const baseline = confirmedEpisodeBaseline(saved, [refreshed]);

    expect(baseline.episode).toEqual(refreshed);
    expect(baseline.form).toEqual({
      eventAt: (() => {
        const date = new Date("2026-10-06T10:30:00.000Z");
        return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
          .toISOString()
          .slice(0, 16);
      })(),
      motive: "Later administrator correction",
      address: "",
      interventionNumber: "",
    });
  });
});
