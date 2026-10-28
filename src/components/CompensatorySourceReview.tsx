import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffDirectoryFields } from "@/components/StaffDirectoryFields";
import {
  directoryKeys,
  parseCompensatoryJson,
  parseRosterCsv,
  suggestRequestLinks,
  type ReviewRequest,
  type RosterSourceRow,
} from "@/lib/compensatory-source-review";
import type {
  CompensatoryRequestInsertResult,
  CompensatoryRequestRecord,
} from "@/lib/compensatory-requests.server";

const maxFileBytes = 2 * 1024 * 1024;
const pageSize = 25;
type Filter = "all" | "review" | "confirmed" | "no-suggestion" | "stored";
type SourceKind = "roster" | "requests";
type Confirmation = { sourceRow: number; dni: string };
type ReviewStaffTarget = { id: string; dni: string; name: string; email: string | null } & Partial<
  Pick<RosterSourceRow, (typeof directoryKeys)[number]>
>;
export type ImportedStaff = Omit<
  RosterSourceRow,
  "sourceRow" | "dni" | "name" | "canLink" | "issues"
> & {
  dni: string;
  name: string;
};

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

export function CompensatorySourceReview({
  onBack,
  existingDnis = [],
  onImportStaff,
  staffTargets = [],
  onSaveRequest,
  onCopyRequesterEmail,
}: {
  onBack?: () => void;
  existingDnis?: string[];
  onImportStaff?: (profile: ImportedStaff) => Promise<void>;
  staffTargets?: ReviewStaffTarget[];
  onSaveRequest?: (
    staffId: string,
    request: Pick<
      ReviewRequest,
      "submittedAt" | "name" | "mobile" | "requestedDate" | "requestedHours"
    >,
    confirmDuplicate: boolean,
    responseId: string,
  ) => Promise<CompensatoryRequestInsertResult>;
  onCopyRequesterEmail?: (staffId: string, email: string, responseId: string) => Promise<void>;
}) {
  const [rosterRows, setRosterRows] = useState<RosterSourceRow[]>([]);
  const [requests, setRequests] = useState<ReviewRequest[]>([]);
  const [rosterWarnings, setRosterWarnings] = useState<string[]>([]);
  const [requestWarnings, setRequestWarnings] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState<Record<string, Confirmation>>({});
  const [selectedRows, setSelectedRows] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);
  const [rosterPage, setRosterPage] = useState(0);
  const [error, setError] = useState("");
  const [reading, setReading] = useState({ roster: false, requests: false });
  const [importing, setImporting] = useState<Record<number, boolean>>({});
  const [importedRows, setImportedRows] = useState<Record<number, boolean>>({});
  const [importErrors, setImportErrors] = useState<Record<number, string>>({});
  const [requestSaves, setRequestSaves] = useState<
    Record<
      string,
      {
        status: "saving" | "stored" | "duplicate" | "error";
        matches?: CompensatoryRequestRecord[];
        message?: string;
      }
    >
  >({});
  const [emailCopies, setEmailCopies] = useState<Record<string, "saving" | "copied" | "error">>({});
  const reviewRevision = useRef(0);
  const writesPending =
    Object.values(requestSaves).some((state) => state.status === "saving") ||
    Object.values(emailCopies).some((state) => state === "saving");
  const loading = reading.roster || reading.requests;
  const fileReadSequence = useRef({ roster: 0, requests: 0 });

  const mappingRows: RosterSourceRow[] = useMemo(
    () =>
      onSaveRequest
        ? staffTargets.map((person, index) => ({
            sourceRow: index + 1,
            dni: person.dni,
            name: person.name,
            canLink: true,
            issues: [],
            registrationNumber: person.registrationNumber ?? null,
            employmentStatus: person.employmentStatus ?? null,
            jobRole: person.jobRole ?? null,
            region: person.region ?? null,
            contactPhone: person.contactPhone ?? null,
            workplace: person.workplace ?? null,
            operationalStatus: person.operationalStatus ?? null,
            operationalRole: person.operationalRole ?? null,
          }))
        : rosterRows,
    [onSaveRequest, staffTargets, rosterRows],
  );
  const suggestions = useMemo(
    () => suggestRequestLinks(mappingRows, requests),
    [mappingRows, requests],
  );
  const suggestionById = useMemo(
    () => new Map(suggestions.map((suggestion) => [suggestion.responseId, suggestion])),
    [suggestions],
  );
  const visibleRequests = requests.filter((request) => {
    const stored = ownValue(requestSaves, request.responseId)?.status === "stored";
    if (filter === "stored") return stored;
    if (stored) return false;
    const suggestion = suggestionById.get(request.responseId);
    if (filter === "confirmed") return Boolean(ownValue(confirmed, request.responseId));
    if (filter === "review") return !ownValue(confirmed, request.responseId);
    if (filter === "no-suggestion") return suggestion?.matchKind === "none";
    return true;
  });
  const pageCount = Math.max(1, Math.ceil(visibleRequests.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRequests = visibleRequests.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const rosterPageCount = Math.max(1, Math.ceil(rosterRows.length / pageSize));
  const pageRosterRows = rosterRows.slice(rosterPage * pageSize, (rosterPage + 1) * pageSize);
  const linkableRoster = mappingRows.filter((row) => row.canLink && row.dni);
  const rowBySource = useMemo(
    () => new Map(mappingRows.map((row) => [row.sourceRow, row])),
    [mappingRows],
  );

  async function readFile(event: ChangeEvent<HTMLInputElement>, kind: SourceKind) {
    reviewRevision.current += 1;
    setRequestSaves({});
    setEmailCopies({});
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
    const dni = ownValue(selectedRows, request.responseId);
    const row = linkableRoster.find((candidate) => candidate.dni === dni);
    if (!request.canLink || !row?.canLink || !row.dni) return;
    setConfirmed((previous) => ({
      ...previous,
      [request.responseId]: { sourceRow: row.sourceRow, dni: row.dni! },
    }));
  }

  function undoRequest(responseId: string) {
    reviewRevision.current += 1;
    setRequestSaves((previous) => {
      const next = { ...previous };
      delete next[responseId];
      return next;
    });
    setEmailCopies((previous) => {
      const next = { ...previous };
      delete next[responseId];
      return next;
    });
    setConfirmed((previous) => {
      const next = { ...previous };
      delete next[responseId];
      return next;
    });
  }

  async function importRosterRow(event: FormEvent<HTMLFormElement>, row: RosterSourceRow) {
    event.preventDefault();
    if (
      !onImportStaff ||
      row.issues.includes("La fila tiene una cantidad de columnas distinta al encabezado.")
    )
      return;
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "").trim();
    const profile = {
      dni: text(`import-${row.sourceRow}-dni`),
      name: text(`import-${row.sourceRow}-name`),
      registrationNumber: text(`import-${row.sourceRow}RegistrationNumber`) || null,
      employmentStatus: text(`import-${row.sourceRow}EmploymentStatus`) || null,
      jobRole: text(`import-${row.sourceRow}JobRole`) || null,
      region: text(`import-${row.sourceRow}Region`) || null,
      contactPhone: text(`import-${row.sourceRow}ContactPhone`) || null,
      workplace: text(`import-${row.sourceRow}Workplace`) || null,
      operationalStatus: text(`import-${row.sourceRow}OperationalStatus`) || null,
      operationalRole: text(`import-${row.sourceRow}OperationalRole`) || null,
    };
    if (!profile.dni || !profile.name) {
      setImportErrors((current) => ({
        ...current,
        [row.sourceRow]: "Completa un DNI y un nombre válidos.",
      }));
      return;
    }
    if (existingDnis.includes(profile.dni)) {
      setImportErrors((current) => ({
        ...current,
        [row.sourceRow]: "Ya existe un agente con ese DNI; no se modificó.",
      }));
      return;
    }
    setImporting((current) => ({ ...current, [row.sourceRow]: true }));
    setImportErrors((current) => ({ ...current, [row.sourceRow]: "" }));
    try {
      await onImportStaff(profile);
      setImportedRows((current) => ({ ...current, [row.sourceRow]: true }));
    } catch (cause) {
      setImportErrors((current) => ({
        ...current,
        [row.sourceRow]: cause instanceof Error ? cause.message : "No se pudo guardar el agente.",
      }));
    } finally {
      setImporting((current) => ({ ...current, [row.sourceRow]: false }));
    }
  }

  async function saveReviewedRequest(request: ReviewRequest, confirmDuplicate = false) {
    let link = ownValue(confirmed, request.responseId);
    if (!link) {
      const dni = ownValue(selectedRows, request.responseId);
      const row = linkableRoster.find((candidate) => candidate.dni === dni);
      if (!request.canLink || !row?.dni) return;
      link = { sourceRow: row.sourceRow, dni: row.dni };
      setConfirmed((previous) => ({ ...previous, [request.responseId]: link! }));
    }
    const target =
      link &&
      staffTargets.find(
        (person) => person.dni.replace(/[.\s]/gu, "") === link.dni.replace(/[.\s]/gu, ""),
      );
    if (!link || !target || !onSaveRequest || requestSaves[request.responseId]?.status === "saving")
      return;
    const revision = reviewRevision.current;
    setRequestSaves((current) => ({ ...current, [request.responseId]: { status: "saving" } }));
    try {
      const result = await onSaveRequest(
        target.id,
        {
          submittedAt: request.submittedAt,
          name: request.name,
          mobile: request.mobile,
          requestedDate: request.requestedDate,
          requestedHours: request.requestedHours,
        },
        confirmDuplicate,
        request.responseId,
      );
      if (revision !== reviewRevision.current) return;
      if (result.status === "duplicate_review_required") {
        setRequestSaves((current) => ({
          ...current,
          [request.responseId]: { status: "duplicate", matches: result.matches },
        }));
      } else {
        setRequestSaves((current) => ({ ...current, [request.responseId]: { status: "stored" } }));
      }
    } catch (cause) {
      if (revision !== reviewRevision.current) return;
      setRequestSaves((current) => ({
        ...current,
        [request.responseId]: {
          status: "error",
          message: cause instanceof Error ? cause.message : "No se pudo guardar la solicitud.",
        },
      }));
    }
  }

  async function copyRequesterEmail(request: ReviewRequest) {
    const link = ownValue(confirmed, request.responseId);
    const dni = link?.dni ?? ownValue(selectedRows, request.responseId);
    const target = dni && staffTargets.find((person) => person.dni === dni);
    if (!request.email || !target || request.email === target.email || !onCopyRequesterEmail)
      return;
    const revision = reviewRevision.current;
    setEmailCopies((current) => ({ ...current, [request.responseId]: "saving" }));
    try {
      await onCopyRequesterEmail(target.id, request.email, request.responseId);
      if (revision !== reviewRevision.current) return;
      setEmailCopies((current) => ({ ...current, [request.responseId]: "copied" }));
    } catch {
      if (revision !== reviewRevision.current) return;
      setEmailCopies((current) => ({ ...current, [request.responseId]: "error" }));
    }
  }

  return (
    <section className="space-y-5" aria-labelledby="source-review-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="source-review-title" className="text-xl font-semibold">
            Revisar vinculaciones
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            El JSON se lee temporalmente en este navegador. Guardar una solicitud requiere una
            acción explícita; importar agentes requiere guardar cada fila explícitamente.
          </p>
          {onSaveRequest && (
            <p className="mt-1 text-sm text-muted-foreground">
              Confirmar un vínculo no guarda la solicitud ni copia el correo automáticamente.
            </p>
          )}
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
              disabled={writesPending}
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
              disabled={writesPending}
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
          {onImportStaff && (
            <>
              <p className="sm:col-span-2 text-sm">
                Importar agentes seleccionados: revisa y edita cada perfil antes de guardarlo. La
                letra L en la matrícula indica Licenciatura.
              </p>
              <p className="sm:col-span-2 text-xs text-muted-foreground">
                La importación crea agentes nuevos y no modifica DNIs existentes.
              </p>
            </>
          )}
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
                {row.registrationNumber?.toLocaleUpperCase("es").includes("L") && (
                  <p className="mt-2 text-sm font-medium" aria-label="Calificación profesional">
                    Licenciatura indicada por la matrícula
                  </p>
                )}
                {onImportStaff && (
                  <form
                    className="mt-3 space-y-3 border-t pt-3"
                    onSubmit={(event) => void importRosterRow(event, row)}
                    aria-label={`Importar agente de la fila ${row.sourceRow}`}
                  >
                    <h4 className="text-sm font-medium">Perfil editable antes de importar</h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1 text-sm font-medium">
                        DNI
                        <input
                          name={`import-${row.sourceRow}-dni`}
                          defaultValue={row.dni ?? ""}
                          className="min-h-11 w-full rounded-md border px-3 font-normal"
                          required
                        />
                      </label>
                      <label className="space-y-1 text-sm font-medium">
                        Nombre y apellido
                        <input
                          name={`import-${row.sourceRow}-name`}
                          defaultValue={row.name}
                          className="min-h-11 w-full rounded-md border px-3 font-normal"
                          required
                          maxLength={160}
                        />
                      </label>
                    </div>
                    <StaffDirectoryFields
                      prefix={`import-${row.sourceRow}`}
                      values={Object.fromEntries(directoryKeys.map((key) => [key, row[key]]))}
                    />
                    {existingDnis.includes(row.dni ?? "") && (
                      <p className="text-sm text-muted-foreground">
                        Ya existe un agente con el DNI de origen. No se sobrescribe; corregí el DNI
                        solo si esta fila representa a otro agente.
                      </p>
                    )}
                    {importErrors[row.sourceRow] && (
                      <p role="alert" className="text-sm text-destructive">
                        {importErrors[row.sourceRow]}
                      </p>
                    )}
                    {importedRows[row.sourceRow] ? (
                      <p role="status" className="text-sm">
                        Agente guardado.
                      </p>
                    ) : (
                      <Button
                        type="submit"
                        className="min-h-11"
                        disabled={
                          row.issues.includes(
                            "La fila tiene una cantidad de columnas distinta al encabezado.",
                          ) || importing[row.sourceRow]
                        }
                      >
                        {importing[row.sourceRow] ? "Guardando…" : "Importar agente"}
                      </Button>
                    )}
                    {row.issues.length > 0 && (
                      <p className="text-sm text-muted-foreground">
                        La fila requiere revisión; solo se importará si el perfil editado es válido
                        y tiene un DNI nuevo.
                      </p>
                    )}
                  </form>
                )}
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
            {onSaveRequest && staffTargets.length === 0 && (
              <p role="status" className="text-sm text-muted-foreground">
                No hay agentes guardados disponibles. Importa primero el CSV o crea los agentes en
                el banco.
              </p>
            )}
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
                  <option value="all">Pendientes (todas)</option>
                  <option value="review">Por revisar</option>
                  <option value="confirmed">Confirmadas</option>
                  <option value="no-suggestion">Sin sugerencia</option>
                  <option value="stored">Guardadas en esta revisión</option>
                </select>
              </label>
              <p className="text-sm text-muted-foreground" role="status">
                {visibleRequests.length} solicitudes · página {currentPage + 1} de {pageCount}
              </p>
            </div>
            {pageRequests.map((request) => {
              const suggestion = suggestionById.get(request.responseId);
              const candidateRows = (suggestion?.candidateSourceRows ?? [])
                .map((sourceRow) => rowBySource.get(sourceRow))
                .filter((row): row is RosterSourceRow => Boolean(row?.canLink && row.dni));
              const link = ownValue(confirmed, request.responseId);
              const confirmedRow = link
                ? mappingRows.find((row) => row.dni === link.dni)
                : undefined;
              const selected = ownValue(selectedRows, request.responseId);
              const selectedRow = linkableRoster.find((row) => row.dni === selected);
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
                        DNI {link.dni}
                      </p>
                      {confirmedRow && <AcceptedDirectoryFields row={confirmedRow} />}
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        disabled={writesPending}
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
                          disabled={
                            !request.canLink || linkableRoster.length === 0 || writesPending
                          }
                          onChange={(event) =>
                            setSelectedRows((previous) => ({
                              ...previous,
                              [request.responseId]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Selecciona un agente</option>
                          {linkableRoster.map((row) => (
                            <option key={row.dni} value={row.dni!}>
                              {row.name} · DNI {row.dni}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button
                        type="button"
                        className="min-h-11"
                        disabled={
                          !request.canLink ||
                          !selectedRow?.canLink ||
                          !selectedRow.dni ||
                          writesPending
                        }
                        onClick={() =>
                          onSaveRequest
                            ? void saveReviewedRequest(request)
                            : confirmRequest(request)
                        }
                      >
                        {onSaveRequest ? "Vincular y guardar" : "Confirmar para esta revisión"}
                      </Button>
                      {!request.canLink && (
                        <p className="basis-full text-sm text-muted-foreground">
                          Esta solicitud no se puede confirmar porque su origen necesita revisión.
                        </p>
                      )}
                    </div>
                  )}
                  {onSaveRequest &&
                    (link || selectedRow) &&
                    (() => {
                      const dni = link?.dni ?? selectedRow?.dni;
                      const target = staffTargets.find((person) => person.dni === dni);
                      const saveState = requestSaves[request.responseId];
                      return (
                        <div className="space-y-2 rounded-md border p-3">
                          <p className="text-sm font-medium">
                            Elige el agente e inspecciona los datos antes de guardar. Guardar no
                            aprueba el compensatorio.
                          </p>
                          {!target && (
                            <p className="text-sm text-muted-foreground">
                              Guarda o actualiza el agente desde el CSV antes de guardar su
                              solicitud.
                            </p>
                          )}
                          {saveState?.status === "stored" ? (
                            <p role="status" className="text-sm">
                              Solicitud guardada en el historial del agente.
                            </p>
                          ) : saveState?.status === "duplicate" ? (
                            <div className="space-y-2">
                              <p className="text-sm">
                                Se encontraron {saveState.matches?.length ?? 0} solicitudes
                                parecidas. Revisalas; no se descartó ninguna.
                              </p>
                              <ul className="text-sm text-muted-foreground">
                                {saveState.matches?.map((match) => (
                                  <li key={match.id}>
                                    {match.submittedAt} · {match.compensatoryDate} · {match.hours} h
                                  </li>
                                ))}
                              </ul>
                              <Button
                                type="button"
                                className="min-h-11"
                                disabled={!target}
                                onClick={() => void saveReviewedRequest(request, true)}
                              >
                                Guardar igualmente tras revisar
                              </Button>
                            </div>
                          ) : link ? (
                            <>
                              {saveState?.status === "error" && (
                                <p role="alert" className="text-sm text-destructive">
                                  {saveState.message}
                                </p>
                              )}
                              <Button
                                type="button"
                                className="min-h-11"
                                disabled={!target || saveState?.status === "saving"}
                                onClick={() => void saveReviewedRequest(request)}
                              >
                                {saveState?.status === "saving"
                                  ? "Guardando…"
                                  : "Vincular y guardar"}
                              </Button>
                            </>
                          ) : null}
                          {emailCopies[request.responseId] === "copied" ? (
                            <p role="status" className="border-t pt-2 text-sm">
                              Correo copiado al perfil con auditoría.
                            </p>
                          ) : (
                            target &&
                            request.email &&
                            request.email !== target.email &&
                            onCopyRequesterEmail && (
                              <div className="space-y-2 border-t pt-2">
                                <p className="text-sm">
                                  Correo del perfil: {target.email || "sin correo"} · correo de la
                                  solicitud: {request.email}
                                </p>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="min-h-11"
                                  disabled={emailCopies[request.responseId] === "saving"}
                                  onClick={() => void copyRequesterEmail(request)}
                                >
                                  {emailCopies[request.responseId] === "saving"
                                    ? "Guardando…"
                                    : "Copiar correo revisado al perfil"}
                                </Button>
                                {emailCopies[request.responseId] === "error" && (
                                  <p role="alert" className="text-sm text-destructive">
                                    No se pudo copiar el correo; puedes reintentar.
                                  </p>
                                )}
                              </div>
                            )
                          )}
                        </div>
                      );
                    })()}
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
                disabled={currentPage === 0}
                onClick={() => setPage(Math.max(0, currentPage - 1))}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={currentPage + 1 >= pageCount}
                onClick={() => setPage(Math.min(pageCount - 1, currentPage + 1))}
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
