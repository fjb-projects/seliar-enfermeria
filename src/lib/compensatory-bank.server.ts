import { createHash } from "node:crypto";

export const staffDirectoryKeys = [
  "registrationNumber",
  "employmentStatus",
  "jobRole",
  "region",
  "contactPhone",
  "workplace",
  "operationalStatus",
  "operationalRole",
] as const;

export type StaffDirectoryKey = (typeof staffDirectoryKeys)[number];
export type StaffDirectoryFields = Record<StaffDirectoryKey, string | null>;
type StaffDirectoryInput = Partial<Record<StaffDirectoryKey, string | null | undefined>>;

export type StaffRecord = {
  id: string;
  dni: string;
  name: string;
  email: string | null;
  isActive: boolean;
  monthlyLimitMinutes: number;
  version: number;
  balanceMinutes: number;
  createdAt: Date;
} & Partial<StaffDirectoryFields>;

export type LedgerKind = "opening" | "credit" | "debit" | "reversal";

export type StaffAuditState = {
  dni?: string;
  name?: string;
  email?: string | null;
  isActive?: boolean;
  monthlyLimitMinutes?: number;
  registrationNumber?: string | null;
  employmentStatus?: string | null;
  jobRole?: string | null;
  region?: string | null;
  contactPhone?: string | null;
  workplace?: string | null;
  operationalStatus?: string | null;
  operationalRole?: string | null;
  version?: number;
};

export type LedgerRecord = {
  id: string;
  staffId: string;
  kind: LedgerKind;
  minutes: number;
  effectiveDate: string;
  reason: string;
  actorUserId: string;
  actorName: string;
  createdAt: Date;
  balanceBeforeMinutes: number;
  balanceAfterMinutes: number;
  reversesEntryId: string | null;
};

export type StaffAuditRecord = {
  id: string;
  staffId: string;
  actorUserId: string;
  actorName: string;
  createdAt: Date;
  reason: string;
  operationId: string;
  action: "created" | "updated";
  versionBefore: number | null;
  versionAfter: number;
  before: StaffAuditState | null;
  after: StaffAuditState;
};

export type StaffView = Omit<StaffRecord, "createdAt"> & { createdAt: string };
export type LedgerView = Omit<LedgerRecord, "createdAt"> & { createdAt: string };
export type StaffAuditView = {
  id: string;
  staffId: string;
  actorUserId: string;
  actorName: string;
  createdAt: string;
  reason: string;
  before: StaffAuditState | null;
  after: StaffAuditState;
};

export type CompensatoryActor = { isActive: boolean; isAdmin: boolean; name: string };
export type CompensatoryOperation = { payloadHash: string; resultId: string };

export interface CompensatoryBankTransaction {
  findActor(userId: string): Promise<CompensatoryActor | null>;
  listStaff(): Promise<StaffRecord[]>;
  findStaff(id: string): Promise<StaffRecord | null>;
  findStaffByDni(dni: string): Promise<StaffRecord | null>;
  insertStaff(staff: StaffRecord): Promise<void>;
  updateStaff(id: string, version: number, changes: Partial<StaffRecord>): Promise<void>;
  updateBalance(id: string, balanceMinutes: number): Promise<void>;
  listLedger(staffId: string): Promise<LedgerRecord[]>;
  listAudits(staffId: string): Promise<StaffAuditRecord[]>;
  findLedger(id: string): Promise<LedgerRecord | null>;
  insertLedger(entry: LedgerRecord): Promise<void>;
  insertAudit(audit: StaffAuditRecord): Promise<void>;
  lockDni(dni: string): Promise<void>;
  lockOperation(actorUserId: string, clientOperationId: string): Promise<void>;
  findOperation(
    actorUserId: string,
    clientOperationId: string,
  ): Promise<CompensatoryOperation | null>;
  insertOperation(
    actorUserId: string,
    clientOperationId: string,
    action: string,
    payloadHash: string,
    resultId: string,
  ): Promise<void>;
  lockStaff(staffId: string): Promise<StaffRecord | null>;
  databaseNow(): Promise<Date>;
  serviceDay(): Promise<string>;
  reservedMinutes(staffId: string): Promise<number>;
}

export interface CompensatoryBankStore {
  transaction<T>(work: (tx: CompensatoryBankTransaction) => Promise<T>): Promise<T>;
}

const maxInteger = 2_147_483_647;

export function canonicalizeDni(value: string): string {
  if (typeof value !== "string" || !/^[\d.\s]+$/.test(value)) {
    throw new Error("El DNI debe contener solo números, puntos o espacios.");
  }
  const dni = value.replace(/[.\s]/g, "");
  if (!/^\d{7,8}$/.test(dni)) throw new Error("El DNI ingresado no es válido.");
  return dni;
}

