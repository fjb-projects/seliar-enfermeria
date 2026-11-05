import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ImagePlus, Loader2, Send, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { BadgeFlotanteProgreso } from "@/components/BadgeFlotanteProgreso";
import { InventarioGrid } from "@/components/InventarioGrid";
import { SeccionDesplegable, type EstadoSeccion } from "@/components/SeccionDesplegable";
import { WorkflowHeader } from "@/components/WorkflowHeader";
import { WorkflowIntro } from "@/components/WorkflowIntro";
import { WorkflowShell } from "@/components/WorkflowShell";
import { enviarRegistro } from "@/lib/registro.functions";
import {
  CASILLAS_DESCARTABLES,
  CASILLAS_EQUIPAMIENTO,
  CASILLAS_FARMACOLOGICOS,
  CONFIRMACIONES_FIN_GUARDIA,
  DESCARTABLES,
  EQUIPAMIENTOS_VARIOS,
  FARMACOLOGICOS,
  SECCIONES,
  TURNOS,
  etiquetaInventario,
  VIA_AEREA,
  type CasillaId,
  type InventarioItem,
  type RegistroPayload,
} from "@/lib/registro-data";

export const Route = createFileRoute("/control-guardia")({
  head: () => ({
    meta: [
      { title: "Registro de Enfermería - Control de Guardia SeLIAR" },
      {
        name: "description",
        content: "Control de ingreso y egreso de guardia de Enfermería SeLIAR.",
      },
    ],
  }),
  component: ControlGuardia,
});

const STORAGE_KEY = "registro-guardia-seliar-v2";
const EMAIL_HISTORY_KEY = "registro-guardia-seliar-emails-v1";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ADJUNTOS = 3;
const MAX_TAMANIO_ADJUNTO = 3 * 1024 * 1024;
const TIPOS_IMAGEN = ["image/jpeg", "image/png", "image/webp"];
const ESTADOS_FARMACOLOGICOS_CON_ANOTACION = ["roto", "revisar"];
const ESTADOS_DESCARTABLES_CON_ANOTACION = ["roto", "revisar"];
const ESTADOS_EQUIPAMIENTO_CON_ANOTACION = ["faltante_parcial", "deteriorado"];

interface RegistroBorrador extends RegistroPayload {
  anotacionesFarmacologicos: Record<string, string>;
  anotacionesDescartables: Record<string, string>;
  anotacionesViaAerea: Record<string, string>;
  anotacionesEquipamientosVarios: Record<string, string>;
}

const estadoInicial: RegistroBorrador = {
  guardia: {
    email: "",
    fecha: "",
    turno: "",
    movilNumero: "",
    patenteMovil: "",
    enfermeroEntrante: "",
    choferGuardia: "",
    medicoGuardia: "",
  },
  farmacologicos: {},
  descartables: {},
  viaAerea: {},
  equipamientosVarios: {},
  intervencionesCantidad: "",
  observacionesFarmacologicos: "",
  anotacionesFarmacologicos: {},
  observacionesDescartables: "",
  anotacionesDescartables: {},
  observacionesEquipamiento: "",
  anotacionesViaAerea: {},
  anotacionesEquipamientosVarios: {},
  observacionesGenerales: "",
  enfermeroRecibe: "",
  confirmaciones: [],
};

interface RevisionSeccion {
  estado: EstadoSeccion;
  resumen: string;
  faltantes: string[];
}

function revisarInventario(
  items: InventarioItem[],
  valores: Record<string, CasillaId[]>,
  anotaciones?: Record<string, string>,
  requierenAnotacion: string[] = [],
): RevisionSeccion {
  const sinMarcar = items.filter((item) => !valores[item.nombre]?.length);
  const sinAnotacion = items.filter(
    (item) =>
      valores[item.nombre]?.some((casilla) => requierenAnotacion.includes(casilla)) &&
      !anotaciones?.[item.nombre]?.trim(),
  );
  const marcados = items.length - sinMarcar.length;
  if (sinMarcar.length === 0 && sinAnotacion.length === 0) {
    return {
      estado: "completa",
      resumen: `${marcados} de ${items.length} ítems revisados`,
      faltantes: [],
    };
  }
  const listado = sinMarcar.slice(0, 4).map(etiquetaInventario);
  if (sinMarcar.length > 4) listado.push(`y ${sinMarcar.length - 4} más`);
  const faltantes: string[] = [];
  if (listado.length > 0) faltantes.push(`Sin marcar: ${listado.join(", ")}`);
  if (sinAnotacion.length > 0) {
    faltantes.push(
      `Falta anotación: ${sinAnotacion
        .slice(0, 4)
        .map(etiquetaInventario)
        .join(", ")}${sinAnotacion.length > 4 ? ` y ${sinAnotacion.length - 4} más` : ""}`,
    );
  }
  return {
    estado: marcados === 0 ? "vacia" : "incompleta",
    resumen: `${marcados} de ${items.length} ítems revisados`,
    faltantes,
  };
}

