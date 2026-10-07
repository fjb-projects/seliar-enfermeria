import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  to: "/guardia-efa" | "/episodios-efa" | "/admin-usuarios";
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
            <ActionLink to="/guardia-efa">Iniciar guardia EFA</ActionLink>
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
            <ActionLink to="/episodios-efa">Registrar o continuar atenciones</ActionLink>
            <ActionLink to="/guardia-efa" variant="outline">Bases y dotación</ActionLink>
          </section>
        ) : (
          <section aria-labelledby="efa-readonly-title" className="space-y-4">
            <div className="space-y-1">
              <h2 id="efa-readonly-title" className="text-lg font-semibold">Consulta de tu actividad · Solo consulta</h2>
              <p className="text-sm text-muted-foreground">Tu cuenta está activa, pero hoy no cuenta con permisos de escritura EFA. Puedes consultar tu historial de guardias y episodios.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <ActionLink to="/guardia-efa" variant="outline">Consultar mis guardias</ActionLink>
              <ActionLink to="/episodios-efa" variant="outline">Consultar mis episodios</ActionLink>
            </div>
          </section>
        )}
        {isAdmin && (
          <nav aria-label="Administración" className="flex flex-col gap-3 border-t pt-4 sm:flex-row">
            <ActionLink to="/admin-usuarios" variant="outline">Administrar cuentas</ActionLink>
            <ActionLink to="/guardia-efa" variant="outline">Bases y dotación</ActionLink>
          </nav>
        )}
      </CardContent>
    </Card>
  );
}
