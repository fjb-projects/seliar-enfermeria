import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createCompensatoryBankService,
  type CompensatoryBankStore,
  type CompensatoryBankTransaction,
  type LedgerRecord,
  type StaffAuditRecord,
  type StaffRecord,
} from "./compensatory-bank.server";

const admin = { isActive: true, isAdmin: true, name: "Coordination" };
const nonAdmin = { isActive: true, isAdmin: false, name: "Nurse" };
const fixedNow = new Date("2026-10-27T15:00:00.000Z");

function createStore(): CompensatoryBankStore & {
  staff: StaffRecord[];
  ledger: LedgerRecord[];
  audits: StaffAuditRecord[];
  operations: Map<string, { payloadHash: string; resultId: string }>;
  setActor(id: string, actor: typeof admin): void;
  setReserved(staffId: string, minutes: number): void;
  hash(): string;
} {
  let staff: StaffRecord[] = [];
  let ledger: LedgerRecord[] = [];
  let audits: StaffAuditRecord[] = [];
  const operations = new Map<string, { payloadHash: string; resultId: string }>();
  const reservations = new Map<string, number>();
  const actors = new Map([
    ["admin", admin],
    ["nurse", nonAdmin],
  ]);
  const mutex = { tail: Promise.resolve() };
  const transaction: CompensatoryBankTransaction = {
    async findActor(id) {
      return actors.get(id) ?? null;
    },
    async listStaff() {
      return staff.slice();
    },
    async findStaff(id) {
      return staff.find((item) => item.id === id) ?? null;
    },
    async findStaffByDni(dni) {
      return staff.find((item) => item.dni === dni) ?? null;
    },
    async insertStaff(item) {
      staff.push(item);
    },
    async updateStaff(id, version, changes) {
      const found = staff.find((item) => item.id === id);
      if (!found || found.version !== version)
        throw new Error("La ficha cambió; actualiza la lista.");
      Object.assign(found, changes);
    },
    async updateBalance(id, balanceMinutes) {
      const found = staff.find((item) => item.id === id);
      if (!found) throw new Error("missing staff");
      found.balanceMinutes = balanceMinutes;
    },
    async listLedger(id) {
      return ledger.filter((item) => item.staffId === id).slice();
    },
    async listAudits(id) {
      return audits.filter((item) => item.staffId === id);
    },
    async findLedger(id) {
      return ledger.find((item) => item.id === id) ?? null;
    },
    async insertLedger(item) {
      ledger.push(item);
    },
    async insertAudit(item) {
      audits.push(item);
    },
    async lockOperation() {},
    async lockDni() {},
    async findOperation(actorId, key) {
      return operations.get(`${actorId}:${key}`) ?? null;
    },
    async insertOperation(actorId, key, _action, payloadHash, resultId) {
      operations.set(`${actorId}:${key}`, { payloadHash, resultId });
    },
    async lockStaff(id) {
      return staff.find((item) => item.id === id) ?? null;
    },
    async databaseNow() {
      return new Date(fixedNow);
    },
    async serviceDay() {
      return "2026-10-27";
    },
    async reservedMinutes(staffId) {
      return reservations.get(staffId) ?? 0;
    },
  };
  const store: CompensatoryBankStore = {
    async transaction(work) {
      let release!: () => void;
      const previous = mutex.tail;
      mutex.tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      const snapshot = structuredClone({ staff, ledger, audits, operations: [...operations] });
      try {
        return await work(transaction);
      } catch (error) {
        staff = snapshot.staff;
        ledger = snapshot.ledger;
        audits = snapshot.audits;
        operations.clear();
        snapshot.operations.forEach(([key, value]) => operations.set(key, value));
        throw error;
      } finally {
        release();
      }
    },
  };
  return Object.defineProperties(store, {
    staff: { get: () => staff },
    ledger: { get: () => ledger },
    audits: { get: () => audits },
    operations: { value: operations },
    setActor: { value: (id: string, actor: typeof admin) => actors.set(id, actor) },
    setReserved: {
      value: (staffId: string, minutes: number) => reservations.set(staffId, minutes),
    },
    hash: { value: () => JSON.stringify({ staff, ledger, audits, operations: [...operations] }) },
  }) as CompensatoryBankStore & {
    staff: StaffRecord[];
    ledger: LedgerRecord[];
    audits: StaffAuditRecord[];
    operations: Map<string, { payloadHash: string; resultId: string }>;
    setActor(id: string, actor: typeof admin): void;
    setReserved(staffId: string, minutes: number): void;
    hash(): string;
  };
}

