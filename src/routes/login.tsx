import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { WorkflowHeader } from "@/components/WorkflowHeader";
import { WorkflowShell } from "@/components/WorkflowShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readSession, signIn } from "@/lib/auth.functions";
import { safePrivateReturnPath } from "@/lib/private-ui";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo: safePrivateReturnPath(search["returnTo"]),
  }),
  beforeLoad: async ({ search }) => {
    let session = null;
    try {
      session = await readSession();
    } catch {
      // Keep login available when the current session cannot be read.
    }
    if (session) throw redirect({ href: search.returnTo });
  },
  component: LoginPage,
});

function LoginPage() {
  const { returnTo } = Route.useSearch();
  const signInFn = useServerFn(signIn);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signInFn({ data: { email, password } });
      setPassword("");
      window.location.assign(returnTo);
    } catch {
      setPassword("");
      setError("No se pudo iniciar sesión. Verifica tus datos o inténtalo más tarde.");
      setBusy(false);
    }
  }
  return (
    <WorkflowShell
      contentWidth="narrow"
      header={
        <WorkflowHeader
          contentWidth="narrow"
          eyebrow="SeLIAR · Área privada"
          title="Iniciar sesión"
          description="Acceso para personal autorizado"
        />
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>Acceso seguro</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="login-email">Correo electrónico</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="username"
                required
                maxLength={255}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">Contraseña</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy} className="min-h-11 w-full">
              {busy ? "Ingresando…" : "Ingresar"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Las cuentas son creadas por administración. No hay registro público.
            </p>
          </form>
        </CardContent>
      </Card>
    </WorkflowShell>
  );
}
