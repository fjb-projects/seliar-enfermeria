import { createHash } from "node:crypto";
import { formatRequestedHours } from "./compensatory-email-template";
import type { CompensatoryActor, StaffRecord } from "./compensatory-bank.server";
import type {
  CompensatoryRequestInput,
  CompensatoryRequestRecord,
} from "./compensatory-requests.server";

export type CompensatoryRequestPhase =
  "unclassified" | "pending" | "approved" | "rejected" | "cancelled" | "consumed";
export type CompensatoryJsonValue =
  | string
  | number
  | boolean
  | null
  | CompensatoryJsonValue[]
  | { [key: string]: CompensatoryJsonValue };
export type CompensatoryLifecycleRequest = CompensatoryRequestRecord & {
  requesterEmail?: string | null;
  requesterEmailVerifiedAt?: Date | null;
  submissionSource?: "admin" | "public";
  phase: CompensatoryRequestPhase;
  version: number;
  requestedDate: string | null;
  requestedMinutes: number | null;
  classifiedAt: Date | null;
  classifiedByUserId: string | null;
  decisionAt: Date | null;
  decisionByUserId: string | null;
  decisionReason: string | null;
  cancelledAt: Date | null;
  cancellationByUserId: string | null;
  cancellationReason: string | null;
  consumedAt: Date | null;
  consumptionLedgerId: string | null;
};
export type CompensatoryLifecycleAudit = {
  id: string;
  requestId: string;
  actorUserId: string | null;
  actorName: string;
  actorKind: "admin" | "system";
  action: "classified" | "approved" | "rejected" | "cancelled" | "consumed";
  occurredAt: Date;
  reason: string;
  versionBefore: number;
  versionAfter: number;
  detail: { [key: string]: CompensatoryJsonValue };
};
export type CompensatoryLifecycleLedger = {
  id: string;
  staffId: string;
  kind: "request_consumption";
  minutes: number;
  effectiveDate: string;
  reason: string;
  actorUserId: null;
  actorName: string;
  actorKind: "system";
  createdAt: Date;
  balanceBeforeMinutes: number;
  balanceAfterMinutes: number;
  reversesEntryId: null;
  requestId: string;
};
export type LifecycleOperation = { payloadHash: string; resultId: string };
export type CompensatoryDecisionNotification = {
  id: string;
  requestId: string;
  decisionVersion: number;
  decision: "approved" | "rejected";
  recipientKind: "requester" | "admin";
  recipient: string | null;
  status: "pending_review" | "pending_recipient";
  reason: string;
  subject: string;
  text: string;
  createdAt: Date;
};

export interface CompensatoryLifecycleTransaction {
  findActor(userId: string): Promise<CompensatoryActor | null>;
  listStaff(): Promise<StaffRecord[]>;
  lockStaff(staffId: string): Promise<StaffRecord | null>;
  findRequest(requestId: string): Promise<CompensatoryLifecycleRequest | null>;
  lockRequest(requestId: string): Promise<CompensatoryLifecycleRequest | null>;
  listRequests(staffId?: string): Promise<CompensatoryLifecycleRequest[]>;
  listRequestAudits(requestIds: string[]): Promise<CompensatoryLifecycleAudit[]>;
  lockOperation(actorUserId: string, operationId: string): Promise<void>;
  findOperation(actorUserId: string, operationId: string): Promise<LifecycleOperation | null>;
  insertOperation(
    actorUserId: string,
    operationId: string,
    action: string,
    payloadHash: string,
    resultId: string,
  ): Promise<void>;
  updateRequest(
    requestId: string,
    expectedVersion: number,
    changes: Partial<CompensatoryLifecycleRequest>,
  ): Promise<void>;
  insertRequestAudit(audit: CompensatoryLifecycleAudit): Promise<void>;
  insertDecisionNotification(notification: CompensatoryDecisionNotification): Promise<void>;
  reservedMinutes(staffId: string): Promise<number>;
  updateStaffBalance(staffId: string, balanceMinutes: number): Promise<void>;
  insertConsumptionLedger(entry: CompensatoryLifecycleLedger): Promise<void>;
  dueRequests(day: string): Promise<Array<Pick<CompensatoryLifecycleRequest, "id" | "staffId">>>;
  databaseNow(): Promise<Date>;
  serviceDay(): Promise<string>;
}
export interface CompensatoryLifecycleStore {
  transaction<T>(work: (tx: CompensatoryLifecycleTransaction) => Promise<T>): Promise<T>;
}

