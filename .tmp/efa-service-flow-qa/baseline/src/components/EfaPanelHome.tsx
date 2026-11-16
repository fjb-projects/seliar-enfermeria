import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEfaPanelQuickActions, type EfaPanelQuickAction } from "@/lib/efa-panel-quick-actions";

export type EfaPanelSummary = {
  canWrite: boolean;
  isAdmin: boolean;
  openGuard: {
    startedAt: string;
    baseCount: number;
    activeEpisodeCount: number;
  } | null;
};

function ActionLink({
  to,
  children,
  variant = "default",
}: {
  to: EfaPanelQuickAction["to"];
  children: React.ReactNode;
  variant?: "default" | "outline";
}) {
  return (
    <Button asChild variant={variant} className="min-h-11 w-full justify-start sm:w-auto">
      <Link to={to}>{children}</Link>
    </Button>
  );
}
export function EfaPanelHome({ summary }: { summary: EfaPanelSummary }) {
  const { canWrite, isAdmin, openGuard } = summary;
  const quickActions = getEfaPanelQuickActions(summary);
  const action = (id: EfaPanelQuickAction["id"]) => quickActions.find((item) => item.id === id)!;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Área privada</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {canWrite && !openGuard ? (
          <section aria-labelledby="efa-start-title" className="space-y-4">
            <div className="space-y-1">
              <h2 id="efa-start-title" className="text-lg font-semibold">Tu próxima guardia EFA</h2>
              <p className="text-sm text-muted-foreground">Comienza por abrir tu guardia para registrar atenciones.</p>
            </div>
            <ActionLink to={action("start-guard").to}>{action("start-guard").label}</ActionLink>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Inicia tu guardia.</li>
              <li>Selecciona las bases que cubrirás, si corresponde.</li>
              <li>Registra cada atención.</li>
            </ol>
          </section>
        ) : canWrite && openGuard ? (
          <section aria-labelledby="efa-continue-title" className="space-y-4">
            <div className="space-y-1">
              <h2 id="efa-continue-title" className="text-lg font-semibold">Guardia EFA abierta</h2>
              <p className="text-sm text-muted-foreground">
                {openGuard.baseCount} {openGuard.baseCount === 1 ? "base" : "bases"} seleccionadas · {openGuard.activeEpisodeCount} {openGuard.activeEpisodeCount === 1 ? "atención activa" : "atenciones activas"}
              </p>
            </div>
            <ActionLink to={action("continue-episodes").to}>
              {action("continue-episodes").label}
            </ActionLink>
            <ActionLink to={action("manage-guard").to} variant="outline">
              {action("manage-guard").label}
            </ActionLink>
          </section>
        ) : (
          <section aria-labelledby="efa-readonly-title" className="space-y-4">
            <div className="space-y-1">
              <h2 id="efa-readonly-title" className="text-lg font-semibold">Consulta de tu actividad · Solo consulta</h2>
              <p className="text-sm text-muted-foreground">
                Tu cuenta está activa, pero hoy no cuenta con permisos de escritura EFA. Puedes
                consultar el historial de tus guardias.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <ActionLink to={action("consult-guards").to} variant="outline">
                {action("consult-guards").label}
              </ActionLink>
            </div>
          </section>
        )}
        {isAdmin && (
          <nav aria-label="Administración" className="flex flex-col gap-3 border-t pt-4 sm:flex-row">
            <ActionLink to={action("manage-accounts").to} variant="outline">
              {action("manage-accounts").label}
            </ActionLink>
            {!openGuard && (
              <ActionLink to={action("manage-guard").to} variant="outline">
                {action("manage-guard").label}
              </ActionLink>
            )}
          </nav>
        )}
      </CardContent>
    </Card>
  );
}
