import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createAccount } from "@/lib/accounts.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AccountAdminForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const createFn = useServerFn(createAccount);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [efa, setEfa] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await createFn({
        data: {
          name,
          email,
          password,
          roles: [...(efa ? ["efa" as const] : []), ...(admin ? ["admin" as const] : [])],
        },
      });
      setName("");
      setEmail("");
      setPassword("");
      setEfa(false);
      setAdmin(false);
      await onCreated();
      setMessage("La cuenta se creó correctamente.");
    } catch {
      setError("No se pudo crear la cuenta. Revisa los datos o actualiza la lista.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nueva cuenta de enfermería</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="account-name">Nombre</Label>
            <Input
              id="account-name"
              autoComplete="name"
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-email">Correo</Label>
            <Input
              id="account-email"
              type="email"
              autoComplete="email"
              required
              maxLength={255}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-password">Contraseña inicial</Label>
            <Input
              id="account-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Entre 12 y 128 caracteres. Comunícala por un canal seguro.
            </p>
          </div>
          <fieldset className="space-y-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">Permisos explícitos</legend>
            <label className="flex min-h-11 items-center gap-3">
              <Checkbox checked={efa} onCheckedChange={(checked) => setEfa(checked === true)} />
              <span>Acceso EFA</span>
            </label>
            <label className="flex min-h-11 items-center gap-3">
              <Checkbox checked={admin} onCheckedChange={(checked) => setAdmin(checked === true)} />
              <span>Administración (incluye acceso EFA efectivo)</span>
            </label>
            <p className="text-xs text-muted-foreground">
              Todas las cuentas tienen el rol base de enfermería. La administración no crea una
              concesión EFA explícita.
            </p>
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="text-sm text-green-700">
              {message}
            </p>
          )}
          <Button type="submit" disabled={busy} className="min-h-11 w-full sm:w-auto">
            {busy ? "Creando…" : "Crear cuenta"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
