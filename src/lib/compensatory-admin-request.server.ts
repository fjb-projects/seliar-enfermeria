import { createHash } from "node:crypto";

export type AdministrativeCompensatoryRequestInput = {
  clientOperationId: string;
  staffId: string;
  requesterEmail: string;
  requesterMobile: string;
  compensatoryDate: string;
  hours: string;
  reason: string;
  confirmDuplicate?: boolean | undefined;
};

export type AdministrativeCompensatoryRequest = Omit<
  AdministrativeCompensatoryRequestInput,
  "reason" | "confirmDuplicate"
> & {
  id: string;
  submittedAt: string;
  requesterName: string;
  requesterEmailVerifiedAt: null;
  createdByUserId: string;
  submissionSource: "admin";
  phase: "pending";
  version: 2;
  requestedDate: string;
  requestedMinutes: number;
  classifiedAt: Date;
  classifiedByUserId: string;
  createdAt: Date;
};

export type AdministrativeRequestAudit = {
  requestId: string;
  actorUserId: string;
  actorName: string;
  actorKind: "admin";
  action: "classified";
  occurredAt: Date;
  reason: string;
  versionBefore: 1;
  versionAfter: 2;
  detail: { source: "admin"; requesterEmailVerified: false; clientOperationId: string };
};

export interface AdministrativeCompensatoryTransaction {
  findActor(userId: string): Promise<{ isActive: boolean; isAdmin: boolean; name: string } | null>;
  lockOperation(actorUserId: string, operationId: string): Promise<void>;
  findOperation(
    actorUserId: string,
    operationId: string,
  ): Promise<{ action: string; payloadHash: string; resultId: string } | null>;
  lockStaff(staffId: string): Promise<{ id: string; name: string; isActive: boolean } | null>;
  findPotentialDuplicates(
    staffId: string,
    requestedDate: string,
    requestedMinutes: number,
  ): Promise<Array<{ id: string }>>;
  serviceDay(): Promise<string>;
  insertRequest(
    request: Omit<AdministrativeCompensatoryRequest, "id" | "createdAt">,
  ): Promise<AdministrativeCompensatoryRequest>;
  insertRequestAudit(audit: AdministrativeRequestAudit): Promise<void>;
  insertOperation(
    actorUserId: string,
    operationId: string,
    action: string,
    payloadHash: string,
    resultId: string,
  ): Promise<void>;
}

export interface AdministrativeCompensatoryStore {
  transaction<T>(work: (tx: AdministrativeCompensatoryTransaction) => Promise<T>): Promise<T>;
}

const operationAction = "create_administrative_compensatory_request";
const maxMinutes = 2_147_483_647;

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function minutesFromHours(value: string) {
  const duration = /^(\d+):([0-5]\d)$/.exec(value);
  if (duration) {
    const minutes = BigInt(duration[1]!) * 60n + BigInt(duration[2]!);
    if (minutes === 0n) throw new Error("La cantidad de horas debe ser positiva.");
    if (minutes > BigInt(maxMinutes))
      throw new Error("La cantidad de horas supera el máximo admitido.");
    return Number(minutes);
  }
  const match = /^(\d+)(?:[.,](\d+))?$/.exec(value);
  if (!match) throw new Error("La cantidad de horas no es válida.");
  const whole = BigInt(match[1]!);
  const fraction = match[2] ?? "";
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = (whole * denominator + BigInt(fraction || "0")) * 60n;
  if (numerator === 0n || numerator % denominator !== 0n)
    throw new Error("La cantidad de horas debe equivaler a un número entero de minutos.");
  const minutes = numerator / denominator;
  if (minutes > BigInt(maxMinutes))
    throw new Error("La cantidad de horas supera el máximo admitido.");
  return Number(minutes);
}

