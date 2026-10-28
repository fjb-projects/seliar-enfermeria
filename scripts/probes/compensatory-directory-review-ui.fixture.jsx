import React from "react";
import { createRoot } from "react-dom/client";
import { CompensatoryBankPanel } from "@/components/CompensatoryBankPanel.tsx";

window.__React = React;
window.__uiProbe = { created: [], updated: [] };
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
  listStaff: async () => structuredClone(initialStaff),
  getHistory: async () => ({ entries: [], changes: [] }),
  createStaff: async ({ data }) => {
    window.__uiProbe.created.push(data);
    return { id: "staff-fake-new" };
  },
  updateStaff: async ({ data }) => {
    window.__uiProbe.updated.push(data);
    return { id: data.staffId };
  },
  recordMovement: async () => ({ id: "unused" }),
  reverseMovement: async () => ({ id: "unused" }),
};
let root;
window.mountDirectoryReview = () => {
  root?.unmount();
  root = createRoot(document.getElementById("mount"));
  root.render(React.createElement(CompensatoryBankPanel, { initialStaff, api }));
};