function combinarRevisiones(...revisiones: RevisionSeccion[]): RevisionSeccion {
  const faltantes = revisiones.flatMap((revision) => revision.faltantes);
  const completas = revisiones.filter((revision) => revision.estado === "completa").length;
  return {
    estado: completas === revisiones.length ? "completa" : completas === 0 ? "vacia" : "incompleta",
    resumen: `${completas} de ${revisiones.length} controles completos`,
    faltantes,
  };
}

function ControlGuardia() {
  const [abiertas, setAbiertas] = useState<number[]>([0]);
  const [datos, setDatos] = useState<RegistroBorrador>(estadoInicial);
  const [enviando, setEnviando] = useState(false);
  const [intentoEnvio, setIntentoEnvio] = useState(false);
  const [enviado, setEnviado] = useState<"enviado" | "no_configurado" | null>(null);
  const [emailNoEnviado, setEmailNoEnviado] = useState(false);
  const [emailRequested, setEmailRequested] = useState(false);
  const [hidratado, setHidratado] = useState(false);
  const [correosRecientes, setCorreosRecientes] = useState<string[]>([]);
  const [adjuntos, setAdjuntos] = useState<File[]>([]);
  const enviar = useServerFn(enviarRegistro);

  useEffect(() => {
    try {
      const crudo = localStorage.getItem(STORAGE_KEY);
      if (crudo) {
        const guardado = JSON.parse(crudo) as {
          datos?: Partial<RegistroBorrador>;
          emailRequested?: unknown;
        };
        if (guardado.datos) {
          setDatos({
            ...estadoInicial,
            ...guardado.datos,
            guardia: { ...estadoInicial.guardia, ...guardado.datos.guardia },
          });
        }
        if (typeof guardado.emailRequested === "boolean") {
          setEmailRequested(guardado.emailRequested);
        }
      }
      const historial = localStorage.getItem(EMAIL_HISTORY_KEY);
      if (historial) {
        const correos = JSON.parse(historial);
        if (Array.isArray(correos)) {
          setCorreosRecientes(
            correos.filter((correo): correo is string => typeof correo === "string"),
          );
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setHidratado(true);
  }, []);

  useEffect(() => {
    if (!hidratado || enviado) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ datos, emailRequested }));
  }, [datos, emailRequested, hidratado, enviado]);

  useEffect(() => {
    const correo = datos.guardia.email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(correo)) return;

    setCorreosRecientes((anteriores) => {
      const actualizados = [correo, ...anteriores.filter((item) => item !== correo)].slice(0, 8);
      localStorage.setItem(EMAIL_HISTORY_KEY, JSON.stringify(actualizados));
      return actualizados;
    });
  }, [datos.guardia.email]);

  const setGuardia = (campo: keyof RegistroPayload["guardia"], valor: string) =>
    setDatos((actual) => ({ ...actual, guardia: { ...actual.guardia, [campo]: valor } }));

  const actualizarInventario = (
    campo: "farmacologicos" | "descartables" | "viaAerea" | "equipamientosVarios",
    nombre: string,
    casillas: CasillaId[],
  ) => {
    setDatos((actual) => ({
      ...actual,
      [campo]: { ...actual[campo], [nombre]: casillas },
    }));
  };

  const revisiones = useMemo<RevisionSeccion[]>(() => {
    const guardia = datos.guardia;
    const faltantesGuardia: string[] = [];
    if (!EMAIL_PATTERN.test(guardia.email.trim()))
      faltantesGuardia.push("Correo electrónico válido");
    if (!guardia.fecha) faltantesGuardia.push("Fecha del pase de guardia");
    if (!guardia.turno) faltantesGuardia.push("Turno");
    if (!guardia.movilNumero.trim()) faltantesGuardia.push("Móvil número");
    if (!guardia.patenteMovil.trim()) faltantesGuardia.push("Patente móvil");
    if (!guardia.enfermeroEntrante.trim()) faltantesGuardia.push("Enfermero/a entrante");
    if (!guardia.choferGuardia.trim()) faltantesGuardia.push("Chofer de guardia");
    if (!guardia.medicoGuardia.trim()) faltantesGuardia.push("Médico de guardia");

    const totalGuardia = 8;
    const completosGuardia = totalGuardia - faltantesGuardia.length;
    const revisionGuardia: RevisionSeccion = {
      estado:
        faltantesGuardia.length === 0
          ? "completa"
          : completosGuardia === 0
            ? "vacia"
            : "incompleta",
      resumen: `${completosGuardia} de ${totalGuardia} datos completos`,
      faltantes: faltantesGuardia,
    };

    const intervencionesFaltantes: string[] = [];
    if (!datos.intervencionesCantidad.trim())
      intervencionesFaltantes.push("Cantidad de intervenciones");
    if (!datos.observacionesGenerales.trim())
      intervencionesFaltantes.push("Observaciones y novedades");
    const finalFaltantes: string[] = [];
    if (!datos.enfermeroRecibe.trim()) finalFaltantes.push("Enfermero/a que recibe la guardia");

    return [
      revisionGuardia,
      revisarInventario(
        FARMACOLOGICOS,
        datos.farmacologicos,
        datos.anotacionesFarmacologicos,
        ESTADOS_FARMACOLOGICOS_CON_ANOTACION,
      ),
      revisarInventario(
        DESCARTABLES,
        datos.descartables,
        datos.anotacionesDescartables,
        ESTADOS_DESCARTABLES_CON_ANOTACION,
      ),
      combinarRevisiones(
        revisarInventario(
          VIA_AEREA,
          datos.viaAerea,
          datos.anotacionesViaAerea,
          ESTADOS_EQUIPAMIENTO_CON_ANOTACION,
        ),
        revisarInventario(
          EQUIPAMIENTOS_VARIOS,
          datos.equipamientosVarios,
          datos.anotacionesEquipamientosVarios,
          ESTADOS_EQUIPAMIENTO_CON_ANOTACION,
        ),
      ),
      {
        estado:
          intervencionesFaltantes.length === 0
            ? "completa"
            : intervencionesFaltantes.length === 2
              ? "vacia"
              : "incompleta",
        resumen: `${2 - intervencionesFaltantes.length} de 2 datos completos`,
        faltantes: intervencionesFaltantes,
      },
      {
        estado: finalFaltantes.length === 0 ? "completa" : "incompleta",
        resumen: datos.confirmaciones.length
          ? `${datos.confirmaciones.length} confirmaciones seleccionadas`
          : "Confirmación pendiente",
        faltantes: finalFaltantes,
      },
    ];
  }, [datos]);

  const seccionesIncompletas = revisiones
    .map((revision, indice) => ({ ...revision, indice }))
    .filter((revision) => revision.faltantes.length > 0);
  const completas = revisiones.filter((revision) => revision.estado === "completa").length;
  const progreso = Math.round((completas / SECCIONES.length) * 100);

  const desplazarAlPrimerItem = (indice: number) => {
    requestAnimationFrame(() => {
      const panel = document.getElementById(`seccion-${indice}-panel`);
      const encabezado = document.querySelector("header");
      if (!panel) return;

      const primerPendiente = panel.querySelector<HTMLElement>(
        '[data-section-item-incomplete="true"]',
      );
      const primerItem = primerPendiente ?? panel.querySelector<HTMLElement>("[data-section-item]");
      const objetivo = primerItem ?? panel;
      const margenSuperior = (encabezado?.getBoundingClientRect().height ?? 0) + 16;
      window.scrollTo({
        top: window.scrollY + objetivo.getBoundingClientRect().top - margenSuperior,
        behavior: "smooth",
      });
    });
  };

  const alternarSeccion = (indice: number) => {
    const seAbrira = !abiertas.includes(indice);
    setAbiertas(seAbrira ? [indice] : []);
    if (seAbrira) desplazarAlPrimerItem(indice);
  };

  const cerrarYSeguir = (indice: number) => {
    const siguiente = indice + 1;
    setAbiertas(siguiente < SECCIONES.length ? [siguiente] : []);
    if (siguiente < SECCIONES.length) desplazarAlPrimerItem(siguiente);
  };

  const confirmarEnvio = async () => {
    setIntentoEnvio(true);
    if (seccionesIncompletas.length > 0) {
      const primera = seccionesIncompletas[0]!;
      setAbiertas([primera.indice]);
      toast.error("Hay secciones sin completar", {
        description: `Revisá: ${seccionesIncompletas.map((item) => SECCIONES[item.indice]?.titulo).join(", ")}.`,
      });
      return;
    }
    const registroEnvio = crearRegistroEnvio(datos);
    const observacionesExtensas = [
      { indice: 1, nombre: "farmacológicos", texto: registroEnvio.observacionesFarmacologicos },
      { indice: 2, nombre: "descartables", texto: registroEnvio.observacionesDescartables },
      { indice: 3, nombre: "equipamientos", texto: registroEnvio.observacionesEquipamiento },
    ].find((observacion) => observacion.texto.length > 2000);
    if (observacionesExtensas) {
      setAbiertas([observacionesExtensas.indice]);
      toast.error(`Las observaciones de ${observacionesExtensas.nombre} son demasiado extensas`, {
        description:
          "Reducí las anotaciones o las observaciones hasta un máximo total de 2000 caracteres.",
      });
      return;
    }
    setEnviando(true);
    try {
      const resultado = await enviar({
        data: crearDatosEnvio(registroEnvio, adjuntos, emailRequested),
      });
      if (resultado.estado === "enviado") {
        setEnviado("enviado");
        setEmailNoEnviado(resultado.emailSolicitado && !resultado.emailEnviado);
        setAdjuntos([]);
        localStorage.removeItem(STORAGE_KEY);
      } else if (resultado.estado === "no_configurado") {
        setEnviado("no_configurado");
      } else {
        toast.error("No se pudo enviar el registro", {
          description: resultado.detalle || "Revisá tu conexión e intentá de nuevo.",
        });
      }
    } catch {
      toast.error("No se pudo enviar el registro", {
        description: "Revisá tu conexión e intentá de nuevo.",
      });
    } finally {
      setEnviando(false);
    }
  };

  const nuevoRegistro = () => {
    setDatos(estadoInicial);
    setAbiertas([0]);
    setIntentoEnvio(false);
    setEnviado(null);
    setEmailNoEnviado(false);
    setEmailRequested(false);
    localStorage.removeItem(STORAGE_KEY);
    window.scrollTo({ top: 0 });
  };

  const propsSeccion = (indice: number) => {
    const revision = revisiones[indice] ?? {
      estado: "vacia" as EstadoSeccion,
      resumen: "",
      faltantes: [],
    };
    return {
      id: `seccion-${indice}`,
      numero: indice + 1,
      titulo: SECCIONES[indice]?.titulo ?? "",
      estado: revision.estado,
      resumen: revision.resumen,
      faltantes: revision.faltantes,
      abierta: abiertas.includes(indice),
      onAlternar: () => alternarSeccion(indice),
      onCerrar: () => cerrarYSeguir(indice),
    };
  };

  if (enviado) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md border-l-4 border-l-[var(--success)] bg-card p-8 text-center shadow-[0_12px_40px_oklch(0.27_0.035_202/0.12)]">
          <CheckCircle2 className="mx-auto size-14 text-[var(--success)]" />
          <h1 className="mt-4 font-display text-2xl font-semibold text-foreground">
            {enviado === "enviado" ? "Registro enviado correctamente" : "Registro validado"}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {enviado === "enviado"
              ? "Tu registro ya quedó asentado."
              : "El registro es válido, pero el envío al formulario aún no está configurado."}
          </p>
          {enviado === "enviado" && emailNoEnviado && (
            <p className="mt-4 border-l-4 border-warning bg-warning-soft px-3 py-2 text-left text-sm text-warning-foreground">
              Hubo un error y no recibirás copia por correo.
            </p>
          )}
          <button
            type="button"
            onClick={nuevoRegistro}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Iniciar un nuevo pase de guardia
          </button>
        </div>
        <Toaster />
      </main>
    );
  }

  return (
    <WorkflowShell
      contentWidth="narrow"
      header={
        <WorkflowHeader
          contentWidth="narrow"
          eyebrow="Registro operativo"
          title="Enfermería - SeLIAR"
          description="Control de Ingreso y Egreso de Guardia"
        />
      }
    >
      <Toaster />
      <div>
        <WorkflowIntro
          eyebrow="Pase de guardia"
          description="Registrá cada control durante el turno. El avance se guarda automáticamente en este dispositivo hasta completar y enviar el pase."
        />

        <div className="mt-6 space-y-3">
          <SeccionDesplegable {...propsSeccion(0)}>
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <CampoTexto
                  id="email"
                  etiqueta="Correo electrónico *"
                  tipo="email"
                  autoComplete="email"
                  list="correos-recientes"
                  valor={datos.guardia.email}
                  onChange={(valor) => setGuardia("email", valor)}
                />
                <datalist id="correos-recientes">
                  {correosRecientes.map((correo) => (
                    <option key={correo} value={correo} />
                  ))}
                </datalist>
              </div>
              <CampoTexto
                id="fecha"
                etiqueta="Fecha del Pase de Guardia *"
                tipo="date"
                valor={datos.guardia.fecha}
                onChange={(valor) => setGuardia("fecha", valor)}
              />
              <CampoSelect
                id="turno"
                etiqueta="Turno de *"
                valor={datos.guardia.turno}
                opciones={TURNOS}
                onChange={(valor) => setGuardia("turno", valor)}
              />
              <CampoTexto
                id="movil"
                etiqueta="Móvil número *"
                valor={datos.guardia.movilNumero}
                onChange={(valor) => setGuardia("movilNumero", valor)}
              />
              <CampoTexto
                id="patente"
                etiqueta="Patente móvil *"
                valor={datos.guardia.patenteMovil}
                onChange={(valor) => setGuardia("patenteMovil", valor)}
              />
              <CampoTexto
                id="enfermero"
                etiqueta="Enfermero/a entrante *"
                valor={datos.guardia.enfermeroEntrante}
                onChange={(valor) => setGuardia("enfermeroEntrante", valor)}
              />
              <CampoTexto
                id="chofer"
                etiqueta="Chofer de guardia *"
                valor={datos.guardia.choferGuardia}
                onChange={(valor) => setGuardia("choferGuardia", valor)}
              />
              <div className="sm:col-span-2">
                <CampoTexto
                  id="medico"
                  etiqueta="Médico de guardia *"
                  valor={datos.guardia.medicoGuardia}
                  onChange={(valor) => setGuardia("medicoGuardia", valor)}
                />
              </div>
            </div>
          </SeccionDesplegable>

          <SeccionDesplegable {...propsSeccion(1)}>
            <InventarioGrid
              titulo="Farmacológicos"
              items={FARMACOLOGICOS}
              opciones={CASILLAS_FARMACOLOGICOS}
              valores={datos.farmacologicos}
              onCambio={(nombre, casillas) =>
                actualizarInventario("farmacologicos", nombre, casillas)
              }
              observaciones={datos.observacionesFarmacologicos}
              onObservaciones={(valor) =>
                setDatos((actual) => ({ ...actual, observacionesFarmacologicos: valor }))
              }
              etiquetaObservaciones="Otras observaciones de farmacológicos"
              anotaciones={datos.anotacionesFarmacologicos}
              onAnotacion={(nombre, texto) =>
                setDatos((actual) => ({
                  ...actual,
                  anotacionesFarmacologicos: {
                    ...actual.anotacionesFarmacologicos,
                    [nombre]: texto,
                  },
                }))
              }
              requierenAnotacion={ESTADOS_FARMACOLOGICOS_CON_ANOTACION}
            />
          </SeccionDesplegable>

          <SeccionDesplegable {...propsSeccion(2)}>
            <InventarioGrid
              titulo="Descartables — Curaciones"
              items={DESCARTABLES}
              opciones={CASILLAS_DESCARTABLES}
              valores={datos.descartables}
              onCambio={(nombre, casillas) =>
                actualizarInventario("descartables", nombre, casillas)
              }
              observaciones={datos.observacionesDescartables}
              onObservaciones={(valor) =>
                setDatos((actual) => ({ ...actual, observacionesDescartables: valor }))
              }
              etiquetaObservaciones="Otras observaciones de descartables"
              anotaciones={datos.anotacionesDescartables}
              onAnotacion={(nombre, texto) =>
                setDatos((actual) => ({
                  ...actual,
                  anotacionesDescartables: {
                    ...actual.anotacionesDescartables,
                    [nombre]: texto,
                  },
                }))
              }
              requierenAnotacion={ESTADOS_DESCARTABLES_CON_ANOTACION}
            />
          </SeccionDesplegable>

          <SeccionDesplegable {...propsSeccion(3)}>
            <div className="space-y-8">
              <InventarioGrid
                titulo="Vía aérea"
                items={VIA_AEREA}
                opciones={CASILLAS_EQUIPAMIENTO}
                valores={datos.viaAerea}
                onCambio={(nombre, casillas) => actualizarInventario("viaAerea", nombre, casillas)}
                observaciones=""
                onObservaciones={() => undefined}
                mostrarObservaciones={false}
                anotaciones={datos.anotacionesViaAerea}
                onAnotacion={(nombre, texto) =>
                  setDatos((actual) => ({
                    ...actual,
                    anotacionesViaAerea: {
                      ...actual.anotacionesViaAerea,
                      [nombre]: texto,
                    },
                  }))
                }
                requierenAnotacion={ESTADOS_EQUIPAMIENTO_CON_ANOTACION}
              />
              <InventarioGrid
                titulo="Equipamientos varios"
                items={EQUIPAMIENTOS_VARIOS}
                opciones={CASILLAS_EQUIPAMIENTO}
                valores={datos.equipamientosVarios}
                onCambio={(nombre, casillas) =>
                  actualizarInventario("equipamientosVarios", nombre, casillas)
                }
                observaciones={datos.observacionesEquipamiento}
                onObservaciones={(valor) =>
                  setDatos((actual) => ({ ...actual, observacionesEquipamiento: valor }))
                }
                etiquetaObservaciones="Otras observaciones de equipamientos"
                anotaciones={datos.anotacionesEquipamientosVarios}
                anotacionesResumen={crearResumenAnotacionesEquipamiento(datos)}
                onAnotacion={(nombre, texto) =>
                  setDatos((actual) => ({
                    ...actual,
                    anotacionesEquipamientosVarios: {
                      ...actual.anotacionesEquipamientosVarios,
                      [nombre]: texto,
                    },
                  }))
                }
                requierenAnotacion={ESTADOS_EQUIPAMIENTO_CON_ANOTACION}
              />
            </div>
          </SeccionDesplegable>

          <SeccionDesplegable {...propsSeccion(4)}>
            <div className="space-y-5">
              <CampoTexto
                id="intervenciones"
                etiqueta="Cantidad de intervenciones durante la guardia *"
                valor={datos.intervencionesCantidad}
                onChange={(valor) =>
                  setDatos((actual) => ({ ...actual, intervencionesCantidad: valor }))
                }
                inputMode="numeric"
              />
              <CampoArea
                id="observaciones"
                etiqueta="Observaciones y novedades *"
                valor={datos.observacionesGenerales}
                onChange={(valor) =>
                  setDatos((actual) => ({ ...actual, observacionesGenerales: valor }))
                }
              />
              <AdjuntosImagen adjuntos={adjuntos} onCambio={setAdjuntos} />
            </div>
          </SeccionDesplegable>

          <SeccionDesplegable {...propsSeccion(5)}>
            <div className="space-y-5">
              <CampoTexto
                id="recibe"
                etiqueta="Entrego la guardia al enfermero/a *"
                valor={datos.enfermeroRecibe}
                onChange={(valor) => setDatos((actual) => ({ ...actual, enfermeroRecibe: valor }))}
              />
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-foreground">Fin de guardia</legend>
                {CONFIRMACIONES_FIN_GUARDIA.map((opcion) => (
                  <label
                    key={opcion}
                    className="flex gap-3 border-l-4 border-border bg-muted/50 p-3 text-sm text-foreground transition-colors has-[:checked]:border-l-[var(--success)] has-[:checked]:bg-[color-mix(in_oklch,var(--success)_8%,var(--card))]"
                  >
                    <input
                      type="checkbox"
                      checked={datos.confirmaciones.includes(opcion)}
                      onChange={() =>
                        setDatos((actual) => ({
                          ...actual,
                          confirmaciones: actual.confirmaciones.includes(opcion)
                            ? actual.confirmaciones.filter((item) => item !== opcion)
                            : [...actual.confirmaciones, opcion],
                        }))
                      }
                      className="mt-0.5 size-4"
                    />
                    <span>{opcion}</span>
                  </label>
                ))}
              </fieldset>
              <Resumen datos={datos} />
            </div>
          </SeccionDesplegable>
        </div>

        {intentoEnvio && seccionesIncompletas.length > 0 && (
          <div role="alert" className="mt-6 border-l-4 border-warning bg-warning-soft px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <TriangleAlert className="size-4 shrink-0 text-warning" />
              Hay secciones sin completar
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {seccionesIncompletas.map((seccion) => (
                <li key={seccion.indice}>{SECCIONES[seccion.indice]?.titulo}</li>
              ))}
            </ul>
          </div>
        )}

        <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-md border border-input bg-card px-4 py-3 text-sm text-foreground focus-within:ring-2 focus-within:ring-ring">
          <input
            type="checkbox"
            checked={emailRequested}
            onChange={(event) => setEmailRequested(event.target.checked)}
            disabled={enviando}
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          <span>Quiero recibir una copia del registro por correo electrónico</span>
        </label>
        <button
          type="button"
          onClick={confirmarEnvio}
          disabled={enviando}
          className="mt-3 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-md bg-[var(--brand-orange)] px-4 text-base font-bold text-warning-foreground shadow-[0_4px_0_oklch(0.53_0.15_48)] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
        >
          {enviando ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
          {enviando ? "Enviando…" : "Enviar registro"}
        </button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Tu avance se guarda solo en este dispositivo mientras completás el registro.
        </p>
      </div>
      <BadgeFlotanteProgreso completas={completas} total={SECCIONES.length} porcentaje={progreso} />
    </WorkflowShell>
  );
}

