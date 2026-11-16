export type ObservationGroup = "phone" | "radio" | "coordination" | "duty" | "record";

export type ObservationCatalogItem = {
  key: string;
  label: string;
  group: ObservationGroup;
  competencyReference: string | null;
};

export const efaObservationCatalog: readonly ObservationCatalogItem[] = [
  {
    key: "phone.early_location",
    label: "Ubicación temprana",
    group: "phone",
    competencyReference: "A1 (parcial)",
  },
  {
    key: "phone.repeat_confirmation",
    label: "Confirmación por repetición",
    group: "phone",
    competencyReference: "A3 (parcial)",
  },
  {
    key: "phone.contact_details",
    label: "Datos de contacto",
    group: "phone",
    competencyReference: "A1 (parcial)",
  },
  {
    key: "phone.motive_questions",
    label: "Preguntas para comprender el motivo",
    group: "phone",
    competencyReference: "A1 (parcial)",
  },
  {
    key: "phone.explain_questions",
    label: "Explica por qué pregunta",
    group: "phone",
    competencyReference: "A4 (parcial)",
  },
  {
    key: "phone.clear_language",
    label: "Lenguaje comprensible",
    group: "phone",
    competencyReference: "A4 (parcial)",
  },
  {
    key: "phone.stepwise_prearrival",
    label: "Instrucciones prearribo paso a paso",
    group: "phone",
    competencyReference: null,
  },
  {
    key: "phone.check_understanding",
    label: "Verifica comprensión",
    group: "phone",
    competencyReference: null,
  },
  {
    key: "radio.location_service_data",
    label: "Ubicación y datos del servicio",
    group: "radio",
    competencyReference: "B1 (parcial)",
  },
  {
    key: "radio.priority",
    label: "Prioridad comunicada",
    group: "radio",
    competencyReference: "B1 (parcial)",
  },
  {
    key: "radio.receipt_confirmation",
    label: "Confirma recepción",
    group: "radio",
    competencyReference: "B2 (parcial)",
  },
  {
    key: "radio.clear_language",
    label: "Lenguaje claro",
    group: "radio",
    competencyReference: "B2 (parcial)",
  },
  {
    key: "radio.new_information",
    label: "Comunica novedades",
    group: "radio",
    competencyReference: "B3 (parcial)",
  },
  {
    key: "radio.status_followup",
    label: "Seguimiento del estado",
    group: "radio",
    competencyReference: "B3 (parcial)",
  },
  {
    key: "coordination.request_intervention",
    label: "Solicita intervención",
    group: "coordination",
    competencyReference: "C2 (parcial)",
  },
  {
    key: "coordination.location_reason",
    label: "Comunica ubicación y motivo",
    group: "coordination",
    competencyReference: "C2 (parcial)",
  },
  {
    key: "coordination.response_confirmation",
    label: "Confirma recepción/respuesta",
    group: "coordination",
    competencyReference: "C5 (parcial)",
  },
  {
    key: "coordination.updates",
    label: "Comunica novedades",
    group: "coordination",
    competencyReference: "C5 (parcial)",
  },
  {
    key: "duty.handover_pending",
    label: "Comunica pendientes al relevo",
    group: "duty",
    competencyReference: "E3 (parcial)",
  },
  {
    key: "duty.collaboration_request",
    label: "Pide colaboración",
    group: "duty",
    competencyReference: "E2 (parcial)",
  },
  {
    key: "duty.phone_radio_continuity",
    label: "Preserva información entre teléfono y radio",
    group: "duty",
    competencyReference: "E3 (parcial)",
  },
  {
    key: "record.complete_fields",
    label: "Completa datos",
    group: "record",
    competencyReference: "D1 (parcial; si EFA puede inspeccionar el registro)",
  },
  {
    key: "record.update_new_information",
    label: "Actualiza ante novedades",
    group: "record",
    competencyReference: "C5 (parcial; si EFA puede inspeccionar el registro)",
  },
  {
    key: "record.document_agreements",
    label: "Deja constancia de acuerdos",
    group: "record",
    competencyReference: "C5 (parcial; si EFA puede inspeccionar el registro)",
  },
];

export function getObservationCatalogForContext(group: ObservationGroup) {
  return efaObservationCatalog.filter((item) => item.group === group);
}