function normalize(raw: AdministrativeCompensatoryRequestInput) {
  const input = {
    ...raw,
    clientOperationId: raw.clientOperationId.toLowerCase(),
    staffId: raw.staffId.toLowerCase(),
    requesterEmail: raw.requesterEmail.trim(),
    requesterMobile: raw.requesterMobile.trim(),
    compensatoryDate: raw.compensatoryDate.trim(),
    hours: raw.hours.trim(),
    reason: raw.reason.trim(),
  };
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.clientOperationId,
    )
  )
    throw new Error("El identificador de operación no es válido.");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.staffId,
    )
  )
    throw new Error("No se encontró el agente asociado.");
  if (input.requesterEmail.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.requesterEmail))
    throw new Error("El correo electrónico no es válido.");
  if (!input.requesterMobile || input.requesterMobile.length > 300)
    throw new Error("El teléfono móvil no es válido.");
  if (!validDate(input.compensatoryDate)) throw new Error("La fecha solicitada no es válida.");
  if (input.hours.length > 100) throw new Error("La cantidad de horas no es válida.");
  if (!input.reason || input.reason.length > 1000)
    throw new Error("El motivo es obligatorio y debe tener hasta 1000 caracteres.");
  const requestedMinutes = minutesFromHours(input.hours);
  return { input, requestedMinutes };
}

function intentHash(input: ReturnType<typeof normalize>["input"]) {
  const { confirmDuplicate: _confirmDuplicate, ...intent } = input;
  return createHash("sha256").update(JSON.stringify(intent)).digest("hex");
}

export function createAdministrativeCompensatoryRequestService(
  store: AdministrativeCompensatoryStore,
) {
  return {
    async createAdministrativeCompensatoryRequest(
      actorUserId: string,
      rawInput: AdministrativeCompensatoryRequestInput,
    ): Promise<
      | { state: "submitted" }
      | { state: "duplicate_review_required"; matches: Array<{ id: string }> }
    > {
      const { input, requestedMinutes } = normalize(rawInput);
      return store.transaction(async (tx) => {
        const actor = await tx.findActor(actorUserId);
        if (!actor?.isActive || !actor.isAdmin)
          throw new Error("Se requiere administración vigente.");
        await tx.lockOperation(actorUserId, input.clientOperationId);
        const hash = intentHash(input);
        const previous = await tx.findOperation(actorUserId, input.clientOperationId);
        if (previous) {
          if (previous.action !== operationAction || previous.payloadHash !== hash)
            throw new Error("La clave de operación ya fue usada con otros datos.");
          return { state: "submitted" };
        }

        const staff = await tx.lockStaff(input.staffId);
        if (!staff?.isActive) throw new Error("El agente seleccionado no está activo.");
        const serviceDay = await tx.serviceDay();
        if (!validDate(serviceDay)) throw new Error("No se pudo validar el día de servicio.");
        if (input.compensatoryDate < serviceDay)
          throw new Error("La fecha solicitada no puede ser una fecha pasada.");

        const matches = await tx.findPotentialDuplicates(
          staff.id,
          input.compensatoryDate,
          requestedMinutes,
        );
        if (matches.length && !input.confirmDuplicate) {
          return { state: "duplicate_review_required", matches };
        }

        const classifiedAt = new Date();
        const request = await tx.insertRequest({
          clientOperationId: input.clientOperationId,
          staffId: staff.id,
          requesterEmail: input.requesterEmail,
          requesterMobile: input.requesterMobile,
          compensatoryDate: input.compensatoryDate,
          hours: input.hours,
          submittedAt: classifiedAt.toISOString(),
          requesterName: staff.name,
          requesterEmailVerifiedAt: null,
          createdByUserId: actorUserId,
          submissionSource: "admin",
          phase: "pending",
          version: 2,
          requestedDate: input.compensatoryDate,
          requestedMinutes,
          classifiedAt,
          classifiedByUserId: actorUserId,
        });
        await tx.insertRequestAudit({
          requestId: request.id,
          actorUserId,
          actorName: actor.name,
          actorKind: "admin",
          action: "classified",
          occurredAt: classifiedAt,
          reason: input.reason,
          versionBefore: 1,
          versionAfter: 2,
          detail: {
            source: "admin",
            requesterEmailVerified: false,
            clientOperationId: input.clientOperationId,
          },
        });
        await tx.insertOperation(
          actorUserId,
          input.clientOperationId,
          operationAction,
          hash,
          request.id,
        );
        return { state: "submitted" };
      });
    },
  };
}
