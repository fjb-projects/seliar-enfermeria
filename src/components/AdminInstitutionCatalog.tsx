import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createAdminInstitution,
  listAdminInstitutions,
  listEfaInstitutionHistory,
  renameEfaInstitution,
  setEfaInstitutionActive,
} from "@/lib/efa-institutions.functions";

export type AdminInstitutionView = {
  id: string;
  name: string;
  isActive: boolean;
  version: number;
};
type InstitutionAuditView = {
  id: string;
  actorUserId: string;
  action: string;
  versionBefore: number | null;
  versionAfter: number;
  beforeState: { name: string; isActive: boolean } | null;
  afterState: { name: string; isActive: boolean };
  occurredAt: Date;
};

const actionLabels: Record<string, string> = {
  created: "Creada",
  renamed: "Nombre corregido",
  disabled: "Desactivada",
  reactivated: "Reactivada",
};

export function AdminInstitutionCatalog({
  initialInstitutions,
}: {
  initialInstitutions: AdminInstitutionView[];
}) {
  const listInstitutions = useServerFn(listAdminInstitutions);
  const createInstitution = useServerFn(createAdminInstitution);
  const renameInstitution = useServerFn(renameEfaInstitution);
  const setInstitutionActive = useServerFn(setEfaInstitutionActive);
  const getHistory = useServerFn(listEfaInstitutionHistory);
  const [institutions, setInstitutions] = useState(initialInstitutions);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialInstitutions.map((item) => [item.id, item.name])),
  );
  const [history, setHistory] = useState<Record<string, InstitutionAuditView[]>>({});
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    try {
      const current = (await listInstitutions()) as AdminInstitutionView[];
      setInstitutions(current);
      setDrafts(Object.fromEntries(current.map((item) => [item.id, item.name])));
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
      await createInstitution({ data: { name: newName } });
      setNewName("");
      if (await refresh()) setMessage("La institución/destino se creó correctamente.");
    } catch {
      setError("No se pudo crear la opción. Comprueba el nombre y actualiza el catálogo.");
    } finally {
      setBusy(false);
    }
  }

  async function rename(institution: AdminInstitutionView) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await renameInstitution({
        data: {
          institutionId: institution.id,
          expectedVersion: institution.version,
          name: drafts[institution.id] ?? "",
        },
      });
      if (await refresh()) setMessage("El nombre de la institución/destino se actualizó.");
    } catch {
      setError("No se pudo corregir el nombre. Revisa el catálogo antes de volver a intentar.");
    } finally {
      setBusy(false);
    }
  }

  async function changeActive(institution: AdminInstitutionView) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await setInstitutionActive({
        data: {
          institutionId: institution.id,
          expectedVersion: institution.version,
          isActive: !institution.isActive,
        },
      });
      if (await refresh())
        setMessage(
          institution.isActive
            ? "La opción se desactivó; el historial se conserva."
            : "La opción se reactivó.",
        );
    } catch {
      setError("No se pudo cambiar el estado. Revisa el catálogo antes de volver a intentar.");
    } finally {
      setBusy(false);
    }
  }

  async function showHistory(institution: AdminInstitutionView) {
    setError("");
    try {
      const entries = (await getHistory({
        data: { institutionId: institution.id },
      })) as InstitutionAuditView[];
      setHistory((current) => ({ ...current, [institution.id]: entries }));
    } catch {
      setError("No se pudo consultar el historial de esta opción.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Catálogo de instituciones y destinos</CardTitle>
        <p className="text-sm text-muted-foreground">
          Administra opciones compartidas para episodios EFA. No incluyas domicilios particulares;
          desactivar conserva las referencias históricas.
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
            <Label htmlFor="new-institution-name">Nombre de la institución o destino</Label>
            <Input
              id="new-institution-name"
              required
              maxLength={120}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy} className="min-h-11">
            {busy ? "Guardando…" : "Agregar opción"}
          </Button>
        </form>
        <div className="space-y-3" aria-label="Instituciones y destinos">
          {institutions.map((institution) => (
            <div key={institution.id} className="space-y-3 rounded-lg border p-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                <div className="space-y-2">
                  <Label htmlFor={`institution-name-${institution.id}`}>Nombre</Label>
                  <Input
                    id={`institution-name-${institution.id}`}
                    required
                    maxLength={120}
                    value={drafts[institution.id] ?? institution.name}
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [institution.id]: event.target.value }))
                    }
                    disabled={busy}
                  />
                  <p className="text-xs text-muted-foreground">
                    {institution.isActive ? "Activa" : "Inactiva"} · Versión {institution.version}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={
                    busy || (drafts[institution.id] ?? institution.name) === institution.name
                  }
                  onClick={() => void rename(institution)}
                >
                  Guardar nombre
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => void changeActive(institution)}
                >
                  {institution.isActive ? "Desactivar" : "Reactivar"}
                </Button>
              </div>
              <Button type="button" variant="ghost" onClick={() => void showHistory(institution)}>
                Ver historial
              </Button>
              {history[institution.id] && (
                <ol
                  className="space-y-2 border-l pl-4 text-sm"
                  aria-label={`Historial de ${institution.name}`}
                >
                  {history[institution.id]!.map((entry) => (
                    <li key={entry.id}>
                      <strong>{actionLabels[entry.action] ?? entry.action}</strong> · versión{" "}
                      {entry.versionBefore ?? "—"} → {entry.versionAfter} · actor{" "}
                      {entry.actorUserId} · {new Date(entry.occurredAt).toLocaleString("es-AR")}
                      <p className="text-muted-foreground">
                        {entry.beforeState
                          ? `${entry.beforeState.name} (${entry.beforeState.isActive ? "activa" : "inactiva"})`
                          : "Sin estado previo"}{" "}
                        → {entry.afterState.name} (
                        {entry.afterState.isActive ? "activa" : "inactiva"})
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
          {institutions.length === 0 && (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Todavía no hay instituciones o destinos en el catálogo.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