function crearRegistroEnvio(datos: RegistroBorrador): RegistroPayload {
  const {
    anotacionesFarmacologicos,
    anotacionesDescartables,
    anotacionesViaAerea,
    anotacionesEquipamientosVarios,
    ...registro
  } = datos;
  const notasFarmacologicos = formatearAnotaciones(FARMACOLOGICOS, anotacionesFarmacologicos);
  const notasDescartables = formatearAnotaciones(DESCARTABLES, anotacionesDescartables);
  const notasEquipamiento = [
    ...formatearAnotaciones(VIA_AEREA, anotacionesViaAerea, "Vía aérea — "),
    ...formatearAnotaciones(
      EQUIPAMIENTOS_VARIOS,
      anotacionesEquipamientosVarios,
      "Equipamientos varios — ",
    ),
  ];

  return {
    ...registro,
    farmacologicos: traducirRevisarComoRoto(registro.farmacologicos),
    descartables: traducirRevisarComoRoto(registro.descartables),
    observacionesFarmacologicos: combinarObservaciones(
      registro.observacionesFarmacologicos,
      notasFarmacologicos,
    ),
    observacionesDescartables: combinarObservaciones(
      registro.observacionesDescartables,
      notasDescartables,
    ),
    observacionesEquipamiento: combinarObservaciones(
      registro.observacionesEquipamiento,
      notasEquipamiento,
    ),
  };
}

