import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { AccountAdminForm } from "@/components/AccountAdminForm";
import { AccountAdminList, type AccountView } from "@/components/AccountAdminList";
import { AdminBaseCatalog, type AdminBaseView } from "@/components/AdminBaseCatalog";
import { AdminStaffingPlan } from "@/components/AdminStaffingPlan";
import { PrivateAccountShell, type PrivateSession } from "@/components/PrivateAccountShell";
import { Button } from "@/components/ui/button";
import { listAccounts } from "@/lib/accounts.functions";
import { listAdminBases } from "@/lib/efa-bases.functions";
import { readSession } from "@/lib/auth.functions";
import { isAdministrator } from "@/lib/private-ui";

export const Route = createFileRoute("/admin-usuarios")({
  beforeLoad: async () => {
    let session;
    try {
      session = await readSession();
    } catch {
      throw redirect({ href: "/login?returnTo=%2Fadmin-usuarios" });
    }
    if (!session) throw redirect({ href: "/login?returnTo=%2Fadmin-usuarios" });
    if (!isAdministrator(session.roles)) throw redirect({ href: "/panel" });
    return { session: session as PrivateSession };
  },
  loader: async () => ({
    accounts: (await listAccounts()) as AccountView[],
    bases: (await listAdminBases()) as AdminBaseView[],
  }),
  component: AdminAccountsPage,
});

function AdminAccountsPage() {
  const { session } = Route.useRouteContext();
  const data = Route.useLoaderData();
  const [accounts, setAccounts] = useState<AccountView[]>(data.accounts);
  const [error, setError] = useState("");
  async function reload(): Promise<boolean> {
    try {
      setAccounts((await listAccounts()) as AccountView[]);
      setError("");
      return true;
    } catch {
      setError("No se pudo actualizar la lista. Comprueba tu sesión e inténtalo nuevamente.");
      return false;
    }
  }
  return (
    <PrivateAccountShell session={session}>
      <div className="space-y-6">
        <header>
          <h2 className="text-2xl font-semibold">Administración de cuentas</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea cuentas de enfermería y administra sus permisos y estado.
          </p>
        </header>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AccountAdminForm
          onCreated={async () => {
            await reload();
          }}
        />
        <AccountAdminList accounts={accounts} onReload={reload} actorId={session.user.id} />
        <AdminBaseCatalog initialBases={data.bases} />
        <AdminStaffingPlan bases={data.bases} />
        <Button asChild variant="outline" className="min-h-11">
          <a href="/panel">Volver al panel</a>
        </Button>
      </div>
    </PrivateAccountShell>
  );
}
