import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
} from "react";
import { RefreshCw, Settings2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CompensatoryBankPanel, type BankOperationRegistry } from "./CompensatoryBankPanel";
import {
  CompensatoryWorkspaceTabs,
  CompensatoryWorkspaceTabPanel,
  CompensatoryWorkspaceScope,
  COMPENSATORY_WORKSPACE_DOCK_RESERVE_CLASS,
  type CompensatoryWorkspaceTab,
} from "./CompensatoryWorkspaceControls";
import {
  getCompensatoryOperationalWorkspace,
  classifyCompensatoryRequest,
  decideCompensatoryRequest,
  cancelCompensatoryRequest,
} from "@/lib/compensatory-lifecycle.functions";
import type { StaffView } from "@/lib/compensatory-bank.functions";

export type OperationalWorkspaceData = Awaited<
  ReturnType<typeof getCompensatoryOperationalWorkspace>
>;
type RequestRow = OperationalWorkspaceData["requests"][number];
type WorkspaceApi = {
  workspace: typeof getCompensatoryOperationalWorkspace;
  classify: typeof classifyCompensatoryRequest;
  decide: typeof decideCompensatoryRequest;
  cancel: typeof cancelCompensatoryRequest;
};
const defaultApi: WorkspaceApi = {
  workspace: getCompensatoryOperationalWorkspace,
  classify: classifyCompensatoryRequest,
  decide: decideCompensatoryRequest,
  cancel: cancelCompensatoryRequest,
};
const phases = {
  unclassified: "Sin resolución registrada",
  pending: "Pendiente de decisión",
  approved: "Aprobada · Consumo programado",
  rejected: "Rechazada",
  cancelled: "Cancelada",
  consumed: "Efectivizada",
};
const toolTitles = {
  tools: "Herramientas",
  movement: "Registrar horas",
  profile: "Ficha del agente",
  create: "Nuevo agente",
  ledger: "Movimientos y correcciones",
  import: "Importación y vinculaciones",
};
type Tool = keyof typeof toolTitles;
function minutesLabel(value: number) {
  return `${Math.floor(value / 60)} h${value % 60 ? ` ${value % 60} min` : ""}`;
}
function displayTime(value: Date | string) {
  return new Date(value).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
}
function message(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : "No se pudo completar la operación. Inténtalo nuevamente.";
}