function formatearAnotaciones(
  items: InventarioItem[],
  anotaciones: Record<string, string>,
  prefijo = "",
): string[] {
  return items.flatMap((item) => {
    const texto = anotaciones[item.nombre]?.trim();
    return texto
      ? [`[${prefijo}${item.nombre}: ${JSON.stringify(texto.replace(/\s+/g, " "))}]`]
      : [];
  });
}

function combinarObservaciones(observacionManual: string, anotaciones: string[]): string {
  return [observacionManual.trim(), ...anotaciones].filter(Boolean).join("\n");
}

function traducirRevisarComoRoto(
  valores: Record<string, CasillaId[]>,
): Record<string, CasillaId[]> {
  return Object.fromEntries(
    Object.entries(valores).map(([nombre, casillas]) => [
      nombre,
      [...new Set(casillas.map((casilla) => (casilla === "revisar" ? "roto" : casilla)))],
    ]),
  );
}

function crearResumenAnotacionesEquipamiento(datos: RegistroBorrador) {
  return [
    ...VIA_AEREA.flatMap((item) => {
      const texto = datos.anotacionesViaAerea[item.nombre]?.trim();
      return texto ? [{ nombre: `Vía aérea — ${etiquetaInventario(item)}`, texto }] : [];
    }),
    ...EQUIPAMIENTOS_VARIOS.flatMap((item) => {
      const texto = datos.anotacionesEquipamientosVarios[item.nombre]?.trim();
      return texto ? [{ nombre: `Equipamientos varios — ${etiquetaInventario(item)}`, texto }] : [];
    }),
  ];
}

