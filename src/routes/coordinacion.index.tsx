import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Banknote, UsersRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/coordinacion/")({ component: CoordinationHome });

function CoordinationHome() {
  return (
    <section aria-labelledby="coordination-tools-heading" className="space-y-4">
      <header>
        <h2 id="coordination-tools-heading" className="text-xl font-semibold">
          Herramientas de coordinación
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Accede a usuarios y herramientas administrativas existentes.
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <a
          href="/admin-usuarios"
          className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Card className="h-full transition-colors group-hover:border-primary/50">
            <CardHeader>
              <UsersRound aria-hidden="true" className="size-5 text-primary" />
              <CardTitle>Usuarios y accesos</CardTitle>
              <CardDescription>Gestiona cuentas y permisos existentes.</CardDescription>
            </CardHeader>
            <CardContent>
              <span className="inline-flex min-h-11 items-center gap-2 text-sm font-medium">
                Abrir usuarios <ArrowRight aria-hidden="true" className="size-4" />
              </span>
            </CardContent>
          </Card>
        </a>
        <a
          href="/coordinacion/compensatorios"
          className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Card className="h-full transition-colors group-hover:border-primary/50">
            <CardHeader>
              <Banknote aria-hidden="true" className="size-5 text-primary" />
              <CardTitle>Compensatorios</CardTitle>
              <CardDescription>
                Administra perfiles y movimientos manuales con auditoría.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="inline-flex min-h-11 items-center gap-2 text-sm font-medium">
                Abrir compensatorios <ArrowRight aria-hidden="true" className="size-4" />
              </span>
            </CardContent>
          </Card>
        </a>
        <a
          href="/coordinacion-efa"
          className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Card className="h-full transition-colors group-hover:border-primary/50">
            <CardHeader>
              <UsersRound aria-hidden="true" className="size-5 text-primary" />
              <CardTitle>Coordinación EFA</CardTitle>
              <CardDescription>Continúa en la vista de coordinación ya existente.</CardDescription>
            </CardHeader>
            <CardContent>
              <span className="inline-flex min-h-11 items-center gap-2 text-sm font-medium">
                Abrir EFA <ArrowRight aria-hidden="true" className="size-4" />
              </span>
            </CardContent>
          </Card>
        </a>
      </div>
    </section>
  );
}
