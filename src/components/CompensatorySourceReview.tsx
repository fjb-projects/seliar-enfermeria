import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  directoryKeys,
  parseCompensatoryJson,
  parseRosterCsv,
  suggestRequestLinks,
  type ReviewRequest,
  type RosterSourceRow,
} from "@/lib/compensatory-source-review";

const maxFileBytes = 2 * 1024 * 1024;
const pageSize = 25;
type Filter = "all" | "review" | "confirmed" | "no-suggestion";
type SourceKind = "roster" | "requests";
type Confirmation = { sourceRow: number; dni: string };

function ownValue<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function formatFileError(name: string) {
  return `No se pudo leer ${name}. El archivo debe tener un formato compatible y no superar 2 MB.`;
}

function AcceptedDirectoryFields({ row }: { row: RosterSourceRow }) {
  const labels: Record<(typeof directoryKeys)[number], string> = {
    registrationNumber: "Matrícula",
    employmentStatus: "Situación de revista",
    jobRole: "Función laboral",
    region: "Región",
    contactPhone: "Teléfono de contacto",
    workplace: "Lugar de desempeño",
    operationalStatus: "Condición operativa",
    operationalRole: "Función operativa",
  };
  const values = directoryKeys
    .map((key) => [labels[key], row[key]] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
  if (!values.length)
    return <p className="text-sm text-muted-foreground">Sin datos laborales disponibles.</p>;
  return (
    <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
      {values.map(([label, value]) => (
        <div className="min-w-0" key={label}>
          <dt className="inline font-medium">{label}: </dt>
          <dd className="inline break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CompensatorySourceReview({ onBack }: { onBack?: () => void }) {
  const [rosterRows, setRosterRows] = useState<RosterSourceRow[]>([]);
  const [requests, setRequests] = useState<ReviewRequest[]>([]);
  const [rosterWarnings, setRosterWarnings] = useState<string[]>([]);
  const [requestWarnings, setRequestWarnings] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState<Record<string, Confirmation>>({});
  const [selectedRows, setSelectedRows] = useState<Record<string, number | "">>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);
  const [rosterPage, setRosterPage] = useState(0);
  const [error, setError] = useState("");
  const [reading, setReading] = useState({ roster: false, requests: false });
  const loading = reading.roster || reading.requests;
  const fileReadSequence = useRef({ roster: 0, requests: 0 });

  const suggestions = useMemo(
    () => suggestRequestLinks(rosterRows, requests),
    [rosterRows, requests],
  );
  const suggestionById = useMemo(
    () => new Map(suggestions.map((suggestion) => [suggestion.responseId, suggestion])),
    [suggestions],
  );
  const visibleRequests = requests.filter((request) => {
    const suggestion = suggestionById.get(request.responseId);
    if (filter === "confirmed") return Boolean(ownValue(confirmed, request.responseId));
    if (filter === "review") return !ownValue(confirmed, request.responseId);
    if (filter === "no-suggestion") return suggestion?.matchKind === "none";
    return true;
  });
  const pageCount = Math.max(1, Math.ceil(visibleRequests.length / pageSize));
  const pageRequests = visibleRequests.slice(page * pageSize, (page + 1) * pageSize);
  const rosterPageCount = Math.max(1, Math.ceil(rosterRows.length / pageSize));
  const pageRosterRows = rosterRows.slice(rosterPage * pageSize, (rosterPage + 1) * pageSize);
  const linkableRoster = rosterRows.filter((row) => row.canLink && row.dni);
  const rowBySource = useMemo(
    () => new Map(rosterRows.map((row) => [row.sourceRow, row])),
    [rosterRows],
  );

  async function readFile(event: ChangeEvent<HTMLInputElement>, kind: SourceKind) {
    const file = event.currentTarget.files?.[0];
    const input = event.currentTarget;
    const sequence = ++fileReadSequence.current[kind];
    setConfirmed({});
    setSelectedRows({});
    setPage(0);
    setRosterPage(0);
    setError("");
    setReading((current) => ({ ...current, [kind]: false }));
    if (kind === "roster") {
      setRosterRows([]);
      setRosterWarnings([]);
    } else {
      setRequests([]);
      setRequestWarnings([]);
    }
    if (!file) return;
    if (file.size > maxFileBytes) {
      setError("El archivo supera el límite local de 2 MB; no se cargó.");
      input.value = "";
      return;
    }
    setReading((current) => ({ ...current, [kind]: true }));
    try {
      const text = await file.text();
      if (sequence !== fileReadSequence.current[kind]) return;
      if (kind === "roster") {
        const parsed = parseRosterCsv(text);
        setRosterRows(parsed.rows);
        setRosterWarnings(parsed.warnings);
      } else {
        const parsed = parseCompensatoryJson(text);
        setRequests(parsed.requests);
        setRequestWarnings(parsed.warnings);
      }
    } catch {
      if (sequence === fileReadSequence.current[kind])
        setError(formatFileError(kind === "roster" ? "el CSV" : "el JSON"));
    } finally {
      if (sequence === fileReadSequence.current[kind])
        setReading((current) => ({ ...current, [kind]: false }));
    }
  }

  function confirmRequest(request: ReviewRequest) {
    const sourceRow = ownValue(selectedRows, request.responseId);
    const row = typeof sourceRow === "number" ? rowBySource.get(sourceRow) : undefined;
    if (!request.canLink || !row?.canLink || !row.dni) return;
    setConfirmed((previous) => ({
      ...previous,
      [request.responseId]: { sourceRow: row.sourceRow, dni: row.dni! },
    }));
  }

  function undoRequest(responseId: string) {
    setConfirmed((previous) => {
      const next = { ...previous };
      delete next[responseId];
      return next;
    });
  }

  return (
    <section className="space-y-5" aria-labelledby="source-review-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="source-review-title" className="text-xl font-semibold">
            Revisar vinculaciones
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Revisión local y en memoria. No se importan datos de agentes, solicitudes ni
            vinculaciones a la base de datos.
          </p>
        </div>
        {onBack && (
          <Button type="button" variant="outline" className="min-h-11" onClick={onBack}>
            Volver al banco
          </Button>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Archivos de origen</CardTitle>
          <CardDescription>
            La selección y las confirmaciones se pierden al salir, recargar o reemplazar un archivo.
            Esta revisión no aprueba solicitudes ni calcula saldos.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="source-roster">
              Directorio de agentes (CSV)
            </label>
            <input
              id="source-roster"
              type="file"
              accept=".csv,text/csv"
              className="min-h-11 w-full rounded-md border p-2 text-sm"
              onChange={(event) => void readFile(event, "roster")}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="source-requests">
              Exportación de compensatorios (JSON)
            </label>
            <input
              id="source-requests"
              type="file"
              accept=".json,application/json"
              className="min-h-11 w-full rounded-md border p-2 text-sm"
              onChange={(event) => void readFile(event, "requests")}
            />
          </div>
          {loading && (
            <p role="status" className="sm:col-span-2 text-sm">
              Leyendo archivo local…
            </p>
          )}
          {error && (
            <p role="alert" className="sm:col-span-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {(rosterWarnings.length > 0 || requestWarnings.length > 0) && (
            <ul
              className="sm:col-span-2 space-y-1 text-sm text-muted-foreground"
              aria-label="Avisos de lectura"
            >
              {[...rosterWarnings, ...requestWarnings].map((warning, index) => (
                <li key={`${index}-${warning}`}>{warning}</li>
              ))}
            </ul>
          )}
          <p className="sm:col-span-2 text-xs text-muted-foreground">
            Los archivos se procesan en este navegador y no se suben ni se guardan en el
            almacenamiento del navegador.
          </p>
        </CardContent>
      </Card>
      {rosterRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Vista previa del directorio</CardTitle>
            <CardDescription>
              {rosterRows.length} filas conservadas;{" "}
              {rosterRows.filter((row) => !row.canLink).length} no disponibles como destino.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p role="status" className="text-sm text-muted-foreground">
              Página {Math.min(rosterPage + 1, rosterPageCount)} de {rosterPageCount}
            </p>
            {pageRosterRows.map((row) => (
              <article key={row.sourceRow} className="rounded-md border p-3">
                <p className="font-medium">
                  {row.name || "Fila sin nombre"} · DNI {row.dni || "no informado"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Fila de origen {row.sourceRow}
                  {row.issues.length ? ` · ${row.issues.join("; ")}` : ""}
                </p>
                <AcceptedDirectoryFields row={row} />
                {Object.values(confirmed).some(
                  (mapping) => mapping.sourceRow === row.sourceRow,
                ) && (
                  <div className="mt-3 border-t pt-3">
                    <h4 className="text-sm font-medium">
                      Solicitudes confirmadas para este agente
                    </h4>
                    <ul className="mt-1 space-y-1 text-sm">
                      {Object.entries(confirmed)
                        .filter(([, mapping]) => mapping.sourceRow === row.sourceRow)
                        .map(([responseId]) => {
                          const request = requests.find((item) => item.responseId === responseId);
                          return request ? (
                            <li key={responseId}>
                              {request.submittedAt || "sin fecha"} ·{" "}
                              {request.requestedDate || "sin fecha solicitada"} ·{" "}
                              {request.requestedHours || "horas no indicadas"} · referencia{" "}
                              {responseId}
                            </li>
                          ) : null;
                        })}
                    </ul>
                  </div>
                )}
              </article>
            ))}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={rosterPage === 0}
                onClick={() => setRosterPage((current) => Math.max(0, current - 1))}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={rosterPage + 1 >= rosterPageCount}
                onClick={() =>
                  setRosterPage((current) => Math.min(rosterPageCount - 1, current + 1))
                }
              >
                Siguiente
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {requests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Solicitudes en revisión</CardTitle>
            <CardDescription>
              {Object.keys(confirmed).length} vinculaciones confirmadas solo para esta revisión · el
              campo móvil no se usa para identificar agentes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <label htmlFor="source-filter" className="space-y-1.5 text-sm font-medium">
                Filtrar solicitudes
                <select
                  id="source-filter"
                  className="block min-h-11 rounded-md border border-input bg-background px-3 font-normal"
                  value={filter}
                  onChange={(event) => {
                    setFilter(event.target.value as Filter);
                    setPage(0);
                  }}
                >
                  <option value="all">Todas</option>
                  <option value="review">Por revisar</option>
                  <option value="confirmed">Confirmadas</option>
                  <option value="no-suggestion">Sin sugerencia</option>
                </select>
              </label>
              <p className="text-sm text-muted-foreground" role="status">
                {visibleRequests.length} solicitudes · página {Math.min(page + 1, pageCount)} de{" "}
                {pageCount}
              </p>
            </div>
            {pageRequests.map((request) => {
              const suggestion = suggestionById.get(request.responseId);
              const candidateRows = (suggestion?.candidateSourceRows ?? [])
                .map((sourceRow) => rowBySource.get(sourceRow))
                .filter((row): row is RosterSourceRow => Boolean(row?.canLink && row.dni));
              const link = ownValue(confirmed, request.responseId);
              const confirmedRow = link ? rowBySource.get(link.sourceRow) : undefined;
              const selected = ownValue(selectedRows, request.responseId);
              const selectedRow =
                typeof selected === "number" ? rowBySource.get(selected) : undefined;
              return (
                <article key={request.responseId} className="space-y-3 rounded-md border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-medium">{request.name || "Solicitud sin nombre"}</h3>
                      <p className="text-xs text-muted-foreground">
                        Referencia de origen: {request.responseId} · Enviada:{" "}
                        {request.submittedAt || "sin fecha"}
                      </p>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-1 text-xs">
                      {link ? "Confirmada localmente" : "Por revisar"}
                    </span>
                  </div>
                  <p className="text-sm">
                    Correo: {request.email || "sin correo"} · Móvil: {request.mobile || "sin móvil"}{" "}
                    · Fecha solicitada: {request.requestedDate || "sin fecha"} · Horas:{" "}
                    {request.requestedHours || "sin indicar"}
                  </p>
                  {request.issues.length > 0 && (
                    <ul className="text-sm text-destructive">
                      {request.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  )}
                  {suggestion?.matchKind !== "none" && candidateRows.length > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {suggestion?.matchKind === "ordered_name"
                        ? "Nombre coincidente (sin verificar)"
                        : "Mismas palabras en otro orden (sin verificar)"}
                      : {candidateRows.map((row) => row?.name).join(" · ")}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sin sugerencia de coincidencia.</p>
                  )}
                  {link ? (
                    <div className="space-y-2 rounded-md bg-muted/40 p-3">
                      <p className="text-sm font-medium">
                        Agente elegido: {confirmedRow?.name ?? "Fila de directorio no disponible"} ·
                        DNI {link.dni} · fila {link.sourceRow}
                      </p>
                      {confirmedRow && <AcceptedDirectoryFields row={confirmedRow} />}
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        onClick={() => undoRequest(request.responseId)}
                      >
                        Deshacer vínculo local
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-end gap-2">
                      <label
                        htmlFor={`target-${request.responseId}`}
                        className="min-w-56 flex-1 space-y-1.5 text-sm font-medium"
                      >
                        Elegir agente
                        <select
                          id={`target-${request.responseId}`}
                          className="block min-h-11 w-full rounded-md border border-input bg-background px-3 font-normal"
                          value={selected ?? ""}
                          disabled={!request.canLink || linkableRoster.length === 0}
                          onChange={(event) =>
                            setSelectedRows((previous) => ({
                              ...previous,
                              [request.responseId]: event.target.value
                                ? Number(event.target.value)
                                : "",
                            }))
                          }
                        >
                          <option value="">Selecciona un agente</option>
                          {linkableRoster.map((row) => (
                            <option key={row.sourceRow} value={row.sourceRow}>
                              {row.name} · DNI {row.dni}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button
                        type="button"
                        className="min-h-11"
                        disabled={!request.canLink || !selectedRow?.canLink || !selectedRow.dni}
                        onClick={() => confirmRequest(request)}
                      >
                        Confirmar para esta revisión
                      </Button>
                      {!request.canLink && (
                        <p className="basis-full text-sm text-muted-foreground">
                          Esta solicitud no se puede confirmar porque su origen necesita revisión.
                        </p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
            {visibleRequests.length === 0 && (
              <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                No hay solicitudes para este filtro.
              </p>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={page === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              >
                Siguiente
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
