import { describe, expect, it, vi } from "vitest";
import {
  buildBalanceReviewRows,
  calculatePeriodPreview,
  getWorkflowOperation,
  parseWorkflowMinutes,
  validateManualMovement,
} from "./compensatory-hours-workflow";

describe("compensatory hours workflow rules", () => {
  it("parses whole hours and bounded minutes without accepting fractional or negative values", () => {
    expect(parseWorkflowMinutes("2", "15")).toBe(135);
    expect(parseWorkflowMinutes("", "0")).toBeNull();
    expect(parseWorkflowMinutes("1.5", "0")).toBeNull();
    expect(parseWorkflowMinutes("1", "60")).toBeNull();
    expect(parseWorkflowMinutes("-1", "0")).toBeNull();
  });

  it("keeps system-recorded consumption visible without applying it to the period net twice", () => {
    expect(
      calculatePeriodPreview({
        generatedMinutes: 600,
        externalTakenMinutes: 120,
        registeredTakenMinutes: 240,
      }),
    ).toEqual({ netMinutes: 240, balanceDeltaMinutes: 480, registeredTakenMinutes: 240 });
    expect(calculatePeriodPreview({ annualNetMinutes: -60, registeredTakenMinutes: 0 })).toEqual({
      netMinutes: -60,
      balanceDeltaMinutes: -60,
      registeredTakenMinutes: 0,
    });
  });

  it("blocks opening balances after the first movement and debits that cross the balance", () => {
    expect(
      validateManualMovement({
        kind: "opening",
        minutes: 30,
        balanceMinutes: 0,
        hasMovements: false,
      }),
    ).toBeNull();
    expect(
      validateManualMovement({
        kind: "opening",
        minutes: 30,
        balanceMinutes: 0,
        hasMovements: true,
      }),
    ).toContain("saldo inicial");
    expect(
      validateManualMovement({
        kind: "debit",
        minutes: 61,
        balanceMinutes: 60,
        hasMovements: true,
      }),
    ).toContain("saldo");
  });

  it("reuses an operation key for an identical retry and rotates it for changed input", () => {
    const createId = vi.fn().mockReturnValueOnce("operation-1").mockReturnValueOnce("operation-2");
    const first = getWorkflowOperation(null, { minutes: 60 }, createId);
    const retry = getWorkflowOperation(first, { minutes: 60 }, createId);
    const changed = getWorkflowOperation(retry, { minutes: 90 }, createId);

    expect(retry).toBe(first);
    expect(changed.id).toBe("operation-2");
    expect(createId).toHaveBeenCalledTimes(2);
  });

  it("labels accounting, availability, reservations, and monthly reference separately", () => {
    expect(
      buildBalanceReviewRows({
        balanceMinutes: 300,
        availableMinutes: 240,
        reservedMinutes: 60,
        monthlyReferenceMinutes: 600,
        balanceDeltaMinutes: -30,
      }),
    ).toEqual([
      { label: "Saldo contable actual", minutes: 300 },
      { label: "Disponible actual", minutes: 240 },
      { label: "Reservado", minutes: 60 },
      { label: "Cambio exacto en el saldo", minutes: -30 },
      { label: "Saldo contable resultante", minutes: 270 },
      { label: "Disponible resultante", minutes: 210 },
      { label: "Referencia mensual", minutes: 600 },
    ]);
  });
});
