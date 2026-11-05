import { createHash } from "node:crypto";
import type { StaffAuditRecord, StaffRecord } from "./compensatory-bank.server";

export type RequestEmailPromotionRequest = {
  id: string;
  staffId: string;
  requesterEmail: string | null;
  submissionSource: "admin" | "public";
};
export type RequestEmailPromotionActor = { isActive: boolean; isAdmin: boolean; name: string };
export interface RequestEmailPromotionTransaction {
  findActor(userId: string): Promise<RequestEmailPromotionActor | null>;
  findRequest(requestId: string): Promise<RequestEmailPromotionRequest | null>;
  lockStaff(staffId: string): Promise<StaffRecord | null>;
  updateStaffEmail(staffId: string, expectedVersion: number, email: string): Promise<void>;
  insertStaffAudit(audit: StaffAuditRecord): Promise<void>;
  lockOperation(actorId: string, operationId: string): Promise<void>;
  findOperation(actorId: string, operationId: string): Promise<{ payloadHash: string; resultId: string } | null>;
  insertOperation(actorId: string, operationId: string, payloadHash: string, resultId: string): Promise<void>;
  databaseNow(): Promise<Date>;
}
export interface RequestEmailPromotionStore {
  transaction<T>(work: (tx: RequestEmailPromotionTransaction) => Promise<T>): Promise<T>;
}

export function createRequestEmailPromotionService(
  store: RequestEmailPromotionStore,
  newId: () => string = () => crypto.randomUUID(),
) {
  return {
    async addRequestEmailToProfile(actorId: string, input: {
      requestId: string;
      expectedVersion: number;
      reason: string;
      clientOperationId: string;
    }): Promise<{ id: string }> {
      const reason = input.reason.trim();
      if (!reason || reason.length > 1000) throw new Error("El motivo es obligatorio y debe tener hasta 1000 caracteres.");
      if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new Error("La versión de la ficha no es válida.");
      return store.transaction(async (tx) => {
        const actor = await tx.findActor(actorId);
        if (!actor?.isActive || !actor.isAdmin) throw new Error("Se requiere administración vigente.");
        const request = await tx.findRequest(input.requestId);
        if (!request || request.submissionSource !== "public" || !request.requesterEmail)
          throw new Error("La solicitud no tiene un correo de contacto para revisar.");
        const email = request.requesterEmail.trim().toLowerCase();
        if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("El correo de contacto no es válido.");
        const payloadHash = createHash("sha256").update(JSON.stringify({ requestId: request.id, expectedVersion: input.expectedVersion, reason })).digest("hex");
        await tx.lockOperation(actorId, input.clientOperationId);
        const prior = await tx.findOperation(actorId, input.clientOperationId);
        if (prior) {
          if (prior.payloadHash !== payloadHash) throw new Error("La clave de operación ya fue usada con otros datos.");
          return { id: prior.resultId };
        }
        const before = await tx.lockStaff(request.staffId);
        if (!before) throw new Error("No se encontró el agente.");
        if (before.version !== input.expectedVersion) throw new Error("La ficha cambió; actualiza la lista.");
        if (before.email?.trim()) throw new Error("La ficha ya tiene un correo; no se modificó.");
        const afterVersion = before.version + 1;
        await tx.updateStaffEmail(before.id, before.version, email);
        await tx.insertStaffAudit({
          id: newId(), staffId: before.id, actorUserId: actorId, actorName: actor.name,
          createdAt: await tx.databaseNow(), reason, operationId: input.clientOperationId,
          action: "updated", versionBefore: before.version, versionAfter: afterVersion,
          before: { email: before.email, version: before.version },
          after: { email, version: afterVersion },
        });
        await tx.insertOperation(actorId, input.clientOperationId, payloadHash, before.id);
        return { id: before.id };
      });
    },
  };
}
