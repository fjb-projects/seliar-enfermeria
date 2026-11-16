import React from "react";
import { createRoot } from "react-dom/client";
import { CompensatoryOperationalWorkspace } from "@/components/CompensatoryOperationalWorkspace";
import { PrivateAccountShell } from "@/components/PrivateAccountShell";
import { CoordinationAdminLayout } from "@/components/CoordinationAdminLayout";
import { SeliarMobileNav } from "@/components/SeliarMobileNav";

const staff = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    dni: "00000001",
    name: "Synthetic Alpha",
    email: null,
    isActive: true,
    balanceMinutes: 240,
    reservedMinutes: 0,
    availableMinutes: 240,
    monthlyLimitMinutes: 1440,
    version: 1,
    createdAt: new Date("2026-10-01T12:00Z"),
  },
];
const request = (id, phase) => ({
  id,
  staffId: staff[0].id,
  clientOperationId: id,
  submittedAt: "2026-10-29T12:00:00Z",
  requesterName: staff[0].name,
  requesterMobile: "Synthetic mobile",
  compensatoryDate: "2026-10-31",
  hours: "2",
  createdAt: new Date("2026-10-29T12:00Z"),
  phase,
  version: 1,
  requestedDate: phase === "unclassified" ? null : "2026-10-31",
  requestedMinutes: phase === "unclassified" ? null : 120,
  classifiedAt: null,
  classifiedByUserId: null,
  decisionAt: null,
  decisionByUserId: null,
  decisionReason: null,
  cancelledAt: null,
  cancellationByUserId: null,
  cancellationReason: null,
  consumedAt: null,
  consumptionLedgerId: null,
});
const state = {
  serviceDay: "2026-10-29",
  timeZone: "America/Argentina/Buenos_Aires",
  staff,
  requests: [
    request("22222222-2222-4222-8222-222222222222", "unclassified"),
    request("33333333-3333-4333-8333-333333333333", "pending"),
  ],
  audits: [],
};
window.operationalProbe = {
  calls: [],
  timeoutAfterCommit: false,
  rejectRead: false,
  writes: 0,
  state,
};
const saved = new Map();
const api = {
  workspace: async () => {
    if (window.operationalProbe.rejectRead) throw Error("Synthetic refresh failure");
    return structuredClone(state);
  },
  classify: async ({ data }) => {
    window.operationalProbe.calls.push({ kind: "classify", ...data });
    const r = state.requests.find((r) => r.id === data.requestId);
    r.phase = "pending";
    r.requestedDate = data.requestedDate;
    r.requestedMinutes = data.minutes;
    r.version++;
    return { id: r.id };
  },
  decide: async ({ data }) => {
    window.operationalProbe.calls.push({ kind: "decide", ...data });
    if (saved.has(data.clientOperationId)) return saved.get(data.clientOperationId);
    const r = state.requests.find((r) => r.id === data.requestId);
    r.phase = data.decision === "approve" ? "approved" : "rejected";
    r.version++;
    r.decisionAt = new Date();
    r.decisionReason = data.reason;
    if (data.decision === "approve") {
      staff[0].reservedMinutes += r.requestedMinutes;
      staff[0].availableMinutes -= r.requestedMinutes;
    }
    const result = { id: r.id };
    saved.set(data.clientOperationId, result);
    window.operationalProbe.writes++;
    if (window.operationalProbe.timeoutAfterCommit) {
      window.operationalProbe.timeoutAfterCommit = false;
      throw Error("Synthetic post-commit timeout");
    }
    return result;
  },
  cancel: async ({ data }) => {
    window.operationalProbe.calls.push({ kind: "cancel", ...data });
    const r = state.requests.find((r) => r.id === data.requestId);
    r.phase = "cancelled";
    r.version++;
    r.cancelledAt = new Date();
    staff[0].reservedMinutes -= r.requestedMinutes;
    staff[0].availableMinutes += r.requestedMinutes;
    return { id: r.id };
  },
};
const bankApi = {
  listStaff: async () => structuredClone(staff),
  getHistory: async () => ({ entries: [], changes: [] }),
  listRequests: async () => [],
  createStaff: async () => {
    if (window.operationalProbe.holdImport)
      await new Promise((resolve) => {
        window.operationalProbe.releaseImport = resolve;
      });
    return { id: "created" };
  },
  updateStaff: async () => ({ id: staff[0].id }),
  recordMovement: async ({ data }) => {
    const probe = window.operationalProbe;
    (probe.bankCalls ??= []).push(data.clientOperationId);
    if (!(probe.bankOperations ??= []).includes(data.clientOperationId)) {
      probe.bankOperations.push(data.clientOperationId);
      probe.bankWrites = (probe.bankWrites ?? 0) + 1;
    }
    if (probe.failCreditOnce) {
      probe.failCreditOnce = false;
      throw Error("Synthetic bank timeout");
    }
    return { id: "movement" };
  },
  reverseMovement: async () => ({ id: "reverse" }),
  insertRequest: async () => ({ status: "stored", request: state.requests[0] }),
  deleteStaff: async () => ({ id: staff[0].id }),
};
const session = {
  user: { id: "synthetic", name: "Synthetic Admin", email: "admin@example.test" },
  roles: ["admin"],
  expiresAt: "2030-01-01",
};
window.navigationFixture = {
  sessionStatus: "authenticated",
  session,
  summary: { isAdmin: true, canWrite: true, openGuard: null },
  quickGuardEnd: { visible: false, openGuard: null, confirmTarget: null, pending: false },
  requestLogout: () => {},
  retrySummary: () => {},
  retrySession: () => {},
  logoutPending: false,
  logoutError: "",
};
createRoot(document.getElementById("root")).render(
  <>
    <SeliarMobileNav />
    <PrivateAccountShell
      session={session}
      title="Coordinación"
      contentWidth="full"
      surface="calm"
      compactLayout
    >
      <CoordinationAdminLayout active="compensatorios">
        <CompensatoryOperationalWorkspace initialStaff={staff} api={api} bankApi={bankApi} />
      </CoordinationAdminLayout>
    </PrivateAccountShell>
  </>,
);
