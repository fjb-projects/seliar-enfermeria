export const observationRecordKinds = ["conduct", "participation"] as const;
export type ObservationRecordKind = (typeof observationRecordKinds)[number];

export const evaluatorParticipationLevels = [
  "observation_only",
  "consultation",
  "active_guidance",
  "direct_leadership",
] as const;
export type EvaluatorParticipationLevel = (typeof evaluatorParticipationLevels)[number];

export const evaluatorParticipationLevelLabels: Record<EvaluatorParticipationLevel, string> = {
  observation_only: "Observación sin intervención",
  consultation: "Consulta puntual",
  active_guidance: "Orientación activa",
  direct_leadership: "Conducción directa",
};
