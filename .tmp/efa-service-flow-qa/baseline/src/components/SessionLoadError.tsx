import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

export function SessionLoadError() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-lg items-center px-4 py-8">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>No se pudo cargar esta pantalla</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p role="alert" className="text-sm text-muted-foreground">
            Ocurrió un problema temporal al cargar esta pantalla. Vuelve a intentarlo.
          </p>
          <Button className="min-h-11 w-full" onClick={() => window.location.reload()}>
            Reintentar
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
