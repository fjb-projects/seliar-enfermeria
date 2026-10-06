import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { PrivateAccountShell, type PrivateSession } from "@/components/PrivateAccountShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { readSession } from "@/lib/auth.functions";

export const Route = createFileRoute("/panel")({
  beforeLoad: async () => {
    let session;
    try {
      session = await readSession();
    } catch {
      throw redirect({ href: "/login?returnTo=%2Fpanel" });
    }
    if (!session) throw redirect({ href: "/login?returnTo=%2Fpanel" });
    return { session: session as PrivateSession };
  },
  component: PanelPage,
});

function PanelPage() {
  const { session } = Route.useRouteContext();
  return (
    <PrivateAccountShell session={session}>
      <Card>
        <CardHeader>
          <CardTitle>Área privada</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Tu sesión está activa. Las funciones de trabajo EFA se incorporarán en una etapa
            posterior.
          </p>
          {session.roles.includes("efa") && (
            <p className="rounded-lg border border-dashed p-4 text-sm">
              El acceso EFA está habilitado para esta cuenta; todavía no hay flujos operativos
              disponibles.
            </p>
          )}
          {session.roles.includes("admin") && (
            <p className="text-sm">
              <Link className="underline underline-offset-4" to="/admin-usuarios">
                Administrar cuentas
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
    </PrivateAccountShell>
  );
}