function normalizedName(value: string) {
  const name = value.trim();
  if (!name || name.length > 160)
    throw new Error("El nombre es obligatorio y debe tener hasta 160 caracteres.");
  return name;
}

function normalizedEmail(value: string | undefined) {
  const email = value?.trim() ?? "";
  if (!email) return null;
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("El correo ingresado no es válido.");
  }
  return email.toLowerCase();
}

function assertMinutes(value: number, allowZero = false) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > maxInteger) {
    throw new Error("La cantidad de minutos debe ser un entero positivo válido.");
  }
}

function assertDate(value: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("La fecha efectiva no es válida.");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("La fecha efectiva no es válida.");
  }
  if (value > today) throw new Error("No se permiten movimientos con fecha futura.");
}

function normalizedReason(value: string) {
  const reason = value.trim();
  if (!reason || reason.length > 1000)
    throw new Error("El motivo es obligatorio y debe tener hasta 1000 caracteres.");
  return reason;
}

function normalizedDirectoryFields(input: StaffDirectoryInput): Partial<StaffDirectoryFields> {
  const result: Partial<StaffDirectoryFields> = {};
  for (const key of staffDirectoryKeys) {
    if (!Object.hasOwn(input, key)) continue;
    const value = input[key];
    if (value == null) {
      result[key] = null;
      continue;
    }
    const normalized = value.trim();
    if (normalized.length > 300)
      throw new Error("Los datos de ficha deben tener hasta 300 caracteres.");
    result[key] = normalized || null;
  }
  return result;
}

function directoryAuditFields(staff: StaffRecord): StaffDirectoryFields {
  return Object.fromEntries(
    staffDirectoryKeys.map((key) => [key, staff[key] ?? null]),
  ) as StaffDirectoryFields;
}

function fingerprint(action: string, payload: unknown) {
  return createHash("sha256").update(JSON.stringify({ action, payload })).digest("hex");
}

function staffView(staff: StaffRecord): StaffView {
  return { ...staff, createdAt: staff.createdAt.toISOString() };
}

function ledgerView(entry: LedgerRecord): LedgerView {
  return { ...entry, createdAt: entry.createdAt.toISOString() };
}

function auditView(audit: StaffAuditRecord): StaffAuditView {
  return {
    id: audit.id,
    staffId: audit.staffId,
    actorUserId: audit.actorUserId,
    actorName: audit.actorName,
    createdAt: audit.createdAt.toISOString(),
    reason: audit.reason,
    before: audit.before,
    after: audit.after,
  };
}

