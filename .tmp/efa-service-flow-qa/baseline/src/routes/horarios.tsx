import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, CalendarDays, LoaderCircle, RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { WorkflowHeader } from "@/components/WorkflowHeader";
import { WorkflowShell } from "@/components/WorkflowShell";
import {
  getPublishedSchedule,
  type PublishedScheduleResult,
} from "@/lib/published-schedule.functions";

export const Route = createFileRoute("/horarios")({
  head: () => ({
    meta: [
      { title: "Horarios de guardia - Enfermería SeLIAR" },
      {
        name: "description",
        content: "Consultá el horario vigente de guardias de Enfermería SeLIAR.",
      },
    ],
  }),
  component: PublishedSchedule,
});

function PublishedSchedule() {
  const getSchedule = useServerFn(getPublishedSchedule);
  const [result, setResult] = useState<PublishedScheduleResult | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await getSchedule());
    } catch {
      setResult({ state: "error" });
    } finally {
      setLoading(false);
    }
  }, [getSchedule]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <WorkflowShell
      header={
        <WorkflowHeader
          eyebrow="Equipo de enfermería"
          title="Horarios de guardia"
          description="Consultá el cronograma vigente."
          contentWidth="wide"
        />
      }
    >
      <section className="space-y-4" aria-labelledby="schedule-title">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
              <CalendarDays className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="schedule-title" className="font-display text-xl font-bold text-foreground">
                Cronograma actual
              </h2>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                Este documento se actualiza cuando coordinación reemplaza el archivo vigente.
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-6 text-center">
            <LoaderCircle className="size-8 animate-spin text-primary" aria-hidden="true" />
            <p className="text-sm font-medium text-muted-foreground" role="status">
              Cargando el horario vigente…
            </p>
          </div>
        ) : result?.state === "available" ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <p className="truncate text-sm font-semibold text-foreground">{result.fileName}</p>
            </div>
            <iframe
              title={`Horario vigente: ${result.fileName}`}
              src={result.viewerUrl}
              className="h-[min(78vh,64rem)] min-h-[32rem] w-full bg-muted"
              referrerPolicy="no-referrer"
              allowFullScreen
            />
          </div>
        ) : (
          <ScheduleMessage state={result?.state ?? "error"} onRetry={() => void refresh()} />
        )}
      </section>
    </WorkflowShell>
  );
}

function ScheduleMessage({
  state,
  onRetry,
}: {
  state: Exclude<PublishedScheduleResult["state"], "available">;
  onRetry: () => void;
}) {
  const messages: Record<typeof state, { title: string; description: string }> = {
    empty: {
      title: "Todavía no hay un horario publicado",
      description: "Coordinación debe agregar el PDF vigente a la carpeta configurada.",
    },
    multiple: {
      title: "La carpeta necesita una revisión",
      description:
        "Debe contener un solo archivo. Coordinación debe dejar únicamente el PDF vigente.",
    },
    invalid_file: {
      title: "El archivo publicado no es un PDF",
      description: "Coordinación debe reemplazarlo por el PDF vigente del cronograma.",
    },
    not_configured: {
      title: "El horario no está configurado todavía",
      description: "Falta configurar la conexión del servidor. Avisale al equipo administrador.",
    },
    error: {
      title: "No se pudo cargar el horario",
      description:
        "Revisá tu conexión e intentá nuevamente. Si el problema continúa, avisale a coordinación.",
    },
  };
  const message = messages[state];

  return (
    <div
      className="rounded-xl border border-border bg-card p-6 text-center shadow-sm"
      role="status"
    >
      <AlertCircle className="mx-auto size-8 text-[var(--brand-orange)]" aria-hidden="true" />
      <h2 className="mt-3 font-display text-lg font-bold text-foreground">{message.title}</h2>
      <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
        {message.description}
      </p>
      {(state === "error" || state === "not_configured") && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <RotateCw className="size-4" aria-hidden="true" />
          Reintentar
        </button>
      )}
    </div>
  );
}
