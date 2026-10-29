import React from "react";
import { createRoot } from "react-dom/client";
import { CompensatoryBankPanel } from "@/components/CompensatoryBankPanel.tsx";

window.__React = React;

const staff = [
  {
    id: "staff-a",
    dni: "30123456",
    name: "Ana Agente",
    email: null,
    isActive: true,
    monthlyLimitMinutes: 1440,
    version: 1,
    balanceMinutes: 0,
    createdAt: "2026-10-27T12:00:00Z",
  },
  {
    id: "staff-b",
    dni: "30987654",
    name: "Beatriz Agente",
    email: null,
    isActive: true,
    monthlyLimitMinutes: 1440,
    version: 1,
    balanceMinutes: 0,
    createdAt: "2026-10-27T12:00:00Z",
  },
];
const state = (window.__probeState = {});
function resetState() {
  state.staff = structuredClone(staff);
  state.entries = [];
  state.changes = [];
  state.historyCalls = [];
  state.movementCalls = [];
  state.committed = new Map();
  state.failFirstAfterCommit = false;
  state.delayedHistory = false;
  state.resolveA = null;
}
resetState();
const api = {
  listStaff: async () => structuredClone(state.staff),
  getHistory: ({ data }) => {
    const id = data.staffId;
    state.historyCalls.push(id);
    if (state.delayedHistory && id === "staff-a")
      return new Promise((resolve) => {
        state.resolveA = () =>
          resolve({
            entries: [
              {
                id: "old-a",
                staffId: id,
                kind: "credit",
                minutes: 60,
                effectiveDate: "2026-10-01",
                reason: "ANA-OLD-HISTORY",
                actorUserId: "admin",
                actorName: "Admin",
                createdAt: "2026-10-01T12:00:00Z",
                balanceBeforeMinutes: 0,
                balanceAfterMinutes: 60,
                reversesEntryId: null,
              },
            ],
            changes: [],
          });
      });
    const entries =
      id === "staff-b"
        ? [
            {
              id: "entry-b",
              staffId: id,
              kind: "credit",
              minutes: 30,
              effectiveDate: "2026-10-02",
              reason: "BEATRICE-LEDGER",
              actorUserId: "admin",
              actorName: "Admin",
              createdAt: "2026-10-02T12:00:00Z",
              balanceBeforeMinutes: 0,
              balanceAfterMinutes: 30,
              reversesEntryId: null,
            },
          ]
        : state.entries;
    return Promise.resolve({ entries, changes: state.changes });
  },
  createStaff: async () => ({ id: "staff-new" }),
  updateStaff: async ({ data }) => {
    state.staff = state.staff.map((person) =>
      person.id === data.staffId
        ? { ...person, name: data.name, version: person.version + 1 }
        : person,
    );
    return { id: data.staffId };
  },
  recordMovement: async ({ data }) => {
    state.movementCalls.push(data.clientOperationId);
    let result = state.committed.get(data.clientOperationId);
    if (!result) {
      const person = state.staff.find((item) => item.id === data.staffId);
      const after = person.balanceMinutes + (data.kind === "debit" ? -data.minutes : data.minutes);
      person.balanceMinutes = after;
      const id = `entry-${state.committed.size + 1}`;
      state.entries.push({
        id,
        staffId: person.id,
        kind: data.kind,
        minutes: data.kind === "debit" ? -data.minutes : data.minutes,
        effectiveDate: data.effectiveDate,
        reason: data.reason,
        actorUserId: "admin",
        actorName: "Admin",
        createdAt: "2026-10-27T12:00:00Z",
        balanceBeforeMinutes: after - data.minutes,
        balanceAfterMinutes: after,
        reversesEntryId: null,
      });
      result = { id };
      state.committed.set(data.clientOperationId, result);
    }
    if (state.failFirstAfterCommit) {
      state.failFirstAfterCommit = false;
      throw new Error("Simulated timeout after commit");
    }
    return result;
  },
  reverseMovement: async ({ data }) => ({ id: `reversal-${data.entryId}` }),
};
let root;
window.mountBank = () => {
  root?.unmount();
  root = createRoot(document.getElementById("mount"));
  root.render(
    React.createElement(CompensatoryBankPanel, { initialStaff: structuredClone(state.staff), api }),
  );
};
window.resetBankState = resetState;
window.resolveDelayedA = () => state.resolveA?.();
