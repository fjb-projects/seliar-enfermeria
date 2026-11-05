import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { resetAccountPassword, setAccountActive, setAccountRoles } from "@/lib/accounts.functions";
import type { AccountRole } from "@/lib/access";
import { accountRoleView, rolesForMutation } from "@/lib/private-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export type AccountView = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  version: number;
  roles: AccountRole[];
};

export function AccountAdminList({
  accounts,
  onReload,
  actorId,
}: {
  accounts: AccountView[];
  onReload: () => Promise<boolean>;
  actorId: string;
}) {
  const rolesFn = useServerFn(setAccountRoles);
  const activeFn = useServerFn(setAccountActive);
  const resetFn = useServerFn(resetAccountPassword);
  const [rolesDraft, setRolesDraft] = useState<Record<string, AccountRole[]>>({});
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);

  async function mutate(id: string, action: () => Promise<unknown>, success: string) {
    setBusyId(id);
    setError("");
    setMessage("");
    try {
      await action();
      if (!(await onReload())) throw new Error("Refresh failed");
      setRolesDraft({});
      setMessage(success);
      setStale(false);
    } catch {
      setError("No se pudo guardar el cambio. Actualiza la lista antes de volver a intentarlo.");
      setStale(true);
    } finally {
      setBusyId("");
    }
  }

  async function refreshExplicitly() {
    if (await onReload()) {
      setRolesDraft({});
      setStale(false);
      setError("");
    }
  }

  function selectedRoles(account: AccountView) {
    return rolesDraft[account.id] ?? account.roles;
  }
  function changeRole(account: AccountView, role: AccountRole, selected: boolean) {
    const roles = selectedRoles(account).filter((value) => value !== role);
    if (selected) roles.push(role);
    setRolesDraft((current) => ({ ...current, [account.id]: roles }));
  }

  return (
    <section className="space-y-4" aria-label="Cuentas existentes">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold">Cuentas existentes</h2>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={busyId !== ""}
          onClick={() => void refreshExplicitly()}
        >
          Actualizar lista
        </Button>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
          {stale && (
            <p className="mt-1">
              Los cambios con una versión anterior no se enviarán automáticamente.
            </p>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="text-sm text-green-700">
          {message}
        </p>
      )}
      {accounts.length === 0 && (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          No hay cuentas para mostrar.
        </p>
      )}
      <div className="grid gap-4">
        {accounts.map((account) => {
          const grants = selectedRoles(account);
          const view = accountRoleView(grants);
          const changed =
            JSON.stringify([...grants].sort()) !== JSON.stringify([...account.roles].sort());
          return (
            <Card key={account.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base">{account.name}</CardTitle>
                    <p className="break-all text-sm text-muted-foreground">{account.email}</p>
                  </div>
                  <Badge variant={account.isActive ? "secondary" : "destructive"}>
                    {account.isActive ? "Activa" : "Inactiva"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <fieldset className="space-y-2 rounded-lg border p-3">
                  <legend className="px-1 text-sm font-medium">Permisos explícitos</legend>
                  <p className="text-sm text-muted-foreground">
                    Rol base: Enfermería (siempre asignado)
                  </p>
                  <label className="flex min-h-11 items-center gap-3">
                    <Checkbox
                      checked={grants.includes("efa")}
                      onCheckedChange={(checked) => changeRole(account, "efa", checked === true)}
                      disabled={!account.isActive || busyId === account.id || stale}
                    />
                    <span>Acceso EFA explícito</span>
                  </label>
                  <label className="flex min-h-11 items-center gap-3">
                    <Checkbox
                      checked={grants.includes("admin")}
                      onCheckedChange={(checked) => changeRole(account, "admin", checked === true)}
                      disabled={!account.isActive || busyId === account.id || stale}
                    />
                    <span>Administración</span>
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Acceso EFA efectivo: {view.efaEffective ? "Sí" : "No"}
                    {view.adminGranted && !view.efaGranted
                      ? " (por administración, sin concesión explícita)"
                      : ""}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 w-full sm:w-auto"
                    disabled={!changed || !account.isActive || busyId === account.id || stale}
                    onClick={() =>
                      void mutate(
                        account.id,
                        () =>
                          rolesFn({
                            data: {
                              userId: account.id,
                              expectedVersion: account.version,
                              roles: grants,
                            },
                          }),
                        "Permisos actualizados.",
                      )
                    }
                  >
                    Guardar permisos
                  </Button>
                </fieldset>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant={account.isActive ? "destructive" : "outline"}
                    className="min-h-11"
                    disabled={busyId === account.id || stale}
                    onClick={() => {
                      const next = !account.isActive;
                      if (
                        window.confirm(
                          next
                            ? "¿Reactivar esta cuenta?"
                            : "¿Desactivar esta cuenta? Se cerrarán sus sesiones.",
                        )
                      )
                        void mutate(
                          account.id,
                          () =>
                            activeFn({
                              data: {
                                userId: account.id,
                                expectedVersion: account.version,
                                isActive: next,
                              },
                            }),
                          next ? "Cuenta reactivada." : "Cuenta desactivada.",
                        );
                    }}
                  >
                    {account.isActive ? "Desactivar cuenta" : "Reactivar cuenta"}
                  </Button>
                </div>
                <form
                  className="space-y-2 rounded-lg border p-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const password = passwords[account.id] ?? "";
                    if (
                      password.length < 12 ||
                      password.length > 128 ||
                      !window.confirm(
                        "¿Restablecer la contraseña y cerrar las sesiones de esta cuenta?",
                      )
                    )
                      return;
                    void mutate(
                      account.id,
                      async () => {
                        await resetFn({
                          data: { userId: account.id, expectedVersion: account.version, password },
                        });
                        setPasswords((current) => ({ ...current, [account.id]: "" }));
                        if (account.id === actorId) window.location.assign("/login");
                      },
                      "Contraseña restablecida; las sesiones existentes se cerraron.",
                    );
                  }}
                >
                  <label className="block text-sm font-medium" htmlFor={`reset-${account.id}`}>
                    Nueva contraseña
                  </label>
                  <Input
                    id={`reset-${account.id}`}
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    required
                    value={passwords[account.id] ?? ""}
                    onChange={(event) =>
                      setPasswords((current) => ({ ...current, [account.id]: event.target.value }))
                    }
                    disabled={busyId === account.id || stale}
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    className="min-h-11 w-full sm:w-auto"
                    disabled={busyId === account.id || stale}
                  >
                    {busyId === account.id ? "Guardando…" : "Restablecer contraseña"}
                  </Button>
                </form>
                <p className="text-xs text-muted-foreground">
                  Versión de cuenta: {account.version}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
