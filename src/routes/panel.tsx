import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { PrivateAccountShell, type PrivateSession } from "@/components/PrivateAccountShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { readSession } from "@/lib/auth.functions";
import { SessionLoadError } from "@/components/SessionLoadError";

export const Route = createFileRoute("/panel")({
  errorComponent: SessionLoadError,
  beforeLoad: async () => {
    const session = await readSession();
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
            Tu sesión está activa. Desde aquí puedes gestionar tus guardias y revisar las funciones
            disponibles para tu cuenta.
          </p>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/episodios-efa">Ver episodios de atención</Link>
          </Button>
          {(session.roles.includes("efa") || session.roles.includes("admin")) && (
            <Button asChild className="min-h-11">
              <Link to="/guardia-efa">Gestionar guardia EFA</Link>
            </Button>
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
