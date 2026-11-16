import { createHash } from "node:crypto";
import type { StaffAuditRecord, StaffRecord } from "./compensatory-bank.server";

export type CompensatoryStaffDeletionArchive = {
  staffId: string;
  staffSnapshot: StaffRecord;
  priorAudits: StaffAuditRecord[];
  actorUserId: string;
  actorName: string;
  occurredAt: Date;
  reason: string;
  operationId: string;
};

export type CompensatoryStaffDeleteOperation = { payloadHash: string; resultId: string };
export type CompensatoryStaffDeleteActor = {
  isActive: boolean;
  isAdmin: boolean;
  name: string;
};

export interface CompensatoryStaffDeleteTransaction {
  findActor(userId: string): Promise<CompensatoryStaffDeleteActor | null>;
  lockOperation(actorUserId: string, operationId: string): Promise<void>;
  findOperation(
    actorUserId: string,
    operationId: string,
  ): Promise<CompensatoryStaffDeleteOperation | null>;
  insertOperation(
    actorUserId: string,
    operationId: string,
    payloadHash: string,
    resultId: string,
  ): Promise<void>;
  lockStaff(staffId: string): Promise<StaffRecord | null>;
  hasRequests(staffId: string): Promise<boolean>;
  hasLedgerEntries(staffId: string): Promise<boolean>;
  listAudits(staffId: string): Promise<StaffAuditRecord[]>;
  insertDeletionArchive(archive: CompensatoryStaffDeletionArchive): Promise<void>;
  deleteAudits(staffId: string): Promise<void>;
  deleteStaff(staffId: string, expectedVersion: number): Promise<void>;
  databaseNow(): Promise<Date>;
}

export interface CompensatoryStaffDeleteStore {
  transaction<T>(work: (tx: CompensatoryStaffDeleteTransaction) => Promise<T>): Promise<T>;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fingerprint(payload: unknown) {
  return createHash("sha256")
    .update(JSON.stringify({ action: "delete_staff", payload }))
    .digest("hex");
}

function normalizedInput(input: {
  staffId: string;
  expectedVersion: number;
  reason: string;
  clientOperationId: string;
}) {
  if (!uuid.test(input.staffId)) throw new Error("El identificador del agente no es válido.");
  if (!uuid.test(input.clientOperationId))
    throw new Error("El identificador de operación debe ser un UUID válido.");
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1)
    throw new Error("La versión de la ficha no es válida.");
  const reason = input.reason.trim();
  if (!reason || reason.length > 1000)
    throw new Error("El motivo es obligatorio y debe tener hasta 1000 caracteres.");
  return { ...input, reason };
}

export function createCompensatoryStaffDeleteService(store: CompensatoryStaffDeleteStore) {
  return {
    async deleteStaff(
      actorUserId: string,
      rawInput: {
        staffId: string;
        expectedVersion: number;
        reason: string;
        clientOperationId: string;
      },
    ): Promise<{ id: string }> {
      const input = normalizedInput(rawInput);
      const payloadHash = fingerprint({
        staffId: input.staffId,
        expectedVersion: input.expectedVersion,
        reason: input.reason,
      });

      return store.transaction(async (tx) => {
        const actor = await tx.findActor(actorUserId);
        if (!actor?.isActive || !actor.isAdmin)
          throw new Error("Se requiere administración vigente.");

        await tx.lockOperation(actorUserId, input.clientOperationId);
        const prior = await tx.findOperation(actorUserId, input.clientOperationId);
        if (prior) {
          if (prior.payloadHash !== payloadHash)
            throw new Error("La clave de operación ya fue usada con otros datos.");
          return { id: prior.resultId };
        }

        const staff = await tx.lockStaff(input.staffId);
        if (!staff) throw new Error("No se encontró el agente.");
        if (staff.version !== input.expectedVersion)
          throw new Error("La ficha cambió; actualiza la lista.");
        if (await tx.hasRequests(staff.id))
          throw new Error("No se puede eliminar un agente con solicitudes registradas.");
        if (await tx.hasLedgerEntries(staff.id))
          throw new Error("No se puede eliminar un agente con movimientos registrados.");

        const priorAudits = await tx.listAudits(staff.id);
        await tx.insertDeletionArchive({
          staffId: staff.id,
          staffSnapshot: staff,
          priorAudits,
          actorUserId,
          actorName: actor.name,
          occurredAt: await tx.databaseNow(),
          reason: input.reason,
          operationId: input.clientOperationId,
        });
        await tx.deleteAudits(staff.id);
        await tx.deleteStaff(staff.id, input.expectedVersion);
        await tx.insertOperation(actorUserId, input.clientOperationId, payloadHash, staff.id);
        return { id: staff.id };
      });
    },
  };
}
