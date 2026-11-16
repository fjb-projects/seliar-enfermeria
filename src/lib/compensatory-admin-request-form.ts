import { parseWorkflowMinutes } from "./compensatory-hours-workflow";

export type AdministrativeRequestDraft = {
  staffId: string;
  requesterEmail: string;
  requesterMobile: string;
  compensatoryDate: string;
  hours: string;
  minutes: string;
  reason: string;
};

export type AdministrativeRequestOperation = { fingerprint: string; id: string };

export const ADMINISTRATIVE_MOBILE_CHOICES = [
  "Móvil 1",
  "Móvil 2",
  "Móvil 3",
  "Móvil 4",
  "Móvil 5",
  "Móvil 6",
  "Móvil 7",
  "Móvil 9",
  "Móvil 11",
  "Móvil 12",
  "Móvil 15",
  "Móvil 26",
  "Móvil Flotante",
  "Otro Movil no Nomenclado",
] as const;

export function validateAdministrativeRequestDraft(
  draft: AdministrativeRequestDraft,
  staffIsActive: boolean,
  today: string,
): string | null {
  if (!draft.staffId || !staffIsActive) return "Selecciona un agente activo.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.requesterEmail.trim()))
    return "Ingresa un correo electrónico válido.";
  if (!ADMINISTRATIVE_MOBILE_CHOICES.includes(draft.requesterMobile as never))
    return "Selecciona un móvil de la lista.";
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(draft.compensatoryDate);
  const parsedDate = dateParts
    ? new Date(Date.UTC(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3])))
    : null;
  const isCalendarDate =
    Boolean(dateParts && parsedDate) &&
    parsedDate!.toISOString().slice(0, 10) === draft.compensatoryDate;
  if (!isCalendarDate || draft.compensatoryDate < today)
    return "La fecha debe ser hoy o una fecha futura.";
  const minutes = parseWorkflowMinutes(draft.hours, draft.minutes);
  if (minutes === null) return "Ingresa horas enteras y minutos entre 0 y 59.";
  if (minutes < 1) return "La cantidad debe ser de al menos un minuto.";
  if (!draft.reason.trim()) return "Indica el motivo de la carga manual.";
  return null;
}

export function getAdministrativeRequestOperation(
  previous: AdministrativeRequestOperation | null,
  draft: AdministrativeRequestDraft,
  createId: () => string,
): AdministrativeRequestOperation {
  const fingerprint = JSON.stringify({
    ...draft,
    requesterEmail: draft.requesterEmail.trim(),
    reason: draft.reason.trim(),
  });
  return previous?.fingerprint === fingerprint ? previous : { fingerprint, id: createId() };
}

export function formatAdministrativeRequestHours(draft: AdministrativeRequestDraft): string {
  const totalMinutes = parseWorkflowMinutes(draft.hours, draft.minutes) ?? 0;
  return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, "0")}`;
}
