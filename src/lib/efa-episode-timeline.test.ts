import { describe, expect, it } from "vitest";
import { buildEpisodeTimeline, type EpisodeTimelineInput } from "./efa-episode-timeline";

const episode = {
  eventAt: "2026-10-14T13:30:00.000Z",
  closedAt: null,
  cancelledAt: null,
};
const noTimes = {
  t0At: null,
  t1At: null,
  t2At: null,
  t3At: null,
  t4At: null,
  t5At: null,
  t6At: null,
};
const empty: EpisodeTimelineInput = {
  episode,
  communications: [],
  dispatches: [],
  coordinations: [],
  observations: [],
};

describe("buildEpisodeTimeline", () => {
  it("always starts with the event time and has no untimed group when everything has a time", () => {
    const timeline = buildEpisodeTimeline(empty);
    expect(timeline.items).toEqual([
      { at: "2026-10-14T13:30:00.000Z", kind: "service", title: "Hora del hecho" },
    ]);
    expect(timeline.withoutTime).toEqual([]);
  });

  it("adds closing and cancellation moments of the service", () => {
    const timeline = buildEpisodeTimeline({
      ...empty,
      episode: {
        ...episode,
        closedAt: "2026-10-14T14:30:00.000Z",
        cancelledAt: "2026-10-14T15:00:00.000Z",
      },
    });
    expect(timeline.items.map((item) => item.title)).toEqual([
      "Hora del hecho",
      "Servicio cerrado",
      "Servicio anulado",
    ]);
  });

  it("normalizes calls using the start time and falling back to the creation time", () => {
    const timeline = buildEpisodeTimeline({
      ...empty,
      communications: [
        {
          id: "c1",
          direction: "incoming",
          priority: "red",
          state: "finalized",
          startedAt: "2026-10-14T13:35:00.000Z",
          createdAt: "2026-10-14T13:50:00.000Z",
        },
        {
          id: "c2",
          direction: "outgoing",
          priority: null,
          state: "cancelled",
          startedAt: null,
          createdAt: "2026-10-14T13:32:00.000Z",
        },
      ],
    });
    expect(timeline.items).toEqual([
      { at: "2026-10-14T13:30:00.000Z", kind: "service", title: "Hora del hecho" },
      {
        at: "2026-10-14T13:32:00.000Z",
        kind: "call",
        title: "Llamada saliente",
        detail: "Anulada",
      },
      {
        at: "2026-10-14T13:35:00.000Z",
        kind: "call",
        title: "Llamada entrante",
        detail: "Prioridad roja",
      },
    ]);
  });

  it("includes only observed dispatch times, labeled with the mobile name", () => {
    const timeline = buildEpisodeTimeline({
      ...empty,
      dispatches: [
        {
          id: "d1",
          baseName: "Móvil 1",
          ...noTimes,
          t0At: "2026-10-14T13:40:00.000Z",
          t2At: "2026-10-14T13:55:00.000Z",
          contactAttempts: [],
        },
        { id: "d2", baseName: null, ...noTimes, t1At: "2026-10-14T13:45:00.000Z" },
      ],
    });
    expect(timeline.items.slice(1)).toEqual([
      { at: "2026-10-14T13:40:00.000Z", kind: "dispatch", title: "Despacho · Móvil 1" },
      { at: "2026-10-14T13:45:00.000Z", kind: "dispatch", title: "En camino · Base histórica" },
      {
        at: "2026-10-14T13:55:00.000Z",
        kind: "dispatch",
        title: "Llegada a escena · Móvil 1",
      },
    ]);
  });

  it("marks every entry of a cancelled dispatch as Anulada, like cancelled calls", () => {
    const timeline = buildEpisodeTimeline({
      ...empty,
      dispatches: [
        {
          id: "d1",
          baseName: "Móvil 1",
          state: "cancelled",
          ...noTimes,
          t0At: "2026-10-14T13:40:00.000Z",
          contactAttempts: [
            { id: "a1", occurredAt: "2026-10-14T13:42:00.000Z", note: "Sin novedades" },
            { id: "a2", occurredAt: "2026-10-14T13:44:00.000Z", note: null },
          ],
        },
        {
          id: "d2",
          baseName: "Móvil 2",
          state: "finalized",
          ...noTimes,
          t0At: "2026-10-14T13:41:00.000Z",
        },
      ],
    });
    expect(timeline.items.slice(1)).toEqual([
      {
        at: "2026-10-14T13:40:00.000Z",
        kind: "dispatch",
        title: "Despacho · Móvil 1",
        detail: "Anulada",
      },
      { at: "2026-10-14T13:41:00.000Z", kind: "dispatch", title: "Despacho · Móvil 2" },
      {
        at: "2026-10-14T13:42:00.000Z",
        kind: "follow_up",
        title: "Seguimiento · Móvil 1",
        detail: "Sin novedades · Anulada",
      },
      {
        at: "2026-10-14T13:44:00.000Z",
        kind: "follow_up",
        title: "Seguimiento · Móvil 1",
        detail: "Anulada",
      },
    ]);
  });

  it("merges follow-up entries with their time and note, and keeps the order stable on ties", () => {
    const timeline = buildEpisodeTimeline({
      ...empty,
      dispatches: [
        {
          id: "d1",
          baseName: "Móvil 1",
          ...noTimes,
          t0At: "2026-10-14T13:40:00.000Z",
          contactAttempts: [
            { id: "a1", occurredAt: "2026-10-14T13:40:00.000Z", note: "Sin novedades" },
            { id: "a2", occurredAt: "2026-10-14T13:38:00.000Z", note: null },
          ],
        },
      ],
    });
    expect(timeline.items.slice(1)).toEqual([
      { at: "2026-10-14T13:38:00.000Z", kind: "follow_up", title: "Seguimiento · Móvil 1" },
      { at: "2026-10-14T13:40:00.000Z", kind: "dispatch", title: "Despacho · Móvil 1" },
      {
        at: "2026-10-14T13:40:00.000Z",
        kind: "follow_up",
        title: "Seguimiento · Móvil 1",
        detail: "Sin novedades",
      },
    ]);
  });

  it("puts police events without a time in the untimed group and never leaks private data", () => {
    const timeline = buildEpisodeTimeline({
      ...empty,
      coordinations: [
        {
          id: "p1",
          placeType: "meeting_point",
          events: [
            {
              id: "e1",
              kind: "request",
              occurredAt: "2026-10-14T13:45:00.000Z",
              timeStatus: "observed",
            },
            { id: "e2", kind: "response", occurredAt: null, timeStatus: "not_informed" },
          ],
          meetingReference: "Esquina privada",
          notes: "Nota privada",
        } as never,
      ],
    });
    expect(timeline.items[1]).toEqual({
      at: "2026-10-14T13:45:00.000Z",
      kind: "police",
      title: "Solicitud",
      detail: "Punto de encuentro",
    });
    expect(timeline.withoutTime).toEqual([
      {
        at: null,
        kind: "police",
        title: "Respuesta",
        detail: "Punto de encuentro · No informado",
      },
    ]);
    const serialized = JSON.stringify(timeline);
    expect(serialized).not.toContain("Esquina privada");
    expect(serialized).not.toContain("Nota privada");
  });

  it("uses the observation time with a creation fallback and skips participation records", () => {
    const timeline = buildEpisodeTimeline({
      ...empty,
      observations: [
        {
          id: "o1",
          recordKind: "conduct",
          catalogLabelSnapshot: "Saludo inicial",
          otherDescription: null,
          classification: "adequate",
          comment: "Claro y amable",
          observedAt: "2026-10-14T13:36:00.000Z",
          createdAt: "2026-10-14T15:00:00.000Z",
        },
        {
          id: "o2",
          catalogLabelSnapshot: null,
          otherDescription: "Registro de datos",
          classification: "needs_improvement",
          comment: null,
          observedAt: null,
          createdAt: "2026-10-14T13:34:00.000Z",
        },
        {
          id: "o3",
          recordKind: "participation",
          catalogLabelSnapshot: "Participación",
          otherDescription: null,
          classification: null,
          comment: null,
          observedAt: "2026-10-14T13:37:00.000Z",
          createdAt: "2026-10-14T13:37:00.000Z",
        },
        {
          id: "o4",
          recordKind: "conduct",
          catalogLabelSnapshot: null,
          otherDescription: null,
          classification: null,
          comment: null,
          observedAt: null,
          createdAt: null,
        },
      ],
    });
    expect(timeline.items.slice(1)).toEqual([
      {
        at: "2026-10-14T13:34:00.000Z",
        kind: "conduct",
        title: "Registro de datos",
        detail: "A mejorar",
      },
      {
        at: "2026-10-14T13:36:00.000Z",
        kind: "conduct",
        title: "Saludo inicial",
        detail: "Adecuada · Claro y amable",
      },
    ]);
    expect(timeline.withoutTime).toEqual([
      { at: null, kind: "conduct", title: "Conducta observada", detail: "Sin clasificar" },
    ]);
  });

  it("treats invalid dates as untimed instead of sorting them", () => {
    const timeline = buildEpisodeTimeline({
      ...empty,
      episode: { ...episode, eventAt: "not-a-date" },
    });
    expect(timeline.items).toEqual([]);
    expect(timeline.withoutTime).toEqual([{ at: null, kind: "service", title: "Hora del hecho" }]);
  });

  it("sorts items from every section chronologically", () => {
    const timeline = buildEpisodeTimeline({
      episode: { ...episode, closedAt: "2026-10-14T16:00:00.000Z" },
      communications: [
        {
          id: "c1",
          direction: "incoming",
          priority: null,
          state: "finalized",
          startedAt: "2026-10-14T13:29:00.000Z",
          createdAt: "2026-10-14T13:29:00.000Z",
        },
      ],
      dispatches: [
        {
          id: "d1",
          baseName: "Móvil 1",
          ...noTimes,
          t0At: "2026-10-14T13:40:00.000Z",
          contactAttempts: [{ id: "a1", occurredAt: "2026-10-14T13:50:00.000Z", note: "ok" }],
        },
      ],
      coordinations: [
        {
          id: "p1",
          placeType: "incident",
          events: [
            {
              id: "e1",
              kind: "request",
              occurredAt: "2026-10-14T13:45:00.000Z",
              timeStatus: "observed",
            },
          ],
        },
      ],
      observations: [],
    });
    expect(timeline.items.map((item) => item.kind)).toEqual([
      "call",
      "service",
      "dispatch",
      "police",
      "follow_up",
      "service",
    ]);
  });
});
