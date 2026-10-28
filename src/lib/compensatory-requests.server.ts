export type CompensatoryRequestInput = {
  clientOperationId: string;
  staffId: string;
  submittedAt: string;
  requesterName: string;
  requesterMobile: string;
  compensatoryDate: string;
  hours: string;
};

export type CompensatoryRequestRecord = CompensatoryRequestInput & {
  id: string;
  createdAt: Date;
};
export type CompensatoryRequestOperation = {
  request: CompensatoryRequestRecord;
  createdByUserId: string;
};

export type CompensatoryRequestActor = { isActive: boolean; isAdmin: boolean };

export interface CompensatoryRequestsTransaction {
  findActor(userId: string): Promise<CompensatoryRequestActor | null>;
  hasStaff(staffId: string): Promise<boolean>;
  listRequests(staffId?: string): Promise<CompensatoryRequestRecord[]>;
  lockOperation(actorUserId: string, operationId: string): Promise<void>;
  findOperation(
    actorUserId: string,
    operationId: string,
  ): Promise<CompensatoryRequestOperation | null>;
  lockDuplicateKey(input: CompensatoryRequestInput): Promise<void>;
  listDuplicates(input: CompensatoryRequestInput): Promise<CompensatoryRequestRecord[]>;
  insertRequest(
    actorUserId: string,
    input: CompensatoryRequestInput,
  ): Promise<CompensatoryRequestRecord>;
}

export interface CompensatoryRequestsStore {
  transaction<T>(work: (tx: CompensatoryRequestsTransaction) => Promise<T>): Promise<T>;
}

export type CompensatoryRequestInsertResult =
  | { status: "stored"; request: CompensatoryRequestRecord }
  | { status: "duplicate_review_required"; matches: CompensatoryRequestRecord[] };

function ensureAdmin(actor: CompensatoryRequestActor | null) {
  if (!actor?.isActive || !actor.isAdmin) throw new Error("Se requiere administración vigente.");
}

function validateInput(input: CompensatoryRequestInput) {
  const fields: Array<[string, string, number]> = [
    ["clientOperationId", input.clientOperationId, 36],
    ["staffId", input.staffId, 36],
    ["submittedAt", input.submittedAt, 500],
    ["requesterName", input.requesterName, 300],
    ["requesterMobile", input.requesterMobile, 300],
    ["compensatoryDate", input.compensatoryDate, 300],
    ["hours", input.hours, 100],
  ];
  for (const [name, value, max] of fields) {
    if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
      throw new Error(`El campo ${name} no es válido.`);
    }
  }
}

export function createCompensatoryRequestsService(store: CompensatoryRequestsStore) {
  return {
    async listRequests(actorUserId: string, staffId?: string) {
      return store.transaction(async (tx) => {
        ensureAdmin(await tx.findActor(actorUserId));
        return tx.listRequests(staffId);
      });
    },

    async insertRequests(
      actorUserId: string,
      input: CompensatoryRequestInput & { confirmDuplicate?: boolean | undefined },
    ): Promise<CompensatoryRequestInsertResult> {
      validateInput(input);
      return store.transaction(async (tx) => {
        ensureAdmin(await tx.findActor(actorUserId));
        if (!(await tx.hasStaff(input.staffId)))
          throw new Error("No se encontró el agente asociado.");

        const { confirmDuplicate = false, ...request } = input;
        await tx.lockOperation(actorUserId, request.clientOperationId);
        const previous = await tx.findOperation(actorUserId, request.clientOperationId);
        if (previous) {
          const fields: Array<keyof CompensatoryRequestInput> = [
            "staffId",
            "submittedAt",
            "requesterName",
            "requesterMobile",
            "compensatoryDate",
            "hours",
          ];
          if (fields.some((field) => previous.request[field] !== request[field])) {
            throw new Error("El identificador de operación ya fue usado con otros datos.");
          }
          return { status: "stored", request: previous.request };
        }
        await tx.lockDuplicateKey(request);
        const matches = await tx.listDuplicates(request);
        if (matches.length && !confirmDuplicate) {
          return { status: "duplicate_review_required", matches };
        }
        if (!matches.length && confirmDuplicate) {
          throw new Error("No hay duplicados pendientes de confirmación.");
        }
        return { status: "stored", request: await tx.insertRequest(actorUserId, request) };
      });
    },
  };
}