function crearDatosEnvio(datos: RegistroPayload, adjuntos: File[], emailRequested: boolean) {
  const formData = new FormData();
  formData.set("registro", JSON.stringify(datos));
  formData.set("emailRequested", String(emailRequested));
  adjuntos.forEach((adjunto) => formData.append("adjuntos", adjunto, adjunto.name));
  return formData;
}

function AdjuntosImagen({
  adjuntos,
  onCambio,
}: {
  adjuntos: File[];
  onCambio: (adjuntos: File[]) => void;
}) {
  const agregarAdjuntos = (archivos: FileList | null) => {
    const candidatos = Array.from(archivos ?? []);
    const validos = candidatos.filter(
      (archivo) => TIPOS_IMAGEN.includes(archivo.type) && archivo.size <= MAX_TAMANIO_ADJUNTO,
    );

    if (validos.length !== candidatos.length) {
      toast.error("Solo se admiten imágenes JPG, PNG o WebP de hasta 3 MB.");
    }

    const resultado = [...adjuntos, ...validos].slice(0, MAX_ADJUNTOS);
    if (resultado.length < adjuntos.length + validos.length) {
      toast.error(`Podés adjuntar hasta ${MAX_ADJUNTOS} imágenes.`);
    }
    onCambio(resultado);
  };

  return (
    <section className="space-y-3" aria-labelledby="adjuntos-titulo">
      <div>
        <h3 id="adjuntos-titulo" className="text-sm font-semibold text-foreground">
          Imágenes o reportes
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Opcional. Se guardan en la carpeta segura de Drive asociada al registro.
        </p>
      </div>
      <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-primary/40 bg-muted/40 px-4 text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-muted">
        <ImagePlus className="size-5" aria-hidden />
        Agregar imágenes
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          onChange={(evento) => {
            agregarAdjuntos(evento.target.files);
            evento.currentTarget.value = "";
          }}
        />
      </label>
      {adjuntos.length > 0 && (
        <ul className="space-y-2" aria-label="Imágenes adjuntas">
          {adjuntos.map((adjunto, indice) => (
            <li
              key={`${adjunto.name}-${adjunto.lastModified}-${indice}`}
              className="flex items-center justify-between gap-3 border-l-4 border-primary bg-muted/50 px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate text-foreground">{adjunto.name}</span>
              <button
                type="button"
                onClick={() => onCambio(adjuntos.filter((_, posicion) => posicion !== indice))}
                className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Quitar ${adjunto.name}`}
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CampoTexto({
  id,
  etiqueta,
  valor,
  onChange,
  tipo = "text",
  inputMode,
  autoComplete,
  list,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onChange: (valor: string) => void;
  tipo?: string;
  inputMode?: "numeric";
  autoComplete?: string;
  list?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-xs font-bold uppercase tracking-[0.06em] text-foreground"
      >
        {etiqueta}
      </label>
      <input
        id={id}
        type={tipo}
        inputMode={inputMode}
        autoComplete={autoComplete}
        list={list}
        value={valor}
        onChange={(evento) => onChange(evento.target.value)}
        maxLength={255}
        className="min-h-12 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
      />
    </div>
  );
}

function CampoSelect({
  id,
  etiqueta,
  valor,
  opciones,
  onChange,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  opciones: readonly string[];
  onChange: (valor: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-xs font-bold uppercase tracking-[0.06em] text-foreground"
      >
        {etiqueta}
      </label>
      <select
        id={id}
        value={valor}
        onChange={(evento) => onChange(evento.target.value)}
        className="min-h-12 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm font-medium text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
      >
        <option value="" disabled>
          Seleccionar turno…
        </option>
        {opciones.map((opcion) => (
          <option key={opcion} value={opcion}>
            {opcion}
          </option>
        ))}
      </select>
    </div>
  );
}

function CampoArea({
  id,
  etiqueta,
  valor,
  onChange,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onChange: (valor: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block text-xs font-bold uppercase tracking-[0.06em] text-foreground"
      >
        {etiqueta}
      </label>
      <textarea
        id={id}
        value={valor}
        onChange={(evento) => onChange(evento.target.value)}
        rows={5}
        maxLength={4000}
        className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
      />
    </div>
  );
}

function Resumen({ datos }: { datos: RegistroPayload }) {
  return (
    <div className="border-t-4 border-primary bg-muted/50 p-5">
      <h3 className="font-display text-base font-semibold text-foreground">
        Resumen antes de enviar
      </h3>
      <dl className="mt-3 space-y-1.5 text-sm">
        <FilaResumen etiqueta="Responsable" valor={datos.guardia.enfermeroEntrante} />
        <FilaResumen etiqueta="Turno" valor={datos.guardia.turno} />
        <FilaResumen etiqueta="Fecha" valor={datos.guardia.fecha} />
        <FilaResumen
          etiqueta="Móvil / Patente"
          valor={`${datos.guardia.movilNumero} / ${datos.guardia.patenteMovil}`}
        />
        <FilaResumen etiqueta="Intervenciones" valor={datos.intervencionesCantidad} />
      </dl>
    </div>
  );
}

function FilaResumen({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className="text-right font-medium text-foreground">{valor || "—"}</dd>
    </div>
  );
}