export function createCompensatoryBankService(
  store: CompensatoryBankStore,
  newId: () => string = () => crypto.randomUUID(),
) {
  async function authorize(tx: CompensatoryBankTransaction, userId: string) {
    const actor = await tx.findActor(userId);
    if (!actor?.isActive) throw new Error("La cuenta está inactiva o no existe.");
    if (!actor.isAdmin) throw new Error("Se requiere administración.");
    return actor;
  }

  async function operation(
    tx: CompensatoryBankTransaction,
    actorUserId: string,
    clientOperationId: string,
    action: string,
    payload: unknown,
    work: () => Promise<{ id: string }>,
  ): Promise<{ id: string }> {
    await tx.lockOperation(actorUserId, clientOperationId);
    const payloadHash = fingerprint(action, payload);
    const prior = await tx.findOperation(actorUserId, clientOperationId);
    if (prior) {
      if (prior.payloadHash !== payloadHash)
        throw new Error("La clave de operación ya fue usada con otros datos.");
      if (
        (action === "create_staff" || action === "update_staff") &&
        !(await tx.findStaff(prior.resultId))
      ) {
        throw new Error("No se encontró el agente.");
      }
      return { id: prior.resultId };
    }
    const result = await work();
    await tx.insertOperation(actorUserId, clientOperationId, action, payloadHash, result.id);
    return result;
  }

  async function lockedStaff(tx: CompensatoryBankTransaction, id: string) {
    const staff = await tx.lockStaff(id);
    if (!staff) throw new Error("No se encontró el agente.");
    return staff;
  }

  async function appendLedger(
    tx: CompensatoryBankTransaction,
    input: Omit<LedgerRecord, "createdAt">,
  ) {
    await tx.insertLedger({ ...input, createdAt: await tx.databaseNow() });
    await tx.updateBalance(input.staffId, input.balanceAfterMinutes);
  }

  return {
    async listStaff(userId: string): Promise<StaffView[]> {
      return store.transaction(async (tx) => {
        await authorize(tx, userId);
        return (await tx.listStaff()).map(staffView);
      });
    },

    async getHistory(
      userId: string,
      staffId: string,
    ): Promise<{ entries: LedgerView[]; changes: StaffAuditView[] }> {
      return store.transaction(async (tx) => {
        await authorize(tx, userId);
        if (!(await tx.findStaff(staffId))) throw new Error("No se encontró el agente.");
        const [entries, changes] = await Promise.all([
          tx.listLedger(staffId),
          tx.listAudits(staffId),
        ]);
        return {
          entries: entries.map(ledgerView),
          changes: changes.map(auditView),
        };
      });
    },

    async createStaff(
      userId: string,
      input: {
        dni: string;
        name: string;
        email?: string | undefined;
        monthlyLimitMinutes?: number | undefined;
        clientOperationId: string;
      } & StaffDirectoryInput,
    ): Promise<{ id: string }> {
      const dni = canonicalizeDni(input.dni);
      const name = normalizedName(input.name);
      const email = normalizedEmail(input.email);
      const monthlyLimitMinutes = input.monthlyLimitMinutes ?? 1440;
      assertMinutes(monthlyLimitMinutes);
      const directoryFields = normalizedDirectoryFields(input);
      const payload = { dni, name, email, monthlyLimitMinutes, ...directoryFields };
      return store.transaction(async (tx) => {
        const actor = await authorize(tx, userId);
        return operation(tx, userId, input.clientOperationId, "create_staff", payload, async () => {
          await tx.lockDni(dni);
          if (await tx.findStaffByDni(dni)) throw new Error("Ya existe un agente con ese DNI.");
          const id = newId();
          const createdAt = await tx.databaseNow();
          const staff: StaffRecord = {
            id,
            dni,
            name,
            email,
            isActive: true,
            monthlyLimitMinutes,
            version: 1,
            balanceMinutes: 0,
            createdAt,
            ...Object.fromEntries(staffDirectoryKeys.map((key) => [key, null])),
            ...directoryFields,
          };
          await tx.insertStaff(staff);
          await tx.insertAudit({
            id: newId(),
            staffId: id,
            actorUserId: userId,
            actorName: actor.name,
            createdAt,
            operationId: input.clientOperationId,
            action: "created",
            versionBefore: null,
            versionAfter: 1,
            reason: "Alta del agente",
            before: null,
            after: {
              dni,
              name,
              email,
              isActive: true,
              monthlyLimitMinutes,
              ...directoryAuditFields(staff),
              version: 1,
            },
          });
          return { id };
        });
      });
    },

    async updateStaff(
      userId: string,
      input: {
        staffId: string;
        name: string;
        email?: string | undefined;
        isActive: boolean;
        monthlyLimitMinutes: number;
        expectedVersion: number;
        reason: string;
        clientOperationId: string;
      } & StaffDirectoryInput,
    ): Promise<{ id: string }> {
      const name = normalizedName(input.name);
      const email = normalizedEmail(input.email);
      assertMinutes(input.monthlyLimitMinutes);
      const reason = normalizedReason(input.reason);
      const directoryFields = normalizedDirectoryFields(input);
      if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1)
        throw new Error("La versión de la ficha no es válida.");
      const payload = {
        staffId: input.staffId,
        name,
        email,
        isActive: input.isActive,
        monthlyLimitMinutes: input.monthlyLimitMinutes,
        expectedVersion: input.expectedVersion,
        reason,
        ...directoryFields,
      };
      return store.transaction(async (tx) => {
        const actor = await authorize(tx, userId);
        return operation(tx, userId, input.clientOperationId, "update_staff", payload, async () => {
          const before = await lockedStaff(tx, input.staffId);
          if (before.version !== input.expectedVersion)
            throw new Error("La ficha cambió; actualiza la lista.");
          const after = {
            ...before,
            name,
            email,
            isActive: input.isActive,
            monthlyLimitMinutes: input.monthlyLimitMinutes,
            version: before.version + 1,
            ...directoryFields,
          };
          const beforeAuditState = {
            name: before.name,
            email: before.email,
            isActive: before.isActive,
            monthlyLimitMinutes: before.monthlyLimitMinutes,
            ...directoryAuditFields(before),
            version: before.version,
          };
          const afterAuditState = {
            name: after.name,
            email: after.email,
            isActive: after.isActive,
            monthlyLimitMinutes: after.monthlyLimitMinutes,
            ...directoryAuditFields(after),
            version: after.version,
          };
          await tx.updateStaff(before.id, before.version, {
            name,
            email,
            isActive: input.isActive,
            monthlyLimitMinutes: input.monthlyLimitMinutes,
            version: after.version,
            ...directoryFields,
          });
          await tx.insertAudit({
            id: newId(),
            staffId: before.id,
            actorUserId: userId,
            actorName: actor.name,
            createdAt: await tx.databaseNow(),
            reason,
            operationId: input.clientOperationId,
            action: "updated",
            versionBefore: before.version,
            versionAfter: after.version,
            before: beforeAuditState,
            after: afterAuditState,
          });
          return { id: before.id };
        });
      });
    },

    async recordMovement(
      userId: string,
      input: {
        staffId: string;
        kind: "opening" | "credit" | "debit";
        minutes: number;
        reason: string;
        effectiveDate: string;
        clientOperationId: string;
      },
    ): Promise<{ id: string }> {
      const reason = normalizedReason(input.reason);
      assertMinutes(input.minutes, input.kind === "opening");
      const payload = {
        staffId: input.staffId,
        kind: input.kind,
        minutes: input.minutes,
        reason,
        effectiveDate: input.effectiveDate,
      };
      return store.transaction(async (tx) => {
        const actor = await authorize(tx, userId);
        return operation(
          tx,
          userId,
          input.clientOperationId,
          `movement_${input.kind}`,
          payload,
          async () => {
            const staff = await lockedStaff(tx, input.staffId);
            if (!staff.isActive)
              throw new Error("Reactiva al agente antes de registrar movimientos.");
            assertDate(input.effectiveDate, await tx.serviceDay());
            const entries = await tx.listLedger(staff.id);
            if (input.kind === "opening" && entries.length)
              throw new Error("El saldo inicial solo puede ser el primer movimiento.");
            if (input.kind === "opening" && input.minutes === 0) return { id: newId() };
            const delta = input.kind === "debit" ? -input.minutes : input.minutes;
            const after = staff.balanceMinutes + delta;
            if (after < 0) throw new Error("El débito supera el saldo disponible.");
            if (input.kind === "debit" && after < (await tx.reservedMinutes(staff.id)))
              throw new Error("El débito supera el saldo disponible después de las reservas.");
            if (after > maxInteger) throw new Error("El saldo supera el máximo registrable.");
            const id = newId();
            await appendLedger(tx, {
              id,
              staffId: staff.id,
              kind: input.kind,
              minutes: delta,
              effectiveDate: input.effectiveDate,
              reason,
              actorUserId: userId,
              actorName: actor.name,
              balanceBeforeMinutes: staff.balanceMinutes,
              balanceAfterMinutes: after,
              reversesEntryId: null,
            });
            return { id };
          },
        );
      });
    },

    async reverseMovement(
      userId: string,
      input: {
        staffId: string;
        entryId: string;
        reason: string;
        effectiveDate: string;
        clientOperationId: string;
      },
    ): Promise<{ id: string }> {
      const reason = normalizedReason(input.reason);
      const payload = {
        staffId: input.staffId,
        entryId: input.entryId,
        reason,
        effectiveDate: input.effectiveDate,
      };
      return store.transaction(async (tx) => {
        const actor = await authorize(tx, userId);
        return operation(
          tx,
          userId,
          input.clientOperationId,
          "reverse_movement",
          payload,
          async () => {
            const staff = await lockedStaff(tx, input.staffId);
            if (!staff.isActive)
              throw new Error("Reactiva al agente antes de registrar movimientos.");
            assertDate(input.effectiveDate, await tx.serviceDay());
            const entries = await tx.listLedger(staff.id);
            const original = await tx.findLedger(input.entryId);
            if (!original || original.staffId !== staff.id)
              throw new Error("No se encontró el movimiento.");
            if (
              original.kind === "reversal" ||
              entries.some((entry) => entry.reversesEntryId === original.id)
            ) {
              throw new Error("El movimiento ya fue revertido o no se puede revertir.");
            }
            const delta = -original.minutes;
            const after = staff.balanceMinutes + delta;
            if (after < 0) throw new Error("La reversión supera el saldo disponible.");
            if (delta < 0 && after < (await tx.reservedMinutes(staff.id)))
              throw new Error("La reversión supera el saldo disponible después de las reservas.");
            if (after > maxInteger) throw new Error("El saldo supera el máximo registrable.");
            const id = newId();
            await appendLedger(tx, {
              id,
              staffId: staff.id,
              kind: "reversal",
              minutes: delta,
              effectiveDate: input.effectiveDate,
              reason,
              actorUserId: userId,
              actorName: actor.name,
              balanceBeforeMinutes: staff.balanceMinutes,
              balanceAfterMinutes: after,
              reversesEntryId: original.id,
            });
            return { id };
          },
        );
      });
    },
  };
}
