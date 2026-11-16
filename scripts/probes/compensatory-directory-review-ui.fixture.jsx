import React from "react";
import { createRoot } from "react-dom/client";
import { CompensatoryBankPanel } from "@/components/CompensatoryBankPanel.tsx";
import { CompensatorySourceReview } from "@/components/CompensatorySourceReview.tsx";

window.__React = React;
window.__uiProbe = { created: [], updated: [], requests: [], requestCalls: [] };
const createdStaff = [];
const savedRequests = [];
const initialStaff = [
  {
    id: "staff-fake-1",
    dni: "30123456",
    name: "Agente Sintético",
    email: null,
    registrationNumber: null,
    employmentStatus: null,
    jobRole: null,
    region: null,
    contactPhone: null,
    workplace: null,
    operationalStatus: null,
    operationalRole: null,
    isActive: true,
    monthlyLimitMinutes: 1440,
    version: 1,
    balanceMinutes: 0,
    createdAt: "2026-10-27T12:00:00Z",
  },
];
const api = {
  listStaff: async () => structuredClone([...initialStaff, ...createdStaff]),
  getHistory: async () => ({ entries: [], changes: [] }),
  createStaff: async ({ data }) => {
    window.__uiProbe.created.push(data);
    createdStaff.push({
      ...data,
      id: "staff-fake-new",
      email: data.email ?? null,
      isActive: true,
      version: 1,
      balanceMinutes: 0,
      createdAt: "2026-10-27T12:00:00Z",
    });
    return { id: "staff-fake-new" };
  },
  updateStaff: async ({ data }) => {
    window.__uiProbe.updated.push(data);
    const person = [...initialStaff, ...createdStaff].find(({ id }) => id === data.staffId);
    if (person) Object.assign(person, data, { version: person.version + 1 });
    return { id: data.staffId };
  },
  listRequests: async ({ data }) =>
    structuredClone(savedRequests.filter((request) => request.staffId === data.staffId)),
  insertRequest: async ({ data }) => {
    window.__uiProbe.requestCalls.push(data);
    if (window.__uiProbe.pauseRequest) {
      await new Promise((resolve) => {
        window.__uiProbe.resumeRequest = resolve;
      });
    }
    if (!data.confirmDuplicate) {
      return {
        status: "duplicate_review_required",
        matches: [
          {
            id: "request-synthetic-existing",
            staffId: data.staffId,
            clientOperationId: "synthetic-existing-operation",
            submittedAt: "2026-10-01T12:00:00.000Z",
            requesterName: "Agente Sintético Nuevo",
            requesterMobile: "Ambulance 4",
            compensatoryDate: "2026-10-03",
            hours: "2",
            createdAt: new Date("2026-10-01T12:00:00Z"),
          },
        ],
      };
    }
    const { confirmDuplicate: _confirmDuplicate, ...request } = data;
    const stored = {
      ...request,
      id: "request-synthetic-new",
      createdAt: new Date("2026-10-28T12:00:00Z"),
    };
    savedRequests.push(stored);
    window.__uiProbe.requests.push(stored);
    return { status: "stored", request: stored };
  },
  recordMovement: async () => ({ id: "unused" }),
  reverseMovement: async () => ({ id: "unused" }),
};
let root;
window.mountLocalReview = () => {
  root?.unmount();
  root = createRoot(document.getElementById("mount"));
  root.render(
    React.createElement(CompensatorySourceReview, { onBack: () => window.mountDirectoryReview() }),
  );
};
window.mountDirectoryReview = () => {
  root?.unmount();
  root = createRoot(document.getElementById("mount"));
  root.render(React.createElement(CompensatoryBankPanel, { initialStaff, api }));
};
