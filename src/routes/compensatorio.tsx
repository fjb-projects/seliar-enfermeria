import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, FileWarningIcon } from "lucide-react";
import { useState } from "react";

import { CompensatoryPublicForm } from "@/components/CompensatoryPublicForm";
import { WorkflowHeader } from "@/components/WorkflowHeader";
import { WorkflowIntro } from "@/components/WorkflowIntro";
import { WorkflowShell } from "@/components/WorkflowShell";

export const Route = createFileRoute("/compensatorio")({
  head: () => ({
    meta: [
      { title: "Compensatorio | SeLIAR" },
      {
        name: "description",
        content: "Solicitud de horas compensatorias para el equipo de enfermería.",
      },
    ],
  }),
  component: Compensatorio,
});

export function Compensatorio() {
  return (
    <WorkflowShell
      contentWidth="narrow"
      header={
        <WorkflowHeader
          eyebrow="Gestiones de enfermería"
          title="Solicitud de compensatorio"
          description="Registrá horas compensatorias para su evaluación."
          contentWidth="narrow"
        />
      }
    >
      <WorkflowIntro
        eyebrow="Solicitud de compensatorio"
        description="Consultá la normativa y completá una solicitud para su revisión."
      >
        <span className="mb-4 inline-flex w-fit items-center rounded-full bg-warning-soft px-3 py-1.5 text-xs font-bold text-warning-foreground">
          Solicitud pendiente de evaluación
        </span>
      </WorkflowIntro>

      <CompensatoryPolicyInfo />
      <CompensatoryPublicForm />
    </WorkflowShell>
  );
}

function CompensatoryPolicyInfo() {
  const [expanded, setExpanded] = useState(false);

  return (
    <section
      className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm sm:p-5"
      aria-labelledby="compensatory-policy-heading"
    >
      <div className="flex items-start gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-800">
          <FileWarningIcon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="compensatory-policy-heading" className="font-display text-base font-bold">
            Información sobre compensatorios
          </h2>
          <div
            id="compensatory-policy-content"
            className={`relative mt-1 overflow-hidden text-sm leading-5 text-muted-foreground transition-[max-height] duration-150 motion-reduce:transition-none ${expanded ? "max-h-[120rem]" : "max-h-16"}`}
          >
            <div className="space-y-4 pr-1">
              <p>
                <strong className="text-foreground">ARTÍCULO 68°. a.</strong> Cuando el servicio lo
                permita, el Jefe de la Unidad de Organización podrá autorizar franquicias de hasta 3
                jornadas laborables por mes calendario (en forma total o fraccionada), compensables
                en días o turnos complementarios, de trabajo, de igual duración que la franquicia
                otorgada.
              </p>
              <p>
                Estas franquicias deben compensarse dentro de los 30 días posteriores a su
                otorgamiento, pudiendo prolongarse este término hasta 90 días cuando fundadas
                razones de servicio, así lo justifiquen.
              </p>
              <p>
                <strong className="text-foreground">b.</strong> Cuando por razones de servicio
                excepcionales, el agente deba desempeñarse fuera del horario habitual de trabajo, y
                las horas trabajadas en ampliación horaria no hayan sido autorizadas como “horas
                extraordinarias”, deberán computársele como “horas compensatorias”, valorándose cada
                hora trabajada en exceso, del mismo modo que se efectúa el cálculo para el pago de
                las extras, teniendo en cuenta el día (laborable o no) y el horario en que efectuó
                la ampliación horaria.
              </p>
              <p>
                Las horas compensatorias registradas a favor del agente deberán otorgarse cuando
                éste lo solicite y siempre que el servicio lo permita. No obstante, no podrá
                prorrogarse su autorización por más de 48 horas a partir de la fecha en que se
                solicitara.
              </p>
            </div>
            {!expanded && (
              <span
                className="pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-indigo-50 via-indigo-50/90 to-transparent"
                aria-hidden="true"
              />
            )}
          </div>
        </div>
      </div>
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-bold text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:brightness-95 motion-safe:duration-150 motion-reduce:transition-none"
        aria-controls="compensatory-policy-content"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        {expanded ? "Ocultar información" : "Leer información completa"}
        <ChevronDown
          className={`size-4 transition-transform motion-safe:duration-150 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
    </section>
  );
}
