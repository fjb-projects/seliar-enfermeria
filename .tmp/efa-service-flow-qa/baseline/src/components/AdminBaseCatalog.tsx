import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listAdminBases,
  createEfaBase,
  renameEfaBase,
  setEfaBaseActive,
} from "@/lib/efa-bases.functions";

export type AdminBaseView = {
  id: string;
  name: string;
  isActive: boolean;
  version: number;
};

export function AdminBaseCatalog({ initialBases }: { initialBases: AdminBaseView[] }) {
  const listBases = useServerFn(listAdminBases);
  const createBase = useServerFn(createEfaBase);
  const renameBase = useServerFn(renameEfaBase);
  const setBaseActive = useServerFn(setEfaBaseActive);
  const [bases, setBases] = useState(initialBases);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialBases.map((base) => [base.id, base.name])),
  );
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    try {
      const current = (await listBases()) as AdminBaseView[];
      setBases(current);
      setDrafts(Object.fromEntries(current.map((base) => [base.id, base.name])));
      setError("");
      return true;
    } catch {
      setError("No se pudo actualizar el catálogo. Comprueba tu sesión e inténtalo nuevamente.");
      return false;
    }
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await createBase({ data: { name: newName } });
      setNewName("");
      if (await refresh()) setMessage("La base se creó correctamente.");
    } catch {
      setError("No se pudo crear la base. Comprueba el nombre y actualiza el catálogo.");
    } finally {
      setBusy(false);
    }
  }

  async function rename(base: AdminBaseView) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await renameBase({
        data: { baseId: base.id, expectedVersion: base.version, name: drafts[base.id] ?? "" },
      });
      if (await refresh()) setMessage("El nombre de la base se actualizó.");
    } catch {
      setError("No se pudo actualizar el nombre. Revisa el catálogo antes de volver a intentar.");
    } finally {
      setBusy(false);
    }
  }

  async function changeActive(base: AdminBaseView) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await setBaseActive({
        data: { baseId: base.id, expectedVersion: base.version, isActive: !base.isActive },
      });
      if (await refresh()) {
        setMessage(base.isActive ? "La base se desactivó." : "La base se reactivó.");
      }
    } catch {
      setError("No se pudo cambiar el estado. Revisa el catálogo antes de volver a intentar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Catálogo institucional de bases</CardTitle>
        <p className="text-sm text-muted-foreground">
          Administra las bases disponibles para futuras guardias EFA. Desactivar conserva el
          historial.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
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
        <form
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
          onSubmit={create}
        >
          <div className="space-y-2">
            <Label htmlFor="new-base-name">Nombre de la base</Label>
            <Input
              id="new-base-name"
              required
              maxLength={120}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy} className="min-h-11">
            {busy ? "Guardando…" : "Agregar base"}
          </Button>
        </form>
        <div className="space-y-3" aria-label="Bases institucionales">
          {bases.map((base) => (
            <div
              key={base.id}
              className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
            >
              <div className="space-y-2">
                <Label htmlFor={`base-name-${base.id}`}>Nombre</Label>
                <Input
                  id={`base-name-${base.id}`}
                  required
                  maxLength={120}
                  value={drafts[base.id] ?? base.name}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [base.id]: event.target.value }))
                  }
                  disabled={busy}
                />
                <p className="text-xs text-muted-foreground">
                  {base.isActive ? "Activa" : "Inactiva"} · Versión {base.version}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={busy || (drafts[base.id] ?? base.name) === base.name}
                onClick={() => void rename(base)}
              >
                Guardar nombre
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={busy}
                onClick={() => void changeActive(base)}
              >
                {base.isActive ? "Desactivar" : "Reactivar"}
              </Button>
            </div>
          ))}
          {bases.length === 0 && (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Todavía no hay bases en el catálogo.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
