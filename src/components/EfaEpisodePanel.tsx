import { useRef, useState } from "react";
import { createClientOnlyFn, useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createEfaEpisode,
  getEfaEpisode,
  getEfaEpisodeHistory,
  listEfaEpisodes,
  listEfaEpisodeNotices,
  markEfaEpisodeNoticeRead,
  updateEfaEpisode,
} from "@/lib/efa-episodes.functions";
import type {
  EpisodeFormValues,
  EpisodeFormSource,
  PendingEpisodeCreate,
  PendingEpisodeUpdate,
} from "@/lib/efa-episodes.client";

const loadEpisodeClientHelpers = createClientOnlyFn(() => import("@/lib/efa-episodes.client"));

// eslint-disable-next-line react-refresh/only-export-components
export function createEpisodeSubmissionGate() {
  let submitting = false;
  return {
    async run<T>(work: () => Promise<T>) {
      if (submitting) return { accepted: false as const };
      submitting = true;
      try {
        return { accepted: true as const, value: await work() };
      } finally {
        submitting = false;
      }
    },
  };
}

export type EpisodeView = {
  id: string;
  clientCreationKey: string;
  ownerUserId: string;
  originGuardId: string;
  eventAt: string;
  motive: string | null;
  address: string | null;
  interventionNumber: string | null;
  state: "draft";
  version: number;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
};
export type EpisodeAuditView = {
  id: string;
  episodeId: string;
  actorUserId: string;
  action: "created" | "updated";
  versionBefore: number | null;
  versionAfter: number;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown>;
  occurredAt: string;
};
export type EpisodeNoticeView = {
  id: string;
  episodeId: string;
  createdAt: string;
  readAt: string | null;
};
type OpenGuard = { id: string; startedAt: Date | string; endedAt: Date | string | null };
const emptyForm = (): EpisodeFormValues => ({
  eventAt: "",
  motive: "",
  address: "",
  interventionNumber: "",
});
// eslint-disable-next-line react-refresh/only-export-components
export const formatEpisodeDate = (value: Date | string) =>
  new Date(value).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
type EpisodeClientHelpers = typeof import("@/lib/efa-episodes.client");

