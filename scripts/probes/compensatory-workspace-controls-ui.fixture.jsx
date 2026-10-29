import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  COMPENSATORY_WORKSPACE_DOCK_RESERVE_CLASS,
  CompensatoryWorkspaceScope,
  CompensatoryWorkspaceTabs,
  CompensatoryWorkspaceTabPanel,
} from "@/components/CompensatoryWorkspaceControls";

function Fixture() {
  const [tab, setTab] = useState("pending");
  const [staffId, setStaffId] = useState(null);
  const [disabled, setDisabled] = useState(false);
  const options = [
    { id: "staff-laura", label: "Laura Pérez · DNI 30123456" },
    { id: "staff-marcos", label: "Marcos Soto · DNI 30987654" },
    { id: "staff-maria", label: "María Gómez · DNI 31234567" },
  ];
  return (
    <main className={COMPENSATORY_WORKSPACE_DOCK_RESERVE_CLASS}>
      <nav
        aria-label="Navegación principal"
        style={{ position: "fixed", bottom: 0, left: 0, height: "64px", width: "100%", zIndex: 50 }}
      >
        Existing global mobile navigation
      </nav>
      <header>
        <CompensatoryWorkspaceTabs value={tab} onValueChange={setTab} disabled={disabled} />
        <CompensatoryWorkspaceScope
          staffOptions={options}
          selectedStaffId={staffId}
          onSelectStaff={setStaffId}
          disabled={disabled}
        />
        <button type="button" onClick={() => setDisabled((current) => !current)}>
          Toggle disabled
        </button>
      </header>
      <output data-testid="active-tab">{tab}</output>
      <output data-testid="selected-staff">{staffId ?? "general"}</output>
      {["pending", "scheduled", "history"].map((value) => (
        <CompensatoryWorkspaceTabPanel key={value} value={value} activeTab={tab}>
          {value} panel content
        </CompensatoryWorkspaceTabPanel>
      ))}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<Fixture />);
