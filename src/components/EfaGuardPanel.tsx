import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { EfaObservationPanel } from "@/components/EfaObservationPanel";
import {
  correctEfaGuardEnd,
  endEfaGuard,
  listActiveEfaGuardBases,
  listEfaGuards,
  setEfaGuardBases,
  startEfaGuard,
} from "@/lib/efa-guards.functions";

export type GuardBase = { id: string; name: string; isActive: boolean };
export type GuardEvent = {
  baseId: string;
  baseName: string;
  actorUserId: string;
  action: "added" | "removed";
  occurredAt: Date | string;
};
export type GuardView = {
  id: string;
  ownerUserId: string;
  startedAt: Date | string;
  endedAt: Date | string | null;
  declaredAtCentral: boolean;
  version: number;
  bases: GuardBase[];
  baseEvents: GuardEvent[];
};

function toLocalDateTimeValue(value: Date | string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function EfaGuardPanel({
  initialGuards,
  activeBases,
  currentUserId,
  isAdmin,
  canWrite,
}: {
  initialGuards: GuardView[];
  activeBases: GuardBase[];
  currentUserId: string;
  isAdmin: boolean;
  canWrite: boolean;
}) {
  const listGuards = useServerFn(listEfaGuards);
  const listBases = useServerFn(listActiveEfaGuardBases);
  const startGuard = useServerFn(startEfaGuard);
  const updateBases = useServerFn(setEfaGuardBases);
  const endGuard = useServerFn(endEfaGuard);
  const correctGuardEnd = useServerFn(correctEfaGuardEnd);
  const [guards, setGuards] = useState(initialGuards);
  const [bases, setBases] = useState(activeBases);
  const [selectedBaseIds, setSelectedBaseIds] = useState<string[]>(() => {
    const openOwnGuard = initialGuards.find(
      (guard) => guard.ownerUserId === currentUserId && !guard.endedAt,
    );
    return openOwnGuard?.bases.map((base) => base.id) ?? [];
  });
  const [centralConfirmed, setCentralConfirmed] = useState(false);
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [observationGuardId, setObservationGuardId] = useState<string | null>(null);

  async function refresh() {
    const [nextGuards, nextBases] = await Promise.all([
      listGuards(),
      canWrite ? listBases() : Promise.resolve([]),
    ]);
    const currentGuards = nextGuards as GuardView[];
    setGuards(currentGuards);
    setBases(nextBases as GuardBase[]);
    const open = currentGuards.find(
      (guard) => guard.ownerUserId === currentUserId && !guard.endedAt,
    );
    setSelectedBaseIds(open?.bases.map((base) => base.id) ?? []);
  }

  async function runAction(action: () => Promise<unknown>, success: string) {
    if (!canWrite || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      await refresh();
      setMessage(success);
    } catch {
      setError("No se pudo guardar el cambio. Actualiza la guardia e inténtalo nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  const openOwnGuard = guards.find(
    (guard) => guard.ownerUserId === currentUserId && !guard.endedAt,
  );

  return (
    <div className="space-y-5">
      <Button asChild variant="outline" className="min-h-11">
        <Link to="/episodios-efa">Ver episodios de atención</Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Guardia EFA</CardTitle>
          <p className="text-sm text-muted-foreground">
            El inicio y el cierre son manuales. La declaración de presencia no usa GPS ni verifica
            ubicación.
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
          {!openOwnGuard && canWrite && (
            <div className="space-y-4 rounded-lg border p-4">
              <p className="font-medium">Iniciar una guardia</p>
              <label className="flex min-h-11 items-start gap-3 text-sm">
                <input
                  className="mt-1 size-5 accent-primary"
                  type="checkbox"
                  checked={centralConfirmed}
                  onChange={(event) => setCentralConfirmed(event.target.checked)}
                />
                <span>Declaro que estoy en la Central al iniciar esta guardia.</span>
              </label>
              <Button
                className="min-h-11 w-full sm:w-auto"
                disabled={busy || !canWrite || !centralConfirmed}
                onClick={() =>
                  void runAction(async () => {
                    await startGuard({ data: { declaredAtCentral: true } });
                    setCentralConfirmed(false);
                  }, "La guardia se inició.")
                }
              >
                Iniciar guardia
              </Button>
            </div>
          )}
          {openOwnGuard && (
            <div className="space-y-4 rounded-lg border p-4">
              <div>
                <p className="font-medium">Guardia en curso</p>
                <p className="text-sm text-muted-foreground">
                  Inicio: {new Date(openOwnGuard.startedAt).toLocaleString()} · Presencia declarada
                  en Central
                </p>
              </div>
              <fieldset className="space-y-3" disabled={busy || !canWrite}>
                <legend className="text-sm font-medium">Bases seguidas</legend>
                {(canWrite ? bases : openOwnGuard.bases).map((base) => (
                  <label
                    key={base.id}
                    className="flex min-h-11 items-center gap-3 rounded-md border p-3 text-sm"
                  >
                    <input
                      className="size-5 accent-primary"
                      type="checkbox"
                      checked={selectedBaseIds.includes(base.id)}
                      onChange={(event) =>
                        setSelectedBaseIds((current) =>
                          event.target.checked
                            ? [...current, base.id]
                            : current.filter((id) => id !== base.id),
                        )
                      }
                    />
                    <span>{base.name}</span>
                  </label>
                ))}
                {canWrite && bases.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No hay bases activas en el catálogo.
                  </p>
                )}
              </fieldset>
              {canWrite && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Selecciona al menos una base. Cada alta o baja queda registrada con su autor y
                    hora.
                  </p>
                  <Button
                    variant="outline"
                    className="min-h-11 w-full sm:w-auto"
                    disabled={
                      busy ||
                      selectedBaseIds.length === 0 ||
                      (selectedBaseIds.length === openOwnGuard.bases.length &&
                        selectedBaseIds.every((id) =>
                          openOwnGuard.bases.some((base) => base.id === id),
                        ))
                    }
                    onClick={() =>
                      void runAction(
                        () =>
                          updateBases({
                            data: {
                              guardId: openOwnGuard.id,
                              expectedVersion: openOwnGuard.version,
                              baseIds: selectedBaseIds,
                            },
                          }),
                        "Las bases seguidas se actualizaron.",
                      )
                    }
                  >
                    Guardar bases
                  </Button>
                </>
              )}
              <Button
                variant="destructive"
                className="min-h-11 w-full sm:w-auto"
                disabled={busy || !canWrite}
                onClick={() =>
                  void runAction(
                    () =>
                      endGuard({
                        data: { guardId: openOwnGuard.id, expectedVersion: openOwnGuard.version },
                      }),
                    "La guardia terminó manualmente.",
                  )
                }
              >
                Terminar guardia
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isAdmin ? "Historial de guardias" : "Mis guardias"}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Administración puede consultar todas las guardias y corregir su hora de cierre."
              : "Solo se muestran guardias propias."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {guards.map((guard) => (
            <article key={guard.id} className="space-y-3 rounded-lg border p-4">
              <div>
                {isAdmin && <p className="text-sm font-medium">Responsable: {guard.ownerUserId}</p>}
                <p className="text-sm">Inicio: {new Date(guard.startedAt).toLocaleString()}</p>
                <p className="text-sm">
                  {guard.endedAt ? `Fin: ${new Date(guard.endedAt).toLocaleString()}` : "En curso"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Presencia declarada en Central · versión {guard.version}
                </p>
              </div>
              <div className="space-y-1 text-sm">
                <p className="font-medium">Bases seguidas</p>
                <p>
                  {guard.bases.length
                    ? guard.bases.map((base) => base.name).join(", ")
                    : "Sin base activa"}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => setObservationGuardId(guard.id)}
              >
                Ver conductas observadas
              </Button>
              {observationGuardId === guard.id && (
                <section key={`${currentUserId}:${guard.id}`} className="space-y-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => setObservationGuardId(null)}
                  >
                    Cerrar conductas observadas
                  </Button>
                  <EfaObservationPanel
                    root={{
                      guardId: guard.id,
                      ownerUserId: guard.ownerUserId,
                      guardEndedAt: guard.endedAt,
                    }}
                    title="Conductas observadas de la guardia"
                    currentUserId={currentUserId}
                    canWrite={canWrite && (isAdmin || guard.ownerUserId === currentUserId)}
                    isAdmin={isAdmin}
                  />
                </section>
              )}
              {guard.baseEvents.length > 0 && (
                <details>
                  <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
                    Historial de cambios de base
                  </summary>
                  <ul className="space-y-2 pl-5 text-sm">
                    {guard.baseEvents.map((event, index) => (
                      <li key={`${event.baseId}-${event.action}-${index}`}>
                        {event.action === "added" ? "Agregó" : "Quitó"} {event.baseName} ·{" "}
                        {new Date(event.occurredAt).toLocaleString()} · actor {event.actorUserId}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {isAdmin && canWrite && guard.endedAt && (
                <div className="space-y-2 border-t pt-3">
                  <Label htmlFor={`guard-end-${guard.id}`}>Corregir hora de cierre</Label>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <input
                      id={`guard-end-${guard.id}`}
                      className="min-h-11 rounded-md border bg-background px-3 text-sm"
                      type="datetime-local"
                      value={corrections[guard.id] ?? toLocalDateTimeValue(guard.endedAt)}
                      onChange={(event) =>
                        setCorrections((current) => ({
                          ...current,
                          [guard.id]: event.target.value,
                        }))
                      }
                    />
                    <Button
                      variant="outline"
                      className="min-h-11"
                      disabled={
                        busy ||
                        !canWrite ||
                        !corrections[guard.id] ||
                        new Date(corrections[guard.id]!).getTime() ===
                          new Date(guard.endedAt).getTime()
                      }
                      onClick={() =>
                        void runAction(
                          () =>
                            correctGuardEnd({
                              data: {
                                guardId: guard.id,
                                expectedVersion: guard.version,
                                endedAt: new Date(corrections[guard.id]!).toISOString(),
                              },
                            }),
                          "La hora de cierre se corrigió y quedó en el historial.",
                        )
                      }
                    >
                      Guardar corrección
                    </Button>
                  </div>
                </div>
              )}
            </article>
          ))}
          {guards.length === 0 && (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Todavía no hay guardias registradas.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
