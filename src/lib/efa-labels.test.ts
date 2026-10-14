import { describe, expect, it } from "vitest";
import {
  dispatchResultLabel,
  dispatchResultOptions,
  dispatchTimeSteps,
  directionLabel,
  formatDateTimeMinutes,
  formatDispatchPriority,
  formatObservedDateTime,
  formatTimeMinutes,
  observationClassificationLabel,
  observationGroupLabels,
  policeEventLabel,
  policeInitiatorLabel,
  policePlaceTypeLabel,
  priorityLabel,
  timeStatusLabel,
  timelineKindLabels,
} from "./efa-labels";

describe("efa-labels", () => {
  it("labels call priority and direction in Spanish", () => {
    expect(priorityLabel("red")).toBe("Roja");
    expect(priorityLabel("yellow")).toBe("Amarilla");
    expect(priorityLabel("green")).toBe("Verde");
    expect(priorityLabel(null)).toBe("Sin prioridad");
    expect(directionLabel("incoming")).toBe("Entrante");
    expect(directionLabel("outgoing")).toBe("Saliente");
  });

  it("keeps dispatch priority lowercase and tolerates unknown values", () => {
    expect(formatDispatchPriority("red")).toBe("roja");
    expect(formatDispatchPriority("")).toBe("sin prioridad");
    expect(formatDispatchPriority(undefined)).toBe("sin prioridad");
    expect(formatDispatchPriority("purple")).toBe("sin prioridad");
  });

  it("labels time statuses, dispatch results and time steps", () => {
    expect(timeStatusLabel("not_applicable")).toBe("No aplica");
    expect(dispatchResultLabel("transported")).toBe("Con traslado");
    expect(dispatchResultLabel("death")).toBe("Óbito");
    expect(dispatchResultLabel("")).toBe("Sin resultado");
    expect(dispatchResultOptions).toHaveLength(7);
    expect(dispatchTimeSteps.map(([key]) => key)).toEqual([
      "t0At",
      "t1At",
      "t2At",
      "t3At",
      "t4At",
      "t5At",
      "t6At",
    ]);
  });

  it("labels timeline kinds in plain Spanish", () => {
    expect(timelineKindLabels).toEqual({
      service: "Servicio",
      call: "Llamada",
      dispatch: "Despacho",
      follow_up: "Seguimiento",
      police: "Apoyo policial",
      conduct: "Conducta",
    });
  });

  it("labels police coordination data", () => {
    expect(policeEventLabel("arrival_meeting_point")).toBe("Llegada al punto de encuentro");
    expect(policeInitiatorLabel("central")).toBe("Central");
    expect(policeInitiatorLabel("ambulance")).toBe("Ambulancia");
    expect(policePlaceTypeLabel("incident")).toBe("Lugar del hecho");
    expect(policePlaceTypeLabel("meeting_point")).toBe("Punto de encuentro");
  });

  it("labels observation groups and classifications", () => {
    expect(observationGroupLabels.duty).toBe("Relevo y colaboración");
    expect(observationClassificationLabel("adequate")).toBe("Adecuada");
    expect(observationClassificationLabel("needs_improvement")).toBe("A mejorar");
    expect(observationClassificationLabel(null)).toBe("Sin clasificar");
  });

  it("formats dates in Buenos Aires time and handles missing or invalid values", () => {
    expect(formatDateTimeMinutes("2026-10-14T14:09:00.000Z")).toBe("14/10/2026 11:09");
    expect(formatTimeMinutes("2026-10-14T14:09:00.000Z")).toBe("11:09");
    expect(formatObservedDateTime("2026-10-14T14:09:30.000Z")).toContain("11:09:30");
    expect(formatObservedDateTime(null)).toBe("Sin hora observada");
    expect(formatDateTimeMinutes("not-a-date")).toBe("—");
    expect(formatTimeMinutes(null, "sin hora")).toBe("sin hora");
  });
});