function setup() {
  const store = createStore();
  let id = 0;
  const service = createCompensatoryBankService(store, () => `id-${++id}`);
  return { store, service };
}

const createInput = (dni = "12.345.678", clientOperationId = "op-1") => ({
  dni,
  name: "  Ana Pérez  ",
  monthlyLimitMinutes: 1440,
  clientOperationId,
});

describe("compensatory bank service", () => {
  it("canonicalizes DNI and rejects duplicates, including inactive staff, without writes", async () => {
    const { service, store } = setup();
    const first = await service.createStaff("admin", createInput());
    await service.updateStaff("admin", {
      staffId: first.id,
      name: "Ana Pérez",
      isActive: false,
      monthlyLimitMinutes: 1440,
      expectedVersion: 1,
      reason: "Baja administrativa",
      clientOperationId: "op-2",
    });
    const before = store.hash();
    await expect(
      service.recordMovement("admin", {
        staffId: first.id,
        kind: "credit",
        minutes: 1,
        reason: "Horas existentes",
        effectiveDate: "2026-10-27",
        clientOperationId: "inactive-credit",
      }),
    ).rejects.toThrow("Reactiva al agente");
    expect(store.hash()).toBe(before);
    await expect(service.createStaff("admin", createInput("12345678", "op-3"))).rejects.toThrow(
      "DNI",
    );
    expect(store.hash()).toBe(before);
    expect(store.staff[0]?.dni).toBe("12345678");
  });

  it("rejects malformed DNI and non-admin actors without any mutation", async () => {
    const { service, store } = setup();
    const before = store.hash();
    await expect(service.createStaff("admin", createInput("12X345678"))).rejects.toThrow();
    await expect(service.createStaff("nurse", createInput("12345678"))).rejects.toThrow(
      "administración",
    );
    store.setActor("inactive-admin", { isActive: false, isAdmin: true, name: "Former Admin" });
    await expect(service.createStaff("inactive-admin", createInput("12345678"))).rejects.toThrow(
      "inactiva",
    );
    await expect(service.createStaff("missing", createInput("12345678"))).rejects.toThrow(
      "inactiva",
    );
    expect(store.hash()).toBe(before);
  });

  it("keeps an audit trail and permits zero opening balance to be omitted", async () => {
    const { service, store } = setup();
    const { id } = await service.createStaff("admin", createInput("12345678"));
    await service.recordMovement("admin", {
      staffId: id,
      kind: "opening",
      minutes: 0,
      reason: "Sin saldo inicial",
      effectiveDate: "2026-10-27",
      clientOperationId: "opening-zero",
    });
    expect(store.ledger).toHaveLength(0);
    expect(store.audits).toHaveLength(1);
    await service.recordMovement("admin", {
      staffId: id,
      kind: "credit",
      minutes: 75,
      reason: "Horas existentes verificadas",
      effectiveDate: "2026-10-27",
      clientOperationId: "credit-1",
    });
    const history = await service.getHistory("admin", id);
    expect(history.entries[0]).toMatchObject({
      minutes: 75,
      balanceBeforeMinutes: 0,
      balanceAfterMinutes: 75,
      actorName: "Coordination",
    });
    expect(history.entries[0]?.createdAt).toBe(fixedNow.toISOString());
    expect(history.entries[0]?.effectiveDate).toBe("2026-10-27");
  });

  it("allows exact debit but rejects overdraw and leaves every store table unchanged", async () => {
    const { service, store } = setup();
    const { id } = await service.createStaff("admin", createInput("12345678"));
    await service.recordMovement("admin", {
      staffId: id,
      kind: "opening",
      minutes: 120,
      reason: "Saldo comprobado",
      effectiveDate: "2026-10-27",
      clientOperationId: "opening",
    });
    const before = store.hash();
    await expect(
      service.recordMovement("admin", {
        staffId: id,
        kind: "debit",
        minutes: 121,
        reason: "Ajuste",
        effectiveDate: "2026-10-27",
        clientOperationId: "debit-over",
      }),
    ).rejects.toThrow("saldo");
    expect(store.hash()).toBe(before);
    await service.recordMovement("admin", {
      staffId: id,
      kind: "debit",
      minutes: 120,
      reason: "Ajuste operativo",
      effectiveDate: "2026-10-27",
      clientOperationId: "debit-exact",
    });
    expect((await service.listStaff("admin")).at(0)?.balanceMinutes).toBe(0);
  });

  it("protects approved request reservations from manual debit and credit reversal", async () => {
    const { service, store } = setup();
    const { id } = await service.createStaff("admin", createInput("12345678"));
    const credit = await service.recordMovement("admin", {
      staffId: id,
      kind: "credit",
      minutes: 200,
      reason: "Horas acreditadas",
      effectiveDate: "2026-10-27",
      clientOperationId: "reserved-credit",
    });
    store.setReserved(id, 120);
    const before = store.hash();
    await expect(
      service.recordMovement("admin", {
        staffId: id,
        kind: "debit",
        minutes: 81,
        reason: "Débito que invade reserva",
        effectiveDate: "2026-10-27",
        clientOperationId: "reserved-debit",
      }),
    ).rejects.toThrow("reservas");
    await expect(
      service.reverseMovement("admin", {
        staffId: id,
        entryId: credit.id,
        reason: "Reversión que invade reserva",
        effectiveDate: "2026-10-27",
        clientOperationId: "reserved-reversal",
      }),
    ).rejects.toThrow("reservas");
    expect(store.hash()).toBe(before);
  });

  it("rejects an integer-balance overflow without altering records", async () => {
    const { service, store } = setup();
    const { id } = await service.createStaff("admin", createInput("12345678"));
    await service.recordMovement("admin", {
      staffId: id,
      kind: "opening",
      minutes: 2_147_483_647,
      reason: "Saldo verificado",
      effectiveDate: "2026-10-27",
      clientOperationId: "max-opening",
    });
    const before = store.hash();
    await expect(
      service.recordMovement("admin", {
        staffId: id,
        kind: "credit",
        minutes: 1,
        reason: "Exceso",
        effectiveDate: "2026-10-27",
        clientOperationId: "overflow-credit",
      }),
    ).rejects.toThrow("máximo");
    expect(store.hash()).toBe(before);
  });

  it("replays an identical operation, rejects key collisions, and serializes concurrent debits", async () => {
    const { service, store } = setup();
    const { id } = await service.createStaff("admin", createInput("12345678"));
    await service.recordMovement("admin", {
      staffId: id,
      kind: "opening",
      minutes: 100,
      reason: "Saldo",
      effectiveDate: "2026-10-27",
      clientOperationId: "opening",
    });
    const input = {
      staffId: id,
      kind: "debit" as const,
      minutes: 80,
      reason: "Uso",
      effectiveDate: "2026-10-27",
      clientOperationId: "same-key",
    };
    const [one, retry] = await Promise.all([
      service.recordMovement("admin", input),
      service.recordMovement("admin", input),
    ]);
    expect(retry).toEqual(one);
    await expect(service.recordMovement("admin", { ...input, minutes: 90 })).rejects.toThrow(
      "clave",
    );
    expect(store.ledger.filter((item) => item.kind === "debit")).toHaveLength(1);
    await expect(
      Promise.all([
        service.recordMovement("admin", { ...input, minutes: 15, clientOperationId: "debit-a" }),
        service.recordMovement("admin", { ...input, minutes: 15, clientOperationId: "debit-b" }),
      ]),
    ).rejects.toThrow("saldo");
    expect((await service.listStaff("admin")).at(0)?.balanceMinutes).toBe(5);
  });

  it("reverses an entry once, blocks overdrawn credit reversal, and refuses future dates", async () => {
    const { service, store } = setup();
    const { id } = await service.createStaff("admin", createInput("12345678"));
    const credit = await service.recordMovement("admin", {
      staffId: id,
      kind: "credit",
      minutes: 100,
      reason: "Horas existentes",
      effectiveDate: "2026-10-27",
      clientOperationId: "credit",
    });
    const debit = await service.recordMovement("admin", {
      staffId: id,
      kind: "debit",
      minutes: 50,
      reason: "Uso",
      effectiveDate: "2026-10-27",
      clientOperationId: "debit",
    });
    const before = store.hash();
    await expect(
      service.reverseMovement("admin", {
        staffId: id,
        entryId: credit.id,
        reason: "Corrección",
        effectiveDate: "2026-10-27",
        clientOperationId: "reverse-credit",
      }),
    ).rejects.toThrow("saldo");
    expect(store.hash()).toBe(before);
    const reversal = await service.reverseMovement("admin", {
      staffId: id,
      entryId: debit.id,
      reason: "Corrección",
      effectiveDate: "2026-10-27",
      clientOperationId: "reverse-debit",
    });
    expect(
      (await service.getHistory("admin", id)).entries.find((entry) => entry.id === reversal.id),
    ).toMatchObject({ kind: "reversal", minutes: 50, reversesEntryId: debit.id });
    const after = store.hash();
    await expect(
      service.reverseMovement("admin", {
        staffId: id,
        entryId: debit.id,
        reason: "Otra",
        effectiveDate: "2026-10-27",
        clientOperationId: "reverse-again",
      }),
    ).rejects.toThrow("revertid");
    await expect(
      service.reverseMovement("admin", {
        staffId: id,
        entryId: reversal.id,
        reason: "Reversión de reversión",
        effectiveDate: "2026-10-27",
        clientOperationId: "reverse-reversal",
      }),
    ).rejects.toThrow("revertir");
    await expect(
      service.recordMovement("admin", {
        staffId: id,
        kind: "credit",
        minutes: 1,
        reason: "Futuro",
        effectiveDate: "2026-10-28",
        clientOperationId: "future",
      }),
    ).rejects.toThrow("futura");
    expect(store.hash()).toBe(after);
  });

  it("requires an expected profile version and audited reason, without a monthly hard cap", async () => {
    const { service, store } = setup();
    const { id } = await service.createStaff("admin", createInput("12345678"));
    await service.recordMovement("admin", {
      staffId: id,
      kind: "credit",
      minutes: 10_000,
      reason: "Horas registradas",
      effectiveDate: "2026-10-27",
      clientOperationId: "large-credit",
    });
    const before = store.hash();
    await expect(
      service.updateStaff("admin", {
        staffId: id,
        name: "Ana",
        isActive: true,
        monthlyLimitMinutes: 2000,
        expectedVersion: 1,
        reason: "",
        clientOperationId: "update-empty",
      }),
    ).rejects.toThrow();
    await expect(
      service.updateStaff("admin", {
        staffId: id,
        name: "Ana",
        isActive: true,
        monthlyLimitMinutes: 2000,
        expectedVersion: 2,
        reason: "Referencia",
        clientOperationId: "update-stale",
      }),
    ).rejects.toThrow("cambió");
    expect(store.hash()).toBe(before);
    await service.updateStaff("admin", {
      staffId: id,
      name: "Ana",
      isActive: true,
      monthlyLimitMinutes: 2000,
      expectedVersion: 1,
      reason: "Nueva referencia",
      clientOperationId: "update-ok",
    });
    expect((await service.listStaff("admin")).at(0)?.monthlyLimitMinutes).toBe(2000);
    expect(store.audits).toHaveLength(2);
  });

  it("creates and updates optional directory fields without changing the hours ledger", async () => {
    const { service, store } = setup();
    const created = await service.createStaff("admin", {
      ...createInput("12345678", "profile-create"),
      registrationNumber: "  REG-42  ",
      employmentStatus: "  Titular ",
      jobRole: "  Enfermera ",
      region: " Norte ",
      contactPhone: "  11-5555  ",
      workplace: " Sala A ",
      operationalStatus: " Activo ",
      operationalRole: " Coordinación ",
    });

    expect(store.staff[0]).toMatchObject({
      registrationNumber: "REG-42",
      employmentStatus: "Titular",
      jobRole: "Enfermera",
      region: "Norte",
      contactPhone: "11-5555",
      workplace: "Sala A",
      operationalStatus: "Activo",
      operationalRole: "Coordinación",
      isActive: true,
      balanceMinutes: 0,
    });
    expect(store.audits[0]?.after).toMatchObject({
      registrationNumber: "REG-42",
      employmentStatus: "Titular",
      jobRole: "Enfermera",
      region: "Norte",
      contactPhone: "11-5555",
      workplace: "Sala A",
      operationalStatus: "Activo",
      operationalRole: "Coordinación",
    });

    const beforeLedger = structuredClone(store.ledger);
    await service.updateStaff("admin", {
      staffId: created.id,
      name: "Ana Pérez",
      isActive: true,
      monthlyLimitMinutes: 1440,
      expectedVersion: 1,
      reason: "Actualización de ficha",
      clientOperationId: "profile-update",
      contactPhone: null,
      workplace: "  ",
      operationalRole: null,
    });

    expect((await service.listStaff("admin"))[0]).toMatchObject({
      registrationNumber: "REG-42",
      employmentStatus: "Titular",
      jobRole: "Enfermera",
      region: "Norte",
      contactPhone: null,
      workplace: null,
      operationalStatus: "Activo",
      operationalRole: null,
      balanceMinutes: 0,
    });
    expect(store.audits[1]?.before).toMatchObject({
      registrationNumber: "REG-42",
      contactPhone: "11-5555",
      workplace: "Sala A",
      operationalRole: "Coordinación",
    });
    expect(store.audits[1]?.after).toMatchObject({
      registrationNumber: "REG-42",
      contactPhone: null,
      workplace: null,
      operationalRole: null,
    });
    expect(store.ledger).toEqual(beforeLedger);
    expect(
      await service.createStaff("admin", { ...createInput("12345679", "legacy-create") }),
    ).toEqual({
      id: store.staff[1]?.id,
    });
    expect(store.staff[1]).toMatchObject({
      registrationNumber: null,
      employmentStatus: null,
      jobRole: null,
      region: null,
      contactPhone: null,
      workplace: null,
      operationalStatus: null,
      operationalRole: null,
    });
  });

  it("rejects overlong directory values without changing stored state", async () => {
    const { service, store } = setup();
    const created = await service.createStaff("admin", createInput("12345678"));
    const before = store.hash();
    await expect(
      service.updateStaff("admin", {
        staffId: created.id,
        name: "Ana Pérez",
        isActive: true,
        monthlyLimitMinutes: 1440,
        expectedVersion: 1,
        reason: "Ficha",
        clientOperationId: "too-long-profile",
        region: "x".repeat(301),
      }),
    ).rejects.toThrow();
    expect(store.hash()).toBe(before);
  });

  it("replays legacy create and update fingerprints when directory keys were omitted", async () => {
    const { service, store } = setup();
    const existing = await service.createStaff("admin", createInput("12345678", "seed"));
    const createPayload = {
      dni: "12345679",
      name: "Ana Pérez",
      email: null,
      monthlyLimitMinutes: 1440,
    };
    store.operations.set("admin:old-create-operation", {
      payloadHash: createHash("sha256")
        .update(JSON.stringify({ action: "create_staff", payload: createPayload }))
        .digest("hex"),
      resultId: existing.id,
    });
    const before = store.hash();
    await expect(
      service.createStaff("admin", createInput("12345679", "old-create-operation")),
    ).resolves.toEqual({ id: existing.id });
    expect(store.hash()).toBe(before);

    const updatePayload = {
      staffId: existing.id,
      name: "Ana Pérez",
      email: null,
      isActive: true,
      monthlyLimitMinutes: 1440,
      expectedVersion: 1,
      reason: "Actualización",
    };
    store.operations.set("admin:old-update-operation", {
      payloadHash: createHash("sha256")
        .update(JSON.stringify({ action: "update_staff", payload: updatePayload }))
        .digest("hex"),
      resultId: existing.id,
    });
    await expect(
      service.updateStaff("admin", {
        staffId: existing.id,
        name: "Ana Pérez",
        isActive: true,
        monthlyLimitMinutes: 1440,
        expectedVersion: 1,
        reason: "Actualización",
        clientOperationId: "old-update-operation",
      }),
    ).resolves.toEqual({ id: existing.id });
    expect(store.staff[0]?.version).toBe(1);
  });

  it("does not report success when a prior create or update operation points to deleted staff", async () => {
    const { service, store } = setup();
    const created = await service.createStaff("admin", createInput("12345678", "old-create"));
    store.staff.splice(0, store.staff.length);
    await expect(
      service.createStaff("admin", createInput("12345678", "old-create")),
    ).rejects.toThrow("No se encontró el agente");

    const recreated = await service.createStaff("admin", createInput("12345678", "new-create"));
    await service.updateStaff("admin", {
      staffId: recreated.id,
      name: "Ana Pérez",
      isActive: true,
      monthlyLimitMinutes: 1440,
      expectedVersion: 1,
      reason: "Actualización",
      clientOperationId: "old-update",
    });
    store.staff.splice(0, store.staff.length);
    await expect(
      service.updateStaff("admin", {
        staffId: recreated.id,
        name: "Ana Pérez",
        isActive: true,
        monthlyLimitMinutes: 1440,
        expectedVersion: 1,
        reason: "Actualización",
        clientOperationId: "old-update",
      }),
    ).rejects.toThrow("No se encontró el agente");
    expect(created.id).not.toBe(recreated.id);
  });
});
