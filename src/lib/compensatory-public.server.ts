import { createHash } from "node:crypto";

export type PublicCompensatoryAgent = { id: string; name: string; hasProfileEmail: boolean };
export type PublicCompensatoryInput = {
  clientOperationId: string;
  staffId: string;
  requesterEmail: string;
  requesterMobile: string;
  compensatoryDate: string;
  hours: string;
};
export type PublicCompensatoryRequest = PublicCompensatoryInput & {
  clientPayloadHash?: string | null;
  id: string;
  submittedAt: string;
  requesterName: string;
  requesterEmailVerifiedAt: Date | null;
  createdByUserId: null;
  submissionSource: "public";
  phase: "pending";
  version: 1;
  requestedDate: string;
  requestedMinutes: number;
  classifiedAt: null;
  classifiedByUserId: null;
  createdAt: Date;
};
type PublicStaff = { id: string; name: string; email: string | null; isActive: boolean };

export interface PublicCompensatoryTransaction {
  listActiveStaff(): Promise<PublicStaff[]>;
  lockStaff(staffId: string): Promise<PublicStaff | null>;
  serviceDay(): Promise<string>;
  lockOperation(operationId: string): Promise<void>;
  findOperation(operationId: string): Promise<PublicCompensatoryRequest | null>;
  insertRequest(input: Omit<PublicCompensatoryRequest, "id" | "createdAt">): Promise<PublicCompensatoryRequest>;
}
export interface PublicCompensatoryStore {
  transaction<T>(work: (tx: PublicCompensatoryTransaction) => Promise<T>): Promise<T>;
}

function isIsoCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const maxRequestedMinutes = 2_147_483_647;

function parseRequestedMinutes(hours: string): number {
  const match = /^(\d+)(?:[.,](\d+))?$/.exec(hours);
  if (!match) throw new Error("La cantidad de horas no es válida.");
  const whole = BigInt(match[1]!);
  const fractionText = match[2] ?? "";
  const denominator = 10n ** BigInt(fractionText.length);
  const numeratorHours = whole * denominator + BigInt(fractionText || "0");
  const numeratorMinutes = numeratorHours * 60n;
  if (numeratorMinutes === 0n || numeratorMinutes % denominator !== 0n)
    throw new Error("La cantidad de horas debe equivaler a un número entero de minutos.");
  const minutes = numeratorMinutes / denominator;
  if (minutes > BigInt(maxRequestedMinutes))
    throw new Error("La cantidad de horas supera el máximo admitido.");
  return Number(minutes);
}

function validate(input: PublicCompensatoryInput): PublicCompensatoryInput {
  const normalized = {
    ...input,
    clientOperationId: input.clientOperationId.toLowerCase(),
    staffId: input.staffId.toLowerCase(),
    requesterEmail: input.requesterEmail.trim(),
    requesterMobile: input.requesterMobile.trim(),
    compensatoryDate: input.compensatoryDate.trim(),
    hours: input.hours.trim(),
  };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.clientOperationId))
    throw new Error("El identificador de operación no es válido.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.staffId))
    throw new Error("No se encontró el agente asociado.");
  if (normalized.requesterEmail.length > 255 || (normalized.requesterEmail !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.requesterEmail)))
    throw new Error("El correo electrónico no es válido.");
  if (!normalized.requesterMobile || normalized.requesterMobile.length > 300)
    throw new Error("El teléfono móvil no es válido.");
  if (!isIsoCalendarDate(normalized.compensatoryDate))
    throw new Error("La fecha solicitada no es válida.");
  if (normalized.hours.length > 100) throw new Error("La cantidad de horas no es válida.");
  parseRequestedMinutes(normalized.hours);
  return normalized;
}

function officialNameKey(name: string) {
  return name.trim().normalize("NFC").replace(/\s+/g, " ").toLocaleLowerCase("es");
}

function payloadHash(input: PublicCompensatoryInput) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function existingPayload(request: PublicCompensatoryRequest): PublicCompensatoryInput {
  return {
    clientOperationId: request.clientOperationId,
    staffId: request.staffId,
    requesterEmail: request.requesterEmail,
    requesterMobile: request.requesterMobile,
    compensatoryDate: request.compensatoryDate,
    hours: request.hours,
  };
}

export function createPublicCompensatoryService(store: PublicCompensatoryStore) {
  return {
    async listPublicCompensatoryAgents(): Promise<PublicCompensatoryAgent[]> {
      return store.transaction(async (tx) => {
        const activeStaff = await tx.listActiveStaff();
        const counts = new Map<string, number>();
        for (const agent of activeStaff) {
          const key = officialNameKey(agent.name);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return activeStaff
          .filter((agent) => counts.get(officialNameKey(agent.name)) === 1)
          .map(({ id, name, email }) => ({ id, name, hasProfileEmail: Boolean(email?.trim()) }));
      });
    },

    async submitPublicCompensatoryRequest(rawInput: PublicCompensatoryInput): Promise<{ state: "submitted" }> {
      const input = validate(rawInput);
      const clientPayloadHash = payloadHash(input);
      return store.transaction(async (tx) => {
        await tx.lockOperation(input.clientOperationId);
        const existing = await tx.findOperation(input.clientOperationId);
        if (existing) {
          const matchesStoredIntent = existing.clientPayloadHash
            ? existing.clientPayloadHash === clientPayloadHash
            : payloadHash(existingPayload(existing)) === clientPayloadHash;
          if (!matchesStoredIntent)
            throw new Error("El identificador de operación ya fue usado con otros datos.");
          return { state: "submitted" };
        }

        const selected = await tx.lockStaff(input.staffId);
        if (!selected?.isActive) throw new Error("No se pudo identificar el agente seleccionado.");
        const activeStaff = await tx.listActiveStaff();
        const normalizedName = officialNameKey(selected.name);
        if (activeStaff.filter((agent) => officialNameKey(agent.name) === normalizedName).length !== 1)
          throw new Error("No se pudo identificar el agente seleccionado.");
        const requesterEmail = selected.email?.trim() || input.requesterEmail;
        if (!requesterEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail) || requesterEmail.length > 255)
          throw new Error("El correo electrónico no es válido.");
        const serviceDay = await tx.serviceDay();
        if (!isIsoCalendarDate(serviceDay)) throw new Error("No se pudo validar el día de servicio.");
        if (input.compensatoryDate < serviceDay)
          throw new Error("La fecha solicitada no puede ser una fecha pasada.");

        const submittedAt = new Date().toISOString();
        const requestedMinutes = parseRequestedMinutes(input.hours);
        await tx.insertRequest({
          ...input,
          clientPayloadHash,
          requesterEmail,
          submittedAt,
          requesterName: selected.name,
          requesterEmailVerifiedAt: null,
          createdByUserId: null,
          submissionSource: "public",
          phase: "pending",
          version: 1,
          requestedDate: input.compensatoryDate,
          requestedMinutes,
          classifiedAt: null,
          classifiedByUserId: null,
        });
        return { state: "submitted" };
      });
    },
  };
}