const maxMinutes = 2_147_483_647;
const timeZone = "America/Argentina/Buenos_Aires" as const;
function reason(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 1000)
    throw new Error("El motivo es obligatorio y debe tener hasta 1000 caracteres.");
  return normalized;
}
function validVersion(value: number) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error("La versión de la solicitud no es válida.");
}
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("La fecha efectiva no es válida.");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    throw new Error("La fecha efectiva no es válida.");
}
function payloadHash(action: string, payload: unknown) {
  return createHash("sha256").update(JSON.stringify({ action, payload })).digest("hex");
}

export function createCompensatoryLifecycleService(
  store: CompensatoryLifecycleStore,
  newId: () => string = () => crypto.randomUUID(),
) {
  async function admin(tx: CompensatoryLifecycleTransaction, actorId: string) {
    const actor = await tx.findActor(actorId);
    if (!actor?.isActive || !actor.isAdmin) throw new Error("Se requiere administración vigente.");
    return actor;
  }
  async function replay(
    tx: CompensatoryLifecycleTransaction,
    actorId: string,
    operationId: string,
    action: string,
    payload: unknown,
  ) {
    if (!operationId) throw new Error("El identificador de operación no es válido.");
    await tx.lockOperation(actorId, operationId);
    const hash = payloadHash(action, payload);
    const previous = await tx.findOperation(actorId, operationId);
    if (previous) {
      if (previous.payloadHash !== hash)
        throw new Error("La clave de operación ya fue usada con otros datos.");
      return previous.resultId;
    }
    return null;
  }
  async function recordOperation(
    tx: CompensatoryLifecycleTransaction,
    actorId: string,
    operationId: string,
    action: string,
    payload: unknown,
    resultId: string,
  ) {
    await tx.insertOperation(actorId, operationId, action, payloadHash(action, payload), resultId);
  }
  async function consume(
    tx: CompensatoryLifecycleTransaction,
    request: CompensatoryLifecycleRequest,
    actor: { id: string | null; name: string; kind: "admin" | "system" },
    why: string,
  ) {
    if (!request.requestedDate || !request.requestedMinutes)
      throw new Error("La solicitud aprobada no tiene una clasificación válida.");
    const staff = await tx.lockStaff(request.staffId);
    if (!staff) throw new Error("No se encontró el agente.");
    const locked = await tx.lockRequest(request.id);
    if (!locked || locked.phase !== "approved" || locked.version !== request.version) return locked;
    const before = staff.balanceMinutes;
    const after = before - request.requestedMinutes;
    if (after < 0) throw new Error("El saldo no alcanza para efectivizar la solicitud aprobada.");
    const consumedAt = await tx.databaseNow();
    const ledgerId = newId();
    await tx.insertConsumptionLedger({
      id: ledgerId,
      staffId: staff.id,
      kind: "request_consumption",
      minutes: -request.requestedMinutes,
      effectiveDate: request.requestedDate,
      reason: why,
      actorUserId: null,
      actorName: actor.name,
      actorKind: "system",
      createdAt: consumedAt,
      balanceBeforeMinutes: before,
      balanceAfterMinutes: after,
      reversesEntryId: null,
      requestId: request.id,
    });
    await tx.updateStaffBalance(staff.id, after);
    const consumed: CompensatoryLifecycleRequest = {
      ...locked,
      phase: "consumed",
      consumedAt,
      consumptionLedgerId: ledgerId,
      version: locked.version + 1,
    };
    await tx.updateRequest(locked.id, locked.version, {
      phase: consumed.phase,
      consumedAt,
      consumptionLedgerId: ledgerId,
      version: consumed.version,
    });
    await tx.insertRequestAudit({
      id: newId(),
      requestId: locked.id,
      actorUserId: actor.id,
      actorName: actor.name,
      actorKind: actor.kind,
      action: "consumed",
      occurredAt: consumedAt,
      reason: why,
      versionBefore: locked.version,
      versionAfter: consumed.version,
      detail: {
        requestedDate: locked.requestedDate,
        requestedMinutes: locked.requestedMinutes,
        ledgerId,
      },
    });
    return consumed;
  }
  return {
    async getWorkspace(actorId: string, staffId?: string) {
      return store.transaction(async (tx) => {
        await admin(tx, actorId);
        const [staff, requests, serviceDay] = await Promise.all([
          tx.listStaff(),
          tx.listRequests(staffId),
          tx.serviceDay(),
        ]);
        const staffRows = staffId ? staff.filter((item) => item.id === staffId) : staff;
        const reservedByStaff = new Map<string, number>();
        await Promise.all(
          staffRows.map(async (item) =>
            reservedByStaff.set(item.id, await tx.reservedMinutes(item.id)),
          ),
        );
        const audits = await tx.listRequestAudits(requests.map((request) => request.id));
        return {
          serviceDay,
          timeZone,
          staff: staffRows.map((item) => {
            const reservedMinutes = reservedByStaff.get(item.id) ?? 0;
            return {
              ...item,
              balanceMinutes: item.balanceMinutes,
              reservedMinutes,
              availableMinutes: Math.max(0, item.balanceMinutes - reservedMinutes),
            };
          }),
          requests,
          audits,
        };
      });
    },
    async classify(
      actorId: string,
      input: {
        requestId: string;
        expectedVersion: number;
        requestedDate: string;
        minutes: number;
        reason: string;
        clientOperationId: string;
      },
    ) {
      validVersion(input.expectedVersion);
      validDate(input.requestedDate);
      if (!Number.isSafeInteger(input.minutes) || input.minutes < 1 || input.minutes > maxMinutes)
        throw new Error("La cantidad de minutos debe ser un entero positivo válido.");
      const why = reason(input.reason);
      const payload = {
        requestId: input.requestId,
        expectedVersion: input.expectedVersion,
        requestedDate: input.requestedDate,
        minutes: input.minutes,
        reason: why,
      };
      return store.transaction(async (tx) => {
        const actor = await admin(tx, actorId);
        const previous = await replay(
          tx,
          actorId,
          input.clientOperationId,
          "classify_request",
          payload,
        );
        if (previous) return { id: previous };
        const initial = await tx.findRequest(input.requestId);
        if (!initial) throw new Error("No se encontró la solicitud.");
        const staff = await tx.lockStaff(initial.staffId);
        if (!staff) throw new Error("No se encontró el agente.");
        const request = await tx.lockRequest(initial.id);
        if (!request) throw new Error("No se encontró la solicitud.");
        if (request.version !== input.expectedVersion)
          throw new Error("La solicitud cambió; actualiza la lista.");
        if (request.phase !== "unclassified")
          throw new Error("Solo se pueden clasificar solicitudes sin resolver.");
        if (input.requestedDate < (await tx.serviceDay()))
          throw new Error("No se admiten fechas pasadas para nuevas solicitudes.");
        const classifiedAt = await tx.databaseNow();
        await tx.updateRequest(request.id, request.version, {
          phase: "pending",
          requestedDate: input.requestedDate,
          requestedMinutes: input.minutes,
          classifiedAt,
          classifiedByUserId: actorId,
          version: request.version + 1,
        });
        await tx.insertRequestAudit({
          id: newId(),
          requestId: request.id,
          actorUserId: actorId,
          actorName: actor.name,
          actorKind: "admin",
          action: "classified",
          occurredAt: classifiedAt,
          reason: why,
          versionBefore: request.version,
          versionAfter: request.version + 1,
          detail: { requestedDate: input.requestedDate, requestedMinutes: input.minutes },
        });
        await recordOperation(
          tx,
          actorId,
          input.clientOperationId,
          "classify_request",
          payload,
          request.id,
        );
        return { id: request.id };
      });
    },
    async decide(
      actorId: string,
      input: {
        requestId: string;
        expectedVersion: number;
        decision: "approve" | "reject";
        reason: string;
        clientOperationId: string;
      },
    ) {
      validVersion(input.expectedVersion);
      const why = reason(input.reason);
      const payload = {
        requestId: input.requestId,
        expectedVersion: input.expectedVersion,
        decision: input.decision,
        reason: why,
      };
      return store.transaction(async (tx) => {
        const actor = await admin(tx, actorId);
        const previous = await replay(
          tx,
          actorId,
          input.clientOperationId,
          `decide_${input.decision}`,
          payload,
        );
        if (previous) return { id: previous };
        const initial = await tx.findRequest(input.requestId);
        if (!initial) throw new Error("No se encontró la solicitud.");
        const staff = await tx.lockStaff(initial.staffId);
        if (!staff) throw new Error("No se encontró el agente.");
        const request = await tx.lockRequest(initial.id);
        if (!request) throw new Error("No se encontró la solicitud.");
        if (request.version !== input.expectedVersion)
          throw new Error("La solicitud cambió; actualiza la lista.");
        if (request.phase !== "pending" || !request.requestedDate || !request.requestedMinutes)
          throw new Error("La solicitud no está pendiente de decisión.");
        const nowDay = await tx.serviceDay();
        if (request.requestedDate < nowDay)
          throw new Error("No se pueden aprobar solicitudes con fecha pasada.");
        if (input.decision === "approve") {
          if (!staff.isActive)
            throw new Error("No se pueden aprobar solicitudes de agentes inactivos.");
          const reserved = await tx.reservedMinutes(staff.id);
          if (staff.balanceMinutes - reserved < request.requestedMinutes)
            throw new Error("El saldo disponible no alcanza para aprobar esta solicitud.");
        }
        const decidedAt = await tx.databaseNow();
        const phase = input.decision === "approve" ? "approved" : "rejected";
        const updated: CompensatoryLifecycleRequest = {
          ...request,
          phase,
          decisionAt: decidedAt,
          decisionByUserId: actorId,
          decisionReason: why,
          version: request.version + 1,
        };
        await tx.updateRequest(request.id, request.version, {
          phase,
          decisionAt: decidedAt,
          decisionByUserId: actorId,
          decisionReason: why,
          version: updated.version,
        });
        await tx.insertRequestAudit({
          id: newId(),
          requestId: request.id,
          actorUserId: actorId,
          actorName: actor.name,
          actorKind: "admin",
          action: input.decision === "approve" ? "approved" : "rejected",
          occurredAt: decidedAt,
          reason: why,
          versionBefore: request.version,
          versionAfter: updated.version,
          detail: {
            requestedDate: request.requestedDate,
            requestedMinutes: request.requestedMinutes,
          },
        });
        const decisionLabel = phase === "approved" ? "aprobada" : "rechazada";
        const requesterText = [
          `Hola ${request.requesterName},`,
          "",
          `Tu solicitud de compensatorio fue ${decisionLabel}.`,
          "",
          `Fecha solicitada: ${request.requestedDate}`,
          `Horas solicitadas: ${formatRequestedHours(request.requestedMinutes)}`,
          "",
          `Fundamento: ${why}`,
          "",
          "Este mensaje comunica la resolución registrada por Coordinación.",
        ].join("\n");
        const adminText = [
          "Se registró una resolución de solicitud de horas compensatorias.",
          `Solicitud: ${request.id}`,
          `Agente: ${request.requesterName}`,
          `Resolución: ${decisionLabel}`,
          `Fecha solicitada: ${request.requestedDate}`,
          `Horas solicitadas: ${formatRequestedHours(request.requestedMinutes)}`,
          `Fundamento: ${why}`,
        ].join("\n");
        for (const [recipientKind, recipient] of [
          ["requester", request.requesterEmail ?? null],
          ["admin", null],
        ] as const) {
          await tx.insertDecisionNotification({
            id: newId(),
            requestId: request.id,
            decisionVersion: updated.version,
            decision: phase,
            recipientKind,
            recipient,
            status: recipient ? "pending_review" : "pending_recipient",
            reason: why,
            subject: `Resolución de solicitud de horas compensatorias: ${decisionLabel}`,
            text: recipientKind === "requester" ? requesterText : adminText,
            createdAt: decidedAt,
          });
        }
        if (phase === "approved" && request.requestedDate === nowDay)
          await consume(
            tx,
            updated,
            { id: null, name: "Compensatory settlement service", kind: "system" },
            "Efectivización inmediata para solicitud del día.",
          );
        await recordOperation(
          tx,
          actorId,
          input.clientOperationId,
          `decide_${input.decision}`,
          payload,
          request.id,
        );
        return { id: request.id };
      });
    },
    async cancel(
      actorId: string,
      input: {
        requestId: string;
        expectedVersion: number;
        reason: string;
        clientOperationId: string;
      },
    ) {
      validVersion(input.expectedVersion);
      const why = reason(input.reason);
      const payload = {
        requestId: input.requestId,
        expectedVersion: input.expectedVersion,
        reason: why,
      };
      return store.transaction(async (tx) => {
        const actor = await admin(tx, actorId);
        const previous = await replay(
          tx,
          actorId,
          input.clientOperationId,
          "cancel_request",
          payload,
        );
        if (previous) return { id: previous };
        const initial = await tx.findRequest(input.requestId);
        if (!initial) throw new Error("No se encontró la solicitud.");
        const staff = await tx.lockStaff(initial.staffId);
        if (!staff) throw new Error("No se encontró el agente.");
        const request = await tx.lockRequest(initial.id);
        if (!request) throw new Error("No se encontró la solicitud.");
        if (request.version !== input.expectedVersion)
          throw new Error("La solicitud cambió; actualiza la lista.");
        if (request.phase !== "pending" && request.phase !== "approved")
          throw new Error("Solo se pueden cancelar solicitudes pendientes o aprobadas.");
        if (
          request.phase === "approved" &&
          request.requestedDate &&
          request.requestedDate <= (await tx.serviceDay())
        )
          throw new Error(
            "No se puede cancelar una solicitud después de su hora de efectivización.",
          );
        const cancelledAt = await tx.databaseNow();
        await tx.updateRequest(request.id, request.version, {
          phase: "cancelled",
          cancelledAt,
          cancellationByUserId: actorId,
          cancellationReason: why,
          version: request.version + 1,
        });
        await tx.insertRequestAudit({
          id: newId(),
          requestId: request.id,
          actorUserId: actorId,
          actorName: actor.name,
          actorKind: "admin",
          action: "cancelled",
          occurredAt: cancelledAt,
          reason: why,
          versionBefore: request.version,
          versionAfter: request.version + 1,
          detail: { previousPhase: request.phase },
        });
        await recordOperation(
          tx,
          actorId,
          input.clientOperationId,
          "cancel_request",
          payload,
          request.id,
        );
        return { id: request.id };
      });
    },
    async processDue() {
      const ids = await store.transaction(async (tx) => tx.dueRequests(await tx.serviceDay()));
      let consumed = 0;
      for (const candidate of ids) {
        const wasConsumed = await store.transaction(async (tx) => {
          const staff = await tx.lockStaff(candidate.staffId);
          if (!staff) return false;
          const request = await tx.lockRequest(candidate.id);
          if (
            !request ||
            request.phase !== "approved" ||
            !request.requestedDate ||
            request.requestedDate > (await tx.serviceDay())
          )
            return false;
          const result = await consume(
            tx,
            request,
            { id: null, name: "Compensatory settlement service", kind: "system" },
            "Consumo automático al alcanzar la fecha efectiva.",
          );
          return result?.phase === "consumed";
        });
        if (wasConsumed) consumed++;
      }
      return { consumed };
    },
  };
}