export function EfaEpisodePanel({
  initialEpisodes,
  initialNotices,
  openOwnGuard,
  currentUserId,
  canWrite,
  isAdmin,
}: {
  initialEpisodes: EpisodeView[];
  initialNotices: EpisodeNoticeView[];
  openOwnGuard: OpenGuard | null;
  currentUserId: string;
  canWrite: boolean;
  isAdmin: boolean;
}) {
  const createEpisode = useServerFn(createEfaEpisode);
  const updateEpisode = useServerFn(updateEfaEpisode);
  const listEpisodes = useServerFn(listEfaEpisodes);
  const listNotices = useServerFn(listEfaEpisodeNotices);
  const getEpisode = useServerFn(getEfaEpisode);
  const getHistory = useServerFn(getEfaEpisodeHistory);
  const acknowledgeNotice = useServerFn(markEfaEpisodeNoticeRead);
  const [episodes, setEpisodes] = useState(initialEpisodes);
  const [notices, setNotices] = useState(initialNotices);
  const [form, setForm] = useState<EpisodeFormValues>(emptyForm);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<EpisodeAuditView[]>([]);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingEpisodeCreate | PendingEpisodeUpdate | null>(null);
  const [conflict, setConflict] = useState<EpisodeView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refreshWarning, setRefreshWarning] = useState("");
  const submissionGate = useRef(createEpisodeSubmissionGate());

  const selected = episodes.find((episode) => episode.id === selectedId) ?? null;
  const displayName = (episode: EpisodeView) =>
    episode.motive || episode.address || `Episodio del ${formatEpisodeDate(episode.eventAt)}`;

  function beginCreate() {
    setSelectedId(null);
    setConflict(null);
    setForm(emptyForm());
    setError("");
    setMessage("");
  }

  function editEpisode(episode: EpisodeView) {
    if (!canWrite || !episode.canEdit) return;
    setSelectedId(episode.id);
    setConflict(null);
    void loadEpisodeClientHelpers().then(({ isoToLocalDateTimeValue }) =>
      setForm({
        eventAt: isoToLocalDateTimeValue(episode.eventAt),
        motive: episode.motive ?? "",
        address: episode.address ?? "",
        interventionNumber: episode.interventionNumber ?? "",
      }),
    );
    setError("");
    setMessage("");
  }

  async function refreshAfterWrite(
    saved: EpisodeView,
    operationVersion: number,
    helpers: EpisodeClientHelpers,
  ) {
    setError("");
    setRefreshWarning("");
    try {
      const [nextEpisodes, nextNotices] = await Promise.all([listEpisodes(), listNotices()]);
      const baseline = helpers.confirmedEpisodeBaseline(saved, nextEpisodes as EpisodeFormSource[]);
      setEpisodes(nextEpisodes as EpisodeView[]);
      setNotices(nextNotices as EpisodeNoticeView[]);
      setForm(baseline.form);
    } catch {
      const baseline = helpers.confirmedEpisodeBaseline(saved, []);
      setEpisodes((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setForm(baseline.form);
      setRefreshWarning("El guardado quedó confirmado, pero no se pudo actualizar el historial.");
    }
    setSelectedId(saved.id);
    setConflict(null);
    setMessage(`Guardado confirmado (versión ${operationVersion}).`);
    setPending(null);
  }

  async function applyPending(
    operation: PendingEpisodeCreate | PendingEpisodeUpdate,
    loadedHelpers?: EpisodeClientHelpers,
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    setRefreshWarning("");
    try {
      const helpers = loadedHelpers ?? (await loadEpisodeClientHelpers());
      const result =
        operation.kind === "create"
          ? await createEpisode({ data: operation.payload })
          : await updateEpisode({ data: operation.payload });
      await refreshAfterWrite(
        result.episode as EpisodeView,
        result.operation.appliedVersion,
        helpers,
      );
      if (operation.kind === "create") {
        setForm(emptyForm());
        setSelectedId(null);
      }
    } catch (cause) {
      const { episodeErrorKind } = await loadEpisodeClientHelpers();
      const kind = episodeErrorKind(cause);
      if (kind === "conflict" && operation.kind === "update") {
        setPending(null);
        setConflict(selected);
        setError(
          "El borrador cambió en otra sesión. Tus datos siguen aquí; carga la versión actual antes de guardar otra vez.",
        );
      } else if (kind === "permission") {
        setError(
          "No tienes permiso EFA vigente para guardar. Tus datos permanecen en esta pantalla.",
        );
      } else {
        setPending(operation);
        setError(
          "No se pudo confirmar la respuesta del servidor. Reintenta exactamente la misma operación; no cambies estos datos.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!canWrite || pending || conflict) return;
    void submissionGate.current
      .run(async () => {
        setBusy(true);
        setError("");
        try {
          const helpers = await loadEpisodeClientHelpers();
          const validation = helpers.validateEpisodeForm(form);
          if (!validation.valid) {
            setError("Indica una fecha y hora válidas para el episodio.");
            return;
          }
          const normalized = { ...form, eventAt: validation.eventAt };
          const operation = selected
            ? helpers.createPendingUpdate({
                episodeId: selected.id,
                expectedVersion: selected.version,
                eventAt: validation.eventAt,
                motive: normalized.motive,
                address: normalized.address,
                interventionNumber: normalized.interventionNumber,
              })
            : openOwnGuard
              ? helpers.createPendingCreate(openOwnGuard.id, normalized)
              : null;
          if (!operation) {
            setError("Para crear un episodio necesitas una guardia propia abierta.");
            return;
          }
          setPending(operation);
          await applyPending(operation, helpers);
        } catch {
          setError(
            "No se pudo preparar el borrador para guardar. Tus datos permanecen en esta pantalla.",
          );
        } finally {
          setBusy(false);
        }
      })
      .catch(() => setError("No se pudo preparar el borrador para guardar."));
  }

  async function loadServerVersion() {
    if (!conflict) return;
    setBusy(true);
    setError("");
    try {
      const latest = (await getEpisode({ data: conflict.id })) as EpisodeView;
      const { isoToLocalDateTimeValue } = await loadEpisodeClientHelpers();
      setEpisodes((current) => current.map((item) => (item.id === latest.id ? latest : item)));
      setSelectedId(latest.id);
      setForm({
        eventAt: isoToLocalDateTimeValue(latest.eventAt),
        motive: latest.motive ?? "",
        address: latest.address ?? "",
        interventionNumber: latest.interventionNumber ?? "",
      });
      setConflict(null);
      setMessage("Se cargó la versión actual del servidor. Revisa los datos antes de guardar.");
    } catch {
      setError("No se pudo cargar la versión actual. Tus datos no se modificaron.");
    } finally {
      setBusy(false);
    }
  }

  async function showHistory(episodeId: string) {
    setBusy(true);
    setError("");
    try {
      const rows = (await getHistory({ data: episodeId })) as EpisodeAuditView[];
      setHistory(rows);
      setHistoryFor(episodeId);
    } catch {
      setError("No se pudo cargar el historial autorizado.");
    } finally {
      setBusy(false);
    }
  }

  async function markRead(noticeId: string) {
    setBusy(true);
    setError("");
    try {
      const saved = (await acknowledgeNotice({ data: noticeId })) as EpisodeNoticeView;
      setNotices((current) => current.map((item) => (item.id === saved.id ? saved : item)));
    } catch {
      setError("No se pudo actualizar el aviso. Puedes volver a intentarlo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Episodios de atención</CardTitle>
          <p className="text-sm text-muted-foreground">
            Los episodios se guardan como borradores. Si sales antes de confirmar el guardado, los
            cambios pendientes pueden perderse; no hay cola offline.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canWrite && (
            <p className="rounded-md bg-muted p-3 text-sm">
              Solo lectura: conservas el acceso a tu historial, pero se requiere acceso EFA vigente
              para editar.
            </p>
          )}
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
          {refreshWarning && (
            <p role="status" className="text-sm text-amber-800">
              {refreshWarning}
            </p>
          )}
          {pending && (
            <div className="rounded-md border border-amber-500/50 bg-amber-50 p-3 text-sm">
              Operación pendiente de confirmación. Los campos están congelados para conservar la
              misma identidad y el mismo contenido.
              <Button
                className="mt-3 min-h-11 w-full sm:w-auto"
                disabled={busy}
                onClick={() => void applyPending(pending)}
              >
                Reintentar misma operación
              </Button>
            </div>
          )}
          {conflict && (
            <Button
              variant="outline"
              className="min-h-11"
              disabled={busy}
              onClick={() => void loadServerVersion()}
            >
              Cargar versión actual del servidor
            </Button>
          )}
          {canWrite && !selected && openOwnGuard && !pending && !conflict && (
            <Button className="min-h-11 w-full sm:w-auto" onClick={beginCreate}>
              Nuevo episodio
            </Button>
          )}
          {canWrite && !selected && !openOwnGuard && !pending && (
            <p className="rounded-md border p-3 text-sm">
              Para iniciar un episodio nuevo, abre primero tu guardia EFA. Los borradores existentes
              pueden completarse aunque su guardia haya terminado.
            </p>
          )}
          {selected && canWrite && selected.canEdit && (
            <Button
              variant="outline"
              className="min-h-11"
              onClick={beginCreate}
              disabled={Boolean(pending) || Boolean(conflict)}
            >
              Dejar de editar
            </Button>
          )}
        </CardContent>
      </Card>

      {canWrite && (selected || (!selected && openOwnGuard && message === "")) && (
        <Card>
          <CardHeader>
            <CardTitle>
              {selected ? `Editar borrador · versión ${selected.version}` : "Nuevo borrador"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="episode-event-at">Fecha y hora del hecho</Label>
              <Input
                id="episode-event-at"
                type="datetime-local"
                value={form.eventAt}
                disabled={busy || Boolean(pending) || Boolean(conflict)}
                onChange={(event) => setForm({ ...form, eventAt: event.target.value })}
              />
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={busy || Boolean(pending) || Boolean(conflict)}
                onClick={() =>
                  void loadEpisodeClientHelpers().then(({ isoToLocalDateTimeValue }) =>
                    setForm({ ...form, eventAt: isoToLocalDateTimeValue(new Date()) }),
                  )
                }
              >
                Usar ahora
              </Button>
              <p className="text-xs text-muted-foreground">
                Se interpreta en la zona horaria local del dispositivo y se conserva como un
                instante.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="episode-motive">Motivo (opcional)</Label>
              <Textarea
                id="episode-motive"
                maxLength={2000}
                value={form.motive}
                disabled={busy || Boolean(pending) || Boolean(conflict)}
                onChange={(event) => setForm({ ...form, motive: event.target.value })}
                placeholder="Describe brevemente la atención"
              />
            </div>
            <details className="rounded-md border p-3">
              <summary className="min-h-11 cursor-pointer py-2 font-medium">
                Datos opcionales de ubicación e intervención
              </summary>
              <div className="space-y-4 pt-3">
                <div className="space-y-2">
                  <Label htmlFor="episode-address">Dirección exacta (dato privado)</Label>
                  <Textarea
                    id="episode-address"
                    maxLength={1000}
                    value={form.address}
                    disabled={busy || Boolean(pending) || Boolean(conflict)}
                    onChange={(event) => setForm({ ...form, address: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="episode-intervention">Número de intervención (opcional)</Label>
                  <Input
                    id="episode-intervention"
                    maxLength={100}
                    value={form.interventionNumber}
                    disabled={busy || Boolean(pending) || Boolean(conflict)}
                    onChange={(event) =>
                      setForm({ ...form, interventionNumber: event.target.value })
                    }
                  />
                </div>
              </div>
            </details>
            <p className="text-xs text-muted-foreground">
              Si no completas motivo ni dirección, el borrador se identifica por fecha y hora. El
              número de intervención conserva ceros iniciales.
            </p>
            <Button
              className="min-h-11 w-full sm:w-auto"
              disabled={busy || Boolean(pending) || Boolean(conflict)}
              onClick={save}
            >
              Guardar borrador
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{isAdmin ? "Historial de episodios" : "Mis episodios"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {episodes.length === 0 && (
            <p className="text-sm text-muted-foreground">Todavía no hay episodios guardados.</p>
          )}
          {episodes.map((episode) => (
            <article key={episode.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="font-medium">{displayName(episode)}</h3>
                  <p className="text-sm text-muted-foreground">
                    Borrador · hecho {formatEpisodeDate(episode.eventAt)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Capturado {formatEpisodeDate(episode.createdAt)} · actualizado{" "}
                    {formatEpisodeDate(episode.updatedAt)} · versión {episode.version}
                  </p>
                  {isAdmin && (
                    <p className="text-xs text-muted-foreground">Autor: {episode.ownerUserId}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() => void showHistory(episode.id)}
                  >
                    Ver historial
                  </Button>
                  {canWrite && episode.canEdit && (
                    <Button
                      variant="secondary"
                      className="min-h-11"
                      disabled={busy || Boolean(pending) || Boolean(conflict)}
                      onClick={() => editEpisode(episode)}
                    >
                      Editar
                    </Button>
                  )}
                </div>
              </div>
              {historyFor === episode.id && (
                <div className="space-y-3 border-t pt-3">
                  <h4 className="font-medium">Cambios registrados</h4>
                  {history.map((item) => (
                    <div key={item.id} className="rounded-md bg-muted p-3 text-sm">
                      <p>
                        {item.action === "created" ? "Creación" : "Corrección"} · versión{" "}
                        {item.versionBefore ?? "—"} → {item.versionAfter} ·{" "}
                        {formatEpisodeDate(item.occurredAt)}
                      </p>
                      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div>
                          <dt className="font-medium">Antes</dt>
                          <dd className="break-words">
                            {item.beforeState
                              ? JSON.stringify(item.beforeState)
                              : "Sin estado previo"}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium">Después</dt>
                          <dd className="break-words">{JSON.stringify(item.afterState)}</dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Avisos de corrección</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {notices.length === 0 && (
            <p className="text-sm text-muted-foreground">No tienes avisos pendientes.</p>
          )}
          {notices.map((notice) => (
            <div
              key={notice.id}
              className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm">Un administrador corrigió un episodio.</p>
                <p className="text-xs text-muted-foreground">
                  Aviso del {formatEpisodeDate(notice.createdAt)}
                  {notice.readAt ? ` · leído ${formatEpisodeDate(notice.readAt)}` : ""}
                </p>
              </div>
              {!notice.readAt && (
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => void markRead(notice.id)}
                >
                  Marcar como leído
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