export function CompensatoryOperationalWorkspace({
  initialStaff,
  initialWorkspace,
  api: overrides,
  bankApi,
}: {
  initialStaff: StaffView[];
  initialWorkspace?: OperationalWorkspaceData;
  api?: Partial<WorkspaceApi>;
  bankApi?: ComponentProps<typeof CompensatoryBankPanel>["api"];
}) {
  const api = useMemo(() => ({ ...defaultApi, ...overrides }), [overrides]);
  const [data, setData] = useState(initialWorkspace);
  const [tab, setTab] = useState<CompensatoryWorkspaceTab>("pending");
  const [staffId, setStaffId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialWorkspace);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [decision, setDecision] = useState<"" | "approve" | "reject" | "cancel">("");
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tool, setTool] = useState<Tool | null>(null);
  const [toolBusy, setToolBusy] = useState(false);
  const loadSequence = useRef(0);
  const operations = useRef(new Map<string, { hash: string; id: string }>());
  const bankOperations = useRef<BankOperationRegistry>(new Map());

  const refresh = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    try {
      const latest = await api.workspace({ data: {} });
      if (sequence !== loadSequence.current) return false;
      setData(latest);
      setStaffId((id) => (id && !latest.staff.some((staff) => staff.id === id) ? null : id));
      setLoadError("");
      return true;
    } catch (cause) {
      if (sequence === loadSequence.current) setLoadError(message(cause));
      return false;
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    void refresh();
    return () => {
      loadSequence.current += 1;
    };
  }, [refresh]);

  const staff = useMemo<StaffView[]>(
    () =>
      data
        ? data.staff.map((person) => ({
            ...person,
            createdAt: new Date(person.createdAt).toISOString(),
          }))
        : initialStaff,
    [data, initialStaff],
  );
  const selected = data?.staff.find((person) => person.id === staffId);
  const requests = (data?.requests ?? []).filter(
    (request) => !staffId || request.staffId === staffId,
  );
  const pending = requests
    .filter((request) => request.phase === "pending")
    .sort((a, b) => (a.requestedDate ?? "").localeCompare(b.requestedDate ?? ""));
  const scheduled = requests
    .filter((request) => request.phase === "approved")
    .sort((a, b) => (a.requestedDate ?? "").localeCompare(b.requestedDate ?? ""));
  const history = [...requests].sort(
    (a, b) =>
      new Date(b.decisionAt ?? b.createdAt).getTime() -
      new Date(a.decisionAt ?? a.createdAt).getTime(),
  );
  const unclassified = requests.filter((request) => request.phase === "unclassified");
  const currentRequest = data?.requests.find((request) => request.id === requestId);
  const currentStaff = data?.staff.find((person) => person.id === currentRequest?.staffId);
  const disabled = loading || busy || toolBusy || Boolean(loadError);

  function openRequest(request: RequestRow) {
    setRequestId(request.id);
    setDecision("");
    setReason("");
    setActionError("");
  }
  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentRequest || disabled) return;
    const form = new FormData(event.currentTarget);
    const common = {
      requestId: currentRequest.id,
      expectedVersion: currentRequest.version,
      reason: reason.trim(),
    };
    const kind =
      currentRequest.phase === "unclassified"
        ? "classify"
        : currentRequest.phase === "approved"
          ? "cancel"
          : "decide";
    if (!common.reason) {
      setActionError("Indica el fundamento de la operación.");
      return;
    }
    if (kind === "decide" && decision !== "approve" && decision !== "reject") {
      setActionError("Selecciona una decisión.");
      return;
    }
    const classification = {
      ...common,
      requestedDate: String(form.get("requestedDate") ?? ""),
      minutes: Number(form.get("hours")) * 60 + Number(form.get("minutes")),
    };
    const payload =
      kind === "classify"
        ? classification
        : kind === "cancel"
          ? common
          : { ...common, decision: decision as "approve" | "reject" };
    const hash = JSON.stringify(payload),
      key = `${currentRequest.id}:${kind}`;
    const previous = operations.current.get(key);
    const clientOperationId = previous?.hash === hash ? previous.id : crypto.randomUUID();
    operations.current.set(key, { hash, id: clientOperationId });
    setBusy(true);
    setActionError("");
    try {
      if (kind === "classify")
        await api.classify({ data: { ...classification, clientOperationId } });
      else if (kind === "cancel") await api.cancel({ data: { ...common, clientOperationId } });
      else
        await api.decide({
          data: { ...common, decision: decision as "approve" | "reject", clientOperationId },
        });
      if (!(await refresh())) {
        setActionError(
          "La operación pudo guardarse, pero no se pudo actualizar la vista. Conserva los datos y reintenta para confirmar sin duplicarla.",
        );
        return;
      }
      operations.current.delete(key);
      setRequestId(null);
      setTab(kind === "classify" ? "pending" : decision === "approve" ? "scheduled" : "history");
      setNotice("Operación registrada y auditada. El saldo se actualiza según la fecha efectiva.");
    } catch (cause) {
      setActionError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  const finishTool = useCallback(() => {
    setTool(null);
    setToolBusy(false);
    void refresh();
  }, [refresh]);
  function closeTool(open: boolean) {
    if (!open && !toolBusy) finishTool();
  }

  function requestList(items: RequestRow[], empty: string) {
    return items.length ? (
      <div className="divide-y rounded-lg border bg-card">
        {items.map((request) => {
          const person = staff.find((entry) => entry.id === request.staffId);
          const overdue =
            request.phase === "approved" &&
            request.requestedDate &&
            data &&
            request.requestedDate <= data.serviceDay;
          return (
            <article
              key={request.id}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-3 min-[621px]:grid-cols-[minmax(0,1fr)_8rem_5rem_auto]"
            >
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold">
                  {person?.name ?? request.requesterName}
                </p>
                <p className="text-xs text-muted-foreground">{phases[request.phase]}</p>
              </div>
              <p className="col-start-1 row-start-2 text-xs min-[621px]:col-start-auto min-[621px]:row-start-auto">
                {request.requestedDate ?? request.compensatoryDate}
                <span className="block text-muted-foreground">
                  {overdue
                    ? "Procesamiento pendiente"
                    : request.phase === "approved"
                      ? "Descuento a las 00:00"
                      : "Fecha solicitada"}
                </span>
              </p>
              <p className="col-start-2 row-start-1 whitespace-nowrap text-sm font-semibold tabular-nums min-[621px]:col-start-auto min-[621px]:row-start-auto">
                {request.requestedMinutes === null
                  ? `${request.hours} h`
                  : minutesLabel(request.requestedMinutes)}
              </p>
              <Button
                type="button"
                variant={request.phase === "pending" ? "default" : "outline"}
                className={`col-start-2 row-start-2 min-h-11 min-[621px]:col-start-auto min-[621px]:row-start-auto ${request.phase !== "pending" ? "bg-card shadow-none hover:bg-muted" : ""}`}
                disabled={disabled}
                onClick={() => openRequest(request)}
              >
                {request.phase === "pending" ? "Revisar" : "Ver detalle"}
              </Button>
            </article>
          );
        })}
      </div>
    ) : (
      <p className="py-6 text-sm text-muted-foreground">{empty}</p>
    );
  }
  const balance = selected && (
    <section
      className="mb-4 rounded-lg border bg-card p-3"
      aria-label={`Saldo de ${selected.name}`}
    >
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Saldo", selected.balanceMinutes],
          ["Reservadas", selected.reservedMinutes],
          ["Disponible", selected.availableMinutes],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold tabular-nums">{minutesLabel(Number(value))}</p>
          </div>
        ))}
      </div>
      <Button
        type="button"
        className="mt-3 min-h-11 w-full min-[621px]:w-auto"
        disabled={disabled || !selected.isActive}
        onClick={() => setTool("movement")}
      >
        <Plus className="mr-2 size-4" aria-hidden="true" />
        Registrar horas
      </Button>
    </section>
  );

  return (
    <div
      data-operational-workspace
      className={`min-w-0 space-y-3 ${COMPENSATORY_WORKSPACE_DOCK_RESERVE_CLASS}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <CompensatoryWorkspaceTabs value={tab} onValueChange={setTab} disabled={busy || toolBusy} />
        <div className="ml-auto min-w-0">
          <CompensatoryWorkspaceScope
            staffOptions={staff.map((person) => ({
              id: person.id,
              label: `${person.name} · DNI ${person.dni}`,
            }))}
            selectedStaffId={staffId}
            onSelectStaff={setStaffId}
            disabled={disabled}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9 shrink-0 border-border bg-card text-foreground shadow-none hover:bg-muted max-[620px]:size-11"
          aria-label="Actualizar solicitudes"
          disabled={loading || busy || toolBusy}
          onClick={() => void refresh()}
        >
          <RefreshCw
            aria-hidden="true"
            className={`size-4 ${loading ? "motion-safe:animate-spin" : ""}`}
          />
        </Button>
      </div>
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Actualizando solicitudes y saldos…
        </p>
      )}
      {loadError && (
        <p role="alert" className="text-sm text-destructive">
          {loadError} Usa Actualizar para reintentar; no se tomarán decisiones con datos sin
          verificar.
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      <CompensatoryWorkspaceTabPanel value="pending" activeTab={tab}>
        {balance}
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Pendientes de decisión</h2>
          <span className="text-xs text-muted-foreground">{pending.length}</span>
        </div>
        {!loading && requestList(pending, "No hay solicitudes pendientes de decisión.")}
        {unclassified.length > 0 && (
          <Button
            type="button"
            variant="link"
            className="mt-2 h-auto whitespace-normal p-0 text-left text-xs"
            onClick={() => setTab("history")}
          >
            {unclassified.length} antecedentes sin clasificar. Revisar en Historial; no implican
            aprobación ni descuento.
          </Button>
        )}
      </CompensatoryWorkspaceTabPanel>
      <CompensatoryWorkspaceTabPanel value="scheduled" activeTab={tab}>
        {balance}
        <h2 className="mb-2 text-lg font-medium">Aprobados próximos</h2>
        {!loading && requestList(scheduled, "No hay consumos programados.")}
        <p className="mt-2 text-xs text-muted-foreground">
          Las horas permanecen reservadas hasta el descuento del día aprobado, incluso si el
          ejecutor debe recuperar un procesamiento vencido.
        </p>
      </CompensatoryWorkspaceTabPanel>
      <CompensatoryWorkspaceTabPanel value="history" activeTab={tab}>
        <h2 className="mb-2 text-lg font-medium">Historial cronológico de solicitudes</h2>
        {!loading && requestList(history, "No hay solicitudes registradas.")}
      </CompensatoryWorkspaceTabPanel>
      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 bg-card shadow-none hover:bg-muted"
          disabled={busy || toolBusy}
          onClick={() => setTool("tools")}
        >
          <Settings2 className="mr-2 size-4" aria-hidden="true" />
          Herramientas
        </Button>
        {selected && (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            onClick={() => setTool("ledger")}
            disabled={disabled}
          >
            Movimientos del agente
          </Button>
        )}
      </div>

      <Dialog
        open={Boolean(requestId)}
        onOpenChange={(open) => {
          if (!open && !busy) setRequestId(null);
        }}
      >
        <DialogContent
          className="max-h-[90svh] overflow-y-auto sm:max-w-xl"
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Solicitud de compensatorio</DialogTitle>
            <DialogDescription>
              {currentStaff?.name} ·{" "}
              {currentRequest ? phases[currentRequest.phase] : "Actualizando registro"}
            </DialogDescription>
          </DialogHeader>
          {currentRequest && (
            <>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Fecha original</dt>
                  <dd className="break-words">{currentRequest.compensatoryDate}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Horas originales</dt>
                  <dd>{currentRequest.hours}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Presentada</dt>
                  <dd className="break-words">{currentRequest.submittedAt}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Teléfono operativo</dt>
                  <dd className="break-words">{currentRequest.requesterMobile}</dd>
                </div>
              </dl>
              {currentStaff && (
                <p className="rounded-md bg-muted p-3 text-sm">
                  Disponible: {minutesLabel(currentStaff.availableMinutes)} · Reservadas:{" "}
                  {minutesLabel(currentStaff.reservedMinutes)}
                </p>
              )}
              {currentRequest.phase === "unclassified" && (
                <p className="text-sm">
                  Este antecedente no tiene resolución registrada. Solo una revisión explícita puede
                  enviarlo a pendientes; no se infiere aprobación ni consumo de fechas pasadas.
                </p>
              )}
              {currentRequest.decisionAt && (
                <p className="text-xs text-muted-foreground">
                  Decisión: {displayTime(currentRequest.decisionAt)} ·{" "}
                  {currentRequest.decisionReason}
                </p>
              )}
              {currentRequest.cancelledAt && (
                <p className="text-xs text-muted-foreground">
                  Cancelación: {displayTime(currentRequest.cancelledAt)} ·{" "}
                  {currentRequest.cancellationReason}
                </p>
              )}
              {currentRequest.consumedAt && (
                <p className="text-xs text-muted-foreground">
                  Consumo procesado: {displayTime(currentRequest.consumedAt)} · Fecha efectiva:{" "}
                  {currentRequest.requestedDate}
                </p>
              )}
              {data?.audits
                .filter((audit) => audit.requestId === currentRequest.id)
                .map((audit) => (
                  <p key={audit.id} className="text-xs text-muted-foreground">
                    {displayTime(audit.occurredAt)} ·{" "}
                    {audit.actorKind === "system" ? "Sistema" : audit.actorName} · {audit.reason}
                  </p>
                ))}
              {(["unclassified", "pending"].includes(currentRequest.phase) ||
                (currentRequest.phase === "approved" &&
                  currentRequest.requestedDate &&
                  data &&
                  currentRequest.requestedDate > data.serviceDay)) && (
                <form onSubmit={(event) => void submitRequest(event)} className="space-y-3">
                  {currentRequest.phase === "unclassified" && (
                    <>
                      <label className="block space-y-1 text-sm">
                        Fecha solicitada confirmada
                        <Input type="date" name="requestedDate" min={data?.serviceDay} required />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block space-y-1 text-sm">
                          Horas
                          <Input name="hours" type="number" min="0" step="1" required />
                        </label>
                        <label className="block space-y-1 text-sm">
                          Minutos
                          <Input
                            name="minutes"
                            type="number"
                            min="0"
                            max="59"
                            step="1"
                            defaultValue="0"
                            required
                          />
                        </label>
                      </div>
                    </>
                  )}
                  {currentRequest.phase === "pending" && (
                    <>
                      <p className="text-sm">
                        Fecha confirmada: {currentRequest.requestedDate} ·{" "}
                        {minutesLabel(currentRequest.requestedMinutes ?? 0)}. Aprobar reserva horas;
                        si la fecha es hoy, el consumo se registra inmediatamente.
                      </p>
                      <label className="block space-y-1 text-sm" htmlFor="request-decision">
                        Decisión
                      </label>
                      <select
                        id="request-decision"
                        value={decision}
                        className="min-h-11 w-full rounded-md border bg-background px-3"
                        required
                        disabled={busy}
                        onChange={(event) =>
                          setDecision(event.target.value as "approve" | "reject" | "")
                        }
                      >
                        <option value="">Seleccionar decisión</option>
                        <option value="approve">Aprobar</option>
                        <option value="reject">Rechazar</option>
                      </select>
                    </>
                  )}
                  {currentRequest.phase === "approved" && (
                    <p className="text-sm">
                      Cancelar antes de las 00:00 del día aprobado libera la reserva, sin generar un
                      crédito nuevo.
                    </p>
                  )}
                  <label className="block space-y-1 text-sm" htmlFor="request-reason">
                    Fundamento
                  </label>
                  <Input
                    id="request-reason"
                    value={reason}
                    maxLength={1000}
                    required
                    disabled={busy}
                    onChange={(event) => setReason(event.target.value)}
                  />
                  <Button type="submit" className="min-h-11 w-full" disabled={disabled}>
                    {busy
                      ? "Confirmando…"
                      : currentRequest.phase === "unclassified"
                        ? "Enviar a pendientes"
                        : currentRequest.phase === "approved"
                          ? "Cancelar y liberar reserva"
                          : "Confirmar decisión"}
                  </Button>
                </form>
              )}
            </>
          )}
          {actionError && (
            <p role="alert" className="text-sm text-destructive">
              {actionError}
            </p>
          )}
          {loadError && (
            <Button
              type="button"
              variant="outline"
              disabled={busy || loading}
              onClick={() => void refresh()}
            >
              Actualizar estado de la operación
            </Button>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(tool)} onOpenChange={closeTool}>
        <DialogContent
          className={`max-h-[90svh] overflow-y-auto ${tool === "import" || tool === "ledger" ? "sm:max-w-5xl" : "sm:max-w-xl"}`}
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            if (toolBusy) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>{tool ? toolTitles[tool] : "Herramientas"}</DialogTitle>
            <DialogDescription>
              {selected
                ? `${selected.name} · DNI ${selected.dni}`
                : "Administración de agentes y revisión de archivos"}
            </DialogDescription>
          </DialogHeader>
          {tool === "tools" ? (
            <div className="grid gap-2">
              <Button type="button" variant="outline" onClick={() => setTool("import")}>
                Importar CSV / vincular JSON
              </Button>
              <Button type="button" variant="outline" onClick={() => setTool("create")}>
                Nuevo agente
              </Button>
              {selected && (
                <>
                  <Button type="button" variant="outline" onClick={() => setTool("profile")}>
                    Editar ficha / desactivar / eliminar
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setTool("ledger")}>
                    Movimientos y correcciones
                  </Button>
                </>
              )}
            </div>
          ) : (
            tool && (
              <CompensatoryBankPanel
                key={`${tool}:${staffId ?? "general"}`}
                initialStaff={staff}
                {...(staffId ? { initialSelectedId: staffId } : {})}
                tool={tool}
                {...(bankApi ? { api: bankApi } : {})}
                onSaved={finishTool}
                onExit={() => closeTool(false)}
                onBusyChange={setToolBusy}
                operationRegistry={bankOperations.current}
              />
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
