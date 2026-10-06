import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkflowHeader } from "@/components/WorkflowHeader";
import { WorkflowShell } from "@/components/WorkflowShell";
import { signOut } from "@/lib/auth.functions";
import { isAdministrator } from "@/lib/private-ui";

export type PrivateSession = {
  user: { id: string; name: string; email: string };
  roles: string[];
  expiresAt: string;
};

export function PrivateAccountShell({
  session,
  children,
}: {
  session: PrivateSession;
  children: ReactNode;
}) {
  const signOutFn = useServerFn(signOut);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await signOutFn();
      window.location.assign("/login");
    } catch {
      setError("No se pudo cerrar la sesión. Inténtalo nuevamente.");
      setBusy(false);
    }
  }

  return (
    <WorkflowShell
      header={
        <WorkflowHeader
          eyebrow="SeLIAR · Área privada"
          title="Acceso seguro"
          description="Gestión de cuentas y permisos"
        />
      }
    >
      <div className="space-y-5">
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0">
            <p className="font-semibold">{session.user.name}</p>
            <p className="break-all text-sm text-muted-foreground">{session.user.email}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="secondary">Enfermería</Badge>
              {session.roles.includes("efa") && <Badge>Acceso EFA</Badge>}
              {isAdministrator(session.roles) && <Badge variant="outline">Administración</Badge>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdministrator(session.roles) && (
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/admin-usuarios">Administrar cuentas</Link>
              </Button>
            )}
            <Button onClick={logout} disabled={busy} variant="secondary" className="min-h-11">
              {busy ? "Cerrando…" : "Cerrar sesión"}
            </Button>
          </div>
        </section>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {children}
      </div>
    </WorkflowShell>
  );
}
