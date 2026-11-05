import { Check, MessageSquarePlus, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import {
  INSTRUCCIONES_INVENTARIO,
  etiquetaInventario,
  type CasillaId,
  type InventarioItem,
  type OpcionInventario,
} from "@/lib/registro-data";

interface Props {
  titulo: string;
  items: InventarioItem[];
  opciones: OpcionInventario[];
  valores: Record<string, CasillaId[]>;
  onCambio: (nombre: string, casillas: CasillaId[]) => void;
  observaciones: string;
  onObservaciones: (texto: string) => void;
  etiquetaObservaciones?: string;
  mostrarObservaciones?: boolean;
  anotaciones?: Record<string, string>;
  anotacionesResumen?: { nombre: string; texto: string }[];
  onAnotacion?: (nombre: string, texto: string) => void;
  requierenAnotacion?: string[];
}

function estadoFila(casillas: CasillaId[]): "ok" | "alerta" | "vacio" {
  if (casillas.length === 0) return "vacio";
  if (casillas.includes("completo")) return "ok";
  return "alerta";
}

function cantidadFaltante(id: string): number | null {
  const cantidad = id.match(/^faltante_(\d+)$/)?.[1];
  return cantidad ? Number(cantidad) : null;
}

function colorCantidadFaltante(cantidad: number, total: number) {
  const proporcion = cantidad / total;

  if (proporcion >= 0.6) {
    const intensidad = Math.min(100, 45 + Math.round(((proporcion - 0.6) / 0.4) * 55));
    return {
      backgroundColor: `color-mix(in oklch, var(--brand-orange) ${100 - intensidad}%, var(--destructive) ${intensidad}%)`,
      borderColor: "var(--destructive)",
    };
  }
  if (proporcion >= 0.25) {
    const intensidad = 30 + Math.round(((proporcion - 0.25) / 0.35) * 60);
    return {
      backgroundColor: `color-mix(in oklch, var(--warning) ${100 - intensidad}%, var(--brand-orange) ${intensidad}%)`,
      borderColor: "var(--brand-orange)",
    };
  }
  const intensidad = 18 + Math.round((proporcion / 0.25) * 72);
  return {
    backgroundColor: `color-mix(in oklch, var(--warning-soft) ${100 - intensidad}%, var(--warning) ${intensidad}%)`,
    borderColor: "color-mix(in oklch, var(--warning) 65%, var(--border))",
  };
}

export function InventarioGrid({
  titulo,
  items,
  opciones,
  valores,
  onCambio,
  observaciones,
  onObservaciones,
  etiquetaObservaciones = "Observaciones de esta sección",
  mostrarObservaciones = true,
  anotaciones,
  anotacionesResumen,
  onAnotacion,
  requierenAnotacion = [],
}: Props) {
  const [anotacionAbierta, setAnotacionAbierta] = useState<string | null>(null);

  const alternar = (nombre: string, casilla: CasillaId) => {
    const actuales = valores[nombre] ?? [];
    let nuevas: CasillaId[];
    if (casilla === "completo") {
      nuevas = actuales.includes("completo") ? [] : ["completo"];
    } else {
      const excluyente = casilla === "roto" ? "revisar" : casilla === "revisar" ? "roto" : null;
      const esCantidadFaltante = cantidadFaltante(casilla) !== null;
      const disponibles = actuales.filter(
        (c) =>
          c !== "completo" &&
          c !== excluyente &&
          (!esCantidadFaltante || cantidadFaltante(c) === null),
      );
      nuevas = disponibles.includes(casilla)
        ? disponibles.filter((c) => c !== casilla)
        : [...disponibles, casilla];
    }
    onCambio(nombre, nuevas);
    if (!actuales.includes(casilla) && requierenAnotacion.includes(casilla)) {
      setAnotacionAbierta(nombre);
    }
  };

  const anotacionesActivas =
    anotacionesResumen ??
    items.flatMap((item) => {
      const texto = anotaciones?.[item.nombre]?.trim();
      return texto ? [{ nombre: etiquetaInventario(item), texto }] : [];
    });
  const estadosConAnotacion = opciones
    .filter((opcion) => requierenAnotacion.includes(opcion.id))
    .map((opcion) => opcion.corta)
    .join(" y ");

  return (
    <section aria-label={titulo} className="space-y-5">
      <details className="rounded-[4px] border-l-4 border-primary bg-muted/70 px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          Instrucciones para completar esta sección
        </summary>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          {INSTRUCCIONES_INVENTARIO.map((inst) => (
            <li key={inst}>{inst}</li>
          ))}
          {anotaciones && requierenAnotacion.length > 0 && (
            <li>Los estados {estadosConAnotacion} requieren una anotación obligatoria.</li>
          )}
        </ul>
      </details>

      <div className="overflow-hidden rounded-[6px] border border-border bg-card">
        {items.map((item) => {
          const casillas = valores[item.nombre] ?? [];
          const estado = estadoFila(casillas);
          const anotacion = anotaciones?.[item.nombre] ?? "";
          const opcionesDisponibles = opciones.filter((opcion) => {
            const cantidad = cantidadFaltante(opcion.id);
            return (
              cantidad === null ||
              item.cantidadEsperada === undefined ||
              cantidad <= item.cantidadEsperada
            );
          });
          const opcionesCantidad = opcionesDisponibles.flatMap((opcion) => {
            const cantidad = cantidadFaltante(opcion.id);
            return cantidad === null ? [] : [{ opcion, cantidad }];
          });
          const opcionesEstado = opcionesDisponibles.filter(
            (opcion) => cantidadFaltante(opcion.id) === null,
          );
          const requiereAnotacion = casillas.some((casilla) =>
            requierenAnotacion.includes(casilla),
          );
          const faltaAnotacion = requiereAnotacion && !anotacion.trim();
          return (
            <div
              key={item.nombre}
              data-section-item
              data-section-item-incomplete={estado !== "ok" || faltaAnotacion ? "true" : "false"}
              className={`border-b border-border px-3 py-2.5 transition-colors last:border-b-0 ${
                estado === "alerta"
                  ? "border-l-4 border-l-warning bg-card"
                  : estado === "ok"
                    ? "border-l-4 border-l-[var(--success)] bg-[color-mix(in_oklch,var(--success)_4%,var(--card))]"
                    : "border-l-4 border-l-transparent bg-card"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium leading-tight text-foreground">
                  {etiquetaInventario(item)}
                </p>
                <span className="flex shrink-0 items-center gap-1">
                  {estado === "ok" && (
                    <span
                      className="inline-flex items-center text-[var(--success)]"
                      title="Revisado"
                    >
                      <Check className="size-4 shrink-0" aria-hidden />
                    </span>
                  )}
                  {estado === "alerta" && (
                    <TriangleAlert
                      className="size-4 shrink-0 text-warning"
                      aria-label="Con faltantes"
                    />
                  )}
                  {anotaciones && onAnotacion && anotacionAbierta !== item.nombre && (
                    <button
                      type="button"
                      onClick={() => setAnotacionAbierta(item.nombre)}
                      className={`inline-flex min-h-7 items-center gap-1 rounded-[3px] px-1.5 text-[10px] font-semibold ${
                        faltaAnotacion
                          ? "bg-destructive/10 text-destructive"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                      aria-label={`${anotacion ? "Editar" : "Agregar"} anotación de ${etiquetaInventario(item)}`}
                      title={anotacion ? "Editar anotación" : "Agregar anotación"}
                    >
                      {anotacion ? (
                        <Pencil className="size-3.5" aria-hidden />
                      ) : (
                        <MessageSquarePlus className="size-3.5" aria-hidden />
                      )}
                      {faltaAnotacion ? "Anotar" : "Nota"}
                    </button>
                  )}
                </span>
              </div>
              <div className="mt-2 flex min-w-0 items-center gap-1" role="group">
                {opcionesCantidad.length > 0 && item.cantidadEsperada && (
                  <fieldset className="flex shrink-0 items-center gap-1">
                    <legend className="sr-only">
                      Cantidad faltante de {etiquetaInventario(item)}
                    </legend>
                    <span className="mr-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                      Faltan
                    </span>
                    {opcionesCantidad.map(({ opcion, cantidad }) => {
                      const activa = casillas.includes(opcion.id);
                      const proporcion = cantidad / item.cantidadEsperada!;
                      return (
                        <button
                          key={opcion.id}
                          type="button"
                          onClick={() => alternar(item.nombre, opcion.id)}
                          aria-pressed={activa}
                          aria-label={`${opcion.etiqueta} de ${item.cantidadEsperada}`}
                          className={`size-8 rounded-[4px] border text-xs font-bold transition-transform ${proporcion >= 0.6 ? "text-destructive-foreground" : "text-warning-foreground"} ${activa ? "z-10 ring-2 ring-primary ring-offset-1" : "hover:-translate-y-0.5"}`}
                          style={colorCantidadFaltante(cantidad, item.cantidadEsperada!)}
                          title={`${opcion.etiqueta} de ${item.cantidadEsperada}`}
                        >
                          {cantidad}
                        </button>
                      );
                    })}
                  </fieldset>
                )}

                <div
                  className="ml-auto flex min-w-0 flex-1 overflow-hidden rounded-[4px] border border-border"
                  role="group"
                  aria-label={`Estado general de ${etiquetaInventario(item)}`}
                >
                  {opcionesEstado.map((opcion) => {
                    const activa = casillas.includes(opcion.id);
                    return (
                      <button
                        key={opcion.id}
                        type="button"
                        onClick={() => alternar(item.nombre, opcion.id)}
                        aria-pressed={activa}
                        className={`min-h-8 min-w-0 flex-1 rounded-none border-0 border-r border-border px-1 text-[10px] font-semibold transition-colors last:border-r-0 sm:text-xs ${
                          activa
                            ? opcion.id === "completo"
                              ? "bg-[var(--success)] text-white"
                              : "bg-warning text-warning-foreground"
                            : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                        title={opcion.etiqueta}
                      >
                        {opcion.id === "revisar" ? (
                          <>
                            <span className="sm:hidden">Rev.</span>
                            <span className="hidden sm:inline">{opcion.corta}</span>
                          </>
                        ) : (
                          opcion.corta
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {anotaciones && onAnotacion && anotacionAbierta === item.nombre && (
                <div className="mt-2 border-t border-border pt-2">
                  <div className="space-y-2">
                    <label
                      htmlFor={`anotacion-${items.indexOf(item)}`}
                      className="block text-sm font-medium text-foreground"
                    >
                      Anotación de {etiquetaInventario(item)}
                      {requiereAnotacion && <span className="text-destructive"> *</span>}
                    </label>
                    <textarea
                      id={`anotacion-${items.indexOf(item)}`}
                      value={anotacion}
                      onChange={(evento) => onAnotacion(item.nombre, evento.target.value)}
                      rows={2}
                      maxLength={500}
                      autoFocus
                      placeholder="Describí el problema o la situación encontrada…"
                      className={`w-full rounded-md border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
                        faltaAnotacion ? "border-destructive" : "border-input"
                      }`}
                    />
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        {anotacion.length}/500 caracteres
                      </span>
                      <div className="flex gap-2">
                        {anotacion && (
                          <button
                            type="button"
                            onClick={() => onAnotacion(item.nombre, "")}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="size-4" aria-hidden />
                            Eliminar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setAnotacionAbierta(null)}
                          disabled={faltaAnotacion}
                          className="min-h-9 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Listo
                        </button>
                      </div>
                    </div>
                    {faltaAnotacion && (
                      <p className="text-xs font-medium text-destructive">
                        Este estado requiere una anotación.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {mostrarObservaciones && (
        <div className="space-y-2">
          <label htmlFor={`obs-${titulo}`} className="block text-sm font-medium text-foreground">
            {etiquetaObservaciones}
          </label>
          <textarea
            id={`obs-${titulo}`}
            value={observaciones}
            onChange={(e) => onObservaciones(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Aclará aquí faltantes, roturas o faltantes mayores a 10 unidades…"
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
          />

          {anotaciones && anotacionesActivas.length > 0 && (
            <div className="space-y-2 border-l-4 border-primary bg-muted/60 p-3">
              <p className="text-sm font-semibold text-foreground">Anotaciones por ítem</p>
              <p className="text-xs text-muted-foreground">
                Se agregan automáticamente al envío. Para modificarlas o eliminarlas, hacelo desde
                el ítem correspondiente.
              </p>
              <ul className="space-y-1.5 text-sm text-foreground">
                {anotacionesActivas.map((item) => (
                  <li key={item.nombre}>
                    [{item.nombre}: &quot;{item.texto}&quot;]
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
