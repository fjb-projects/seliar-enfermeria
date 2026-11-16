import React from "react";
import { createRoot } from "react-dom/client";
import { useLocation } from "@tanstack/react-router";
import { SeliarMobileNav } from "@/components/SeliarMobileNav";
import { PrivateAccountShell } from "@/components/PrivateAccountShell";
import { CoordinationAdminLayout } from "@/components/CoordinationAdminLayout";
import { CompensatoryBankPanel } from "@/components/CompensatoryBankPanel";
import { Route as AccountsRoute } from "@/routes/admin-usuarios";
import { Route as HomeRoute } from "@/routes/coordinacion.index";

window.__navSession = {
  user: { id: "fixture-admin", name: "Test Admin", email: "admin@example.test" },
  roles: ["admin"],
  expiresAt: "2030-01-01T00:00:00Z",
};
const noOp = () => {};
window.__navigation = {
  sessionStatus: "authenticated",
  session: window.__navSession,
  summary: { isAdmin: true, canWrite: true, openGuard: null },
  quickGuardEnd: { visible: false, openGuard: null, confirmTarget: null, pending: false },
  requestLogout: noOp,
  retrySummary: noOp,
  retrySession: noOp,
  logoutPending: false,
  logoutError: "",
};

function App() {
  const { pathname } = useLocation();
  const Accounts = AccountsRoute.options.component;
  const Home = HomeRoute.options.component;
  return (
    <>
      <SeliarMobileNav />
      {pathname === "/admin-usuarios" ? (
        <Accounts />
      ) : (
        <PrivateAccountShell
          session={window.__navSession}
          title="Coordinación"
          contentWidth="full"
          surface="calm"
        >
          <CoordinationAdminLayout
            active={pathname === "/coordinacion/compensatorios" ? "compensatorios" : "home"}
          >
            {pathname === "/coordinacion/compensatorios" ? (
              <CompensatoryBankPanel initialStaff={[]} />
            ) : (
              <Home />
            )}
          </CoordinationAdminLayout>
        </PrivateAccountShell>
      )}
    </>
  );
}

const root = createRoot(document.getElementById("mount"));
window.mountNavigation = (admin = true, hasSummary = true) => {
  window.__navSession.roles = admin ? ["admin"] : ["efa"];
  window.__navigation.summary = hasSummary
    ? { isAdmin: admin, canWrite: true, openGuard: null }
    : undefined;
  root.render(<App key={`${admin}:${hasSummary}`} />);
};
