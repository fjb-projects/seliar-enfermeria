import { describe, expect, it } from "vitest";
import {
  buildGuardTimeline,
  type GuardTimelineObservation,
  type GuardTimelineService,
} from "./efa-guard-timeline";

const conduct = (
  id: string,
  overrides: Partial<GuardTimelineObservation> = {},
): GuardTimelineObservation => ({
  id,
  guardId: "guard-1",
  contextType: "guard",
  episodeId: null,
  recordKind: "conduct",
  catalogLabelSnapshot: `Conducta ${id}`,
  otherDescription: null,
  classification: "adequate",
  comment: null,
  observedAt: null,
  createdAt: "2026-10-19T15:00:00.000Z",
  ...overrides,
});

const service = (
  id: string,
  overrides: Partial<GuardTimelineService> = {},
): GuardTimelineService => ({
  id,
  originGuardId: "guard-1",
  eventAt: "2026-10-19T12:12:00.000Z",
  interventionNumber: null,
  motive: null,
  cancelledAt: null,
  ...overrides,
});

const build = (
  observations: GuardTimelineObservation[],
  services: GuardTimelineService[] = [],
  filter: "all" | "needs_improvement" = "all",
) => buildGuardTimeline({ guardId: "guard-1", observations, services, filter });

describe("buildGuardTimeline", () => {
  it("orders conducts from oldest to newest by observed time, not by record time", () => {
    const timeline = build([
      conduct("late", {
        observedAt: "2026-10-19T14:00:00.000Z",
        createdAt: "2026-10-19T14:01:00.000Z",
      }),
      conduct("early", {
        observedAt: "2026-10-19T11:30:00.000Z",
        createdAt: "2026-10-19T16:00:00.000Z",
      }),
    ]);
    expect(timeline.items.map((item) => item.id)).toEqual(["early", "late"]);
    // 11:30 UTC is 08:30 in Buenos Aires.
    expect(timeline.items[0]).toMatchObject({ time: "08:30", timeSource: "observed" });
  });

  it("falls back to the record time and flags it when the observed time is missing", () => {
    const timeline = build([
      conduct("observed", { observedAt: "2026-10-19T13:00:00.000Z" }),
      conduct("recorded", { observedAt: null, createdAt: "2026-10-19T12:45:00.000Z" }),
    ]);
    expect(timeline.items.map((item) => item.id)).toEqual(["recorded", "observed"]);
    expect(timeline.items[0]).toMatchObject({
      kind: "conduct",
      at: "2026-10-19T12:45:00.000Z",
      time: "09:45",
      timeSource: "recorded",
    });
    expect(timeline.items[1]).toMatchObject({ timeSource: "observed" });
  });

  it("keeps only guard-level conducts: no participation, no service records, no other guard", () => {
    const timeline = build([
      conduct("kept"),
      conduct("participation", { recordKind: "participation", classification: null }),
      conduct("in-service", { contextType: "episode", episodeId: "episode-1" }),
      conduct("call", { contextType: "communication", episodeId: "episode-1" }),
      conduct("other-guard", { guardId: "guard-2" }),
    ]);
    expect(timeline.items.map((item) => item.id)).toEqual(["kept"]);
    expect(timeline.conductCount).toBe(1);
  });

  it("uses the catalog label, then the free description, and trims the comment", () => {
    const timeline = build([
      conduct("catalog", { observedAt: "2026-10-19T10:00:00.000Z", comment: "  Bien  " }),
      conduct("other", {
        observedAt: "2026-10-19T11:00:00.000Z",
        catalogLabelSnapshot: null,
        otherDescription: " Demora en el aviso ",
        comment: "   ",
      }),
      conduct("bare", {
        observedAt: "2026-10-19T12:00:00.000Z",
        catalogLabelSnapshot: null,
      }),
    ]);
    expect(timeline.items).toMatchObject([
      { title: "Conducta catalog", comment: "Bien" },
      { title: "Demora en el aviso", comment: null },
      { title: "Conducta observada" },
    ]);
  });

  it("places service markers by their event time among the conducts", () => {
    const timeline = build(
      [
        conduct("before", { observedAt: "2026-10-19T12:00:00.000Z" }),
        conduct("after", { observedAt: "2026-10-19T12:30:00.000Z" }),
      ],
      [service("svc", { eventAt: "2026-10-19T12:12:00.000Z", interventionNumber: "4512" })],
    );
    expect(timeline.items.map((item) => item.id)).toEqual(["before", "svc", "after"]);
    expect(timeline.items[1]).toEqual({
      kind: "service",
      id: "svc",
      at: "2026-10-19T12:12:00.000Z",
      time: "09:12",
      title: "Servicio · Intervención 4512",
    });
  });

  it("titles a service by its motive without an intervention number, and skips voided or foreign ones", () => {
    const timeline = build(
      [],
      [
        service("motive", { motive: " Dolor torácico ", eventAt: "2026-10-19T10:00:00.000Z" }),
        service("bare", { eventAt: "2026-10-19T11:00:00.000Z" }),
        service("voided", { cancelledAt: "2026-10-19T11:30:00.000Z" }),
        service("foreign", { originGuardId: "guard-2" }),
      ],
    );
    expect(timeline.items.map((item) => item.title)).toEqual([
      "Servicio · Dolor torácico",
      "Servicio sin motivo registrado",
    ]);
    expect(timeline.conductCount).toBe(0);
  });

  it("keeps service markers but drops adequate conducts under the 'A mejorar' filter", () => {
    const timeline = build(
      [
        conduct("adequate", { observedAt: "2026-10-19T12:00:00.000Z" }),
        conduct("improve", {
          observedAt: "2026-10-19T12:30:00.000Z",
          classification: "needs_improvement",
        }),
      ],
      [service("svc")],
      "needs_improvement",
    );
    expect(timeline.items.map((item) => item.id)).toEqual(["svc", "improve"]);
    expect(timeline.conductCount).toBe(2);
    expect(timeline.shownConductCount).toBe(1);
  });

  it("separates conducts without any usable time, in source order", () => {
    const timeline = build([
      conduct("timed", { observedAt: "2026-10-19T12:00:00.000Z" }),
      conduct("broken-a", { observedAt: "not a date", createdAt: "" }),
      conduct("broken-b", { observedAt: null, createdAt: "nope" }),
    ]);
    expect(timeline.items.map((item) => item.id)).toEqual(["timed"]);
    expect(timeline.withoutTime.map((item) => item.id)).toEqual(["broken-a", "broken-b"]);
    expect(timeline.withoutTime[0]).toMatchObject({ at: null, time: "Sin hora" });
  });

  it("keeps a stable order for equal times, with the service marker first", () => {
    const at = "2026-10-19T12:12:00.000Z";
    const timeline = build(
      [conduct("a", { observedAt: at }), conduct("b", { observedAt: at })],
      [service("svc", { eventAt: at })],
    );
    expect(timeline.items.map((item) => item.id)).toEqual(["svc", "a", "b"]);
  });
});
