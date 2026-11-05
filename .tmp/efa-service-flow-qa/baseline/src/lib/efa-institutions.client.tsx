import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createEfaInstitutionInline, listEfaInstitutions } from "./efa-institutions.functions";

export type EfaInstitutionChoice = { id: string; name: string; isActive: true; version: number };

export function EfaInstitutionPicker({
  initialInstitutions,
  value,
  onChange,
  onInstitutionsChanged,
}: {
  initialInstitutions: EfaInstitutionChoice[];
  value: string;
  onChange: (institutionId: string) => void;
  onInstitutionsChanged?: (institutions: EfaInstitutionChoice[]) => void;
}) {
  const listInstitutions = useServerFn(listEfaInstitutions);
  const createInstitution = useServerFn(createEfaInstitutionInline);
  const [institutions, setInstitutions] = useState(initialInstitutions);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await createInstitution({ data: { name: newName } });
      const current = (await listInstitutions()) as EfaInstitutionChoice[];
      setInstitutions(current);
      onInstitutionsChanged?.(current);
      onChange(created.id);
      setNewName("");
    } catch {
      setError("No se pudo agregar la opción. Comprueba el nombre y vuelve a intentarlo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="efa-institution-choice">Institución o destino</Label>
        <select
          id="efa-institution-choice"
          className="min-h-11 w-full rounded-md border bg-background px-3"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Selecciona una institución o destino</option>
          {institutions.map((institution) => (
            <option key={institution.id} value={institution.id}>
              {institution.name}
            </option>
          ))}
        </select>
      </div>
      <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" onSubmit={create}>
        <div className="space-y-2">
          <Label htmlFor="efa-new-institution">Agregar una opción al catálogo compartido</Label>
          <p className="text-sm text-muted-foreground">
            Este catálogo es solo para instituciones y destinos institucionales. Los domicilios
            particulares se registran en el episodio y no deben crearse aquí.
          </p>
          <Input
            id="efa-new-institution"
            required
            maxLength={120}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            disabled={busy}
          />
        </div>
        <Button type="submit" variant="outline" className="min-h-11" disabled={busy}>
          {busy ? "Guardando…" : "Agregar opción"}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
