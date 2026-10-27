import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createCompensatoryStaff,
  getCompensatoryHistory,
  listCompensatoryStaff,
  recordCompensatoryMovement,
  reverseCompensatoryMovement,
  updateCompensatoryStaff,
  type LedgerView,
  type StaffAuditView,
  type StaffView,
} from "@/lib/compensatory-bank.functions";

type BankApi = {
  listStaff: typeof listCompensatoryStaff;
  getHistory: typeof getCompensatoryHistory;
  createStaff: typeof createCompensatoryStaff;
  updateStaff: typeof updateCompensatoryStaff;
  recordMovement: typeof recordCompensatoryMovement;
  reverseMovement: typeof reverseCompensatoryMovement;
};

const defaultApi: BankApi = {
  listStaff: listCompensatoryStaff,
  getHistory: getCompensatoryHistory,
  createStaff: createCompensatoryStaff,
  updateStaff: updateCompensatoryStaff,
  recordMovement: recordCompensatoryMovement,
  reverseMovement: reverseCompensatoryMovement,
};

function today() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values["year"]}-${values["month"]}-${values["day"]}`;
}

function hoursAndMinutes(totalMinutes: number) {
  const sign = totalMinutes < 0 ? "−" : "";
  const absolute = Math.abs(totalMinutes);
  return `${sign}${Math.floor(absolute / 60)} h ${absolute % 60} min`;
}

function parseMinutes(hours: string, minutes: string) {
  const h = Number(hours);
  const m = Number(minutes);
  if (!Number.isInteger(h) || h < 0 || !Number.isInteger(m) || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function createOperationId() {
  return globalThis.crypto.randomUUID();
}

function inputClass() {
  return "min-h-11";
}

function Field({
  label,
  id,
  children,
  hint,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function StaffAuditHistory({ changes }: { changes: StaffAuditView[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Auditoría del perfil</CardTitle>
        <CardDescription>Cambios de nombre, correo, estado y referencia mensual.</CardDescription>
      </CardHeader>
      <CardContent>
        {!changes.length ? (
          <p className="text-sm text-muted-foreground">No hay cambios de perfil registrados.</p>
        ) : (
          <ul className="space-y-3">
            {changes.map((change) => (
              <li className="border-b pb-3 text-sm" key={change.id}>
                <p className="font-medium">
                  {change.createdAt} · {change.actorName}
                </p>
                <p className="mt-1">{change.reason}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <p>
                    <span className="font-medium">Antes:</span>{" "}
                    {JSON.stringify(change.before ?? {})}
                  </p>
                  <p>
                    <span className="font-medium">Después:</span> {JSON.stringify(change.after)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function CompensatoryBankPanel({
  initialStaff,
  api: apiOverrides,
}: {
  initialStaff: StaffView[];
  api?: Partial<BankApi>;
}) {
  const api = useMemo(() => ({ ...defaultApi, ...apiOverrides }), [apiOverrides]);
  const [staff, setStaff] = useState(initialStaff);
  const [selectedId, setSelectedId] = useState(initialStaff[0]?.id ?? "");
  const selected = staff.find((person) => person.id === selectedId);
  const [entries, setEntries] = useState<LedgerView[]>([]);
  const [changes, setChanges] = useState<StaffAuditView[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [historyError, setHistoryError] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reverseEntryId, setReverseEntryId] = useState("");
  const requestSequence = useRef(0);
  const pendingOperations = useRef(new Map<string, { fingerprint: string; id: string }>());

  const getOperationId = (slot: string, payload: unknown) => {
    const fingerprint = JSON.stringify(payload);
    const previous = pendingOperations.current.get(slot);
    if (previous?.fingerprint === fingerprint) return previous.id;
    const id = createOperationId();
    pendingOperations.current.set(slot, { fingerprint, id });
    return id;
  };

  useEffect(() => {
    const request = ++requestSequence.current;
    if (!selectedId) {
      setEntries([]);
      setChanges([]);
      setHistoryLoading(false);
      return;
    }
    setEntries([]);
    setChanges([]);
    setHistoryError("");
    setHistoryLoading(true);
    void api
      .getHistory({ data: { staffId: selectedId } })
      .then((history) => {
        if (request !== requestSequence.current) return;
        setEntries(history.entries);
        setChanges(history.changes);
      })
      .catch((cause: unknown) => {
        if (request !== requestSequence.current) return;
        setHistoryError(
          getErrorMessage(cause, "No se pudo cargar el historial. Inténtalo de nuevo."),
        );
      })
      .finally(() => {
        if (request === requestSequence.current) setHistoryLoading(false);
      });
    return () => {
      requestSequence.current += 1;
    };
  }, [api, selectedId, historyRevision]);

  async function reloadAfterSave(message: string) {
    try {
      const latest = await api.listStaff();
      setStaff(latest);
      setNotice(message);
      setError("");
      return true;
    } catch (cause) {
      setNotice("");
      setError(
        `${message} Se guardó, pero no se pudo actualizar la lista; vuelve a cargar la página. ${getErrorMessage(cause, "")}`.trim(),
      );
      return false;
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const dni = String(form.get("dni") ?? "").trim();
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const monthlyLimitMinutes = parseMinutes(
      String(form.get("monthlyLimitHours") ?? ""),
      String(form.get("monthlyLimitMinutes") ?? "0"),
    );
    if (!dni || !name || monthlyLimitMinutes === null || monthlyLimitMinutes < 1) {
      setError("Completa un DNI, nombre y referencia mensual válida.");
      return;
    }
    const payload = { dni, name, ...(email ? { email } : {}), monthlyLimitMinutes };
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const created = await api.createStaff({
        data: { ...payload, clientOperationId: getOperationId("create", payload) },
      });
      pendingOperations.current.delete("create");
      formElement.reset();
      const reloaded = await reloadAfterSave("Agente registrado. No se creó una cuenta de acceso.");
      if (reloaded) setSelectedId(created.id);
    } catch (cause) {
      setError(
        getErrorMessage(
          cause,
          "No se pudo registrar el agente. Puedes reintentar sin perder los datos.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleProfileSave(
    event: FormEvent<HTMLFormElement>,
    nextActive = selected?.isActive ?? true,
  ) {
    event.preventDefault();
    await saveProfile(event.currentTarget, nextActive);
  }

  async function saveProfile(formElement: HTMLFormElement, nextActive: boolean) {
    if (!selected) return;
    const form = new FormData(formElement);
    const name = String(form.get("profileName") ?? "").trim();
    const email = String(form.get("profileEmail") ?? "").trim();
    const reason = String(form.get("profileReason") ?? "").trim();
    const monthlyLimitMinutes = parseMinutes(
      String(form.get("profileMonthlyHours") ?? ""),
      String(form.get("profileMonthlyMinutes") ?? "0"),
    );
    if (!name || !reason || monthlyLimitMinutes === null || monthlyLimitMinutes < 1) {
      setError("Indica nombre, referencia mensual válida y motivo del cambio.");
      return;
    }
    const payload = {
      staffId: selected.id,
      name,
      ...(email ? { email } : {}),
      isActive: nextActive,
      monthlyLimitMinutes,
      expectedVersion: selected.version,
      reason,
    };
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.updateStaff({
        data: { ...payload, clientOperationId: getOperationId(`profile:${selected.id}`, payload) },
      });
      pendingOperations.current.delete(`profile:${selected.id}`);
      const reloaded = await reloadAfterSave("Perfil actualizado y cambio auditado.");
      setHistoryRevision((revision) => revision + 1);
      if (reloaded && nextActive !== selected.isActive)
        setNotice(
          nextActive
            ? "Agente reactivado."
            : "Agente desactivado; su historial permanece disponible.",
        );
    } catch (cause) {
      setError(
        getErrorMessage(
          cause,
          "No se pudo guardar el perfil. Conservamos el formulario para reintentar.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const kind = String(form.get("kind")) as "opening" | "credit" | "debit";
    const hours = String(form.get("hours") ?? "");
    const minutesField = String(form.get("minutes") ?? "0");
    const minutes = parseMinutes(hours, minutesField);
    const reason = String(form.get("reason") ?? "").trim();
    const effectiveDate = String(form.get("effectiveDate") ?? "");
    if (!selected.isActive) {
      setError("Reactiva al agente antes de registrar movimientos.");
      return;
    }
    if (!minutes || !reason || !effectiveDate) {
      setError(
        "Indica una cantidad positiva de horas y minutos, fecha efectiva y motivo o respaldo.",
      );
      return;
    }
    if (kind === "debit" && minutes > selected.balanceMinutes) {
      setError("El débito supera el saldo disponible. No se puede registrar saldo negativo.");
      return;
    }
    const payload = { staffId: selected.id, kind, minutes, reason, effectiveDate };
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.recordMovement({
        data: { ...payload, clientOperationId: getOperationId(`movement:${selected.id}`, payload) },
      });
      pendingOperations.current.delete(`movement:${selected.id}`);
      formElement.reset();
      await reloadAfterSave("Movimiento registrado en el historial inmutable.");
      setHistoryRevision((revision) => revision + 1);
    } catch (cause) {
      setError(
        getErrorMessage(
          cause,
          "No se pudo registrar el movimiento. Conservamos los datos para reintentar.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleReverse(event: FormEvent<HTMLFormElement>, entry: LedgerView) {
    event.preventDefault();
    if (!selected) return;
    if (!selected.isActive) {
      setError("Reactiva al agente antes de registrar una reversión.");
      return;
    }
    if (
      entry.kind === "reversal" ||
      entry.reversesEntryId ||
      entries.some((item) => item.reversesEntryId === entry.id)
    ) {
      setError("Este movimiento ya fue revertido o es una reversión.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reverseReason") ?? "").trim();
    const effectiveDate = String(form.get("reverseDate") ?? "");
    if (!reason || !effectiveDate) {
      setError("Indica un motivo y una fecha para la reversión.");
      return;
    }
    const payload = { staffId: selected.id, entryId: entry.id, reason, effectiveDate };
    if (
      !window.confirm(
        "Se agregará un movimiento inverso; el registro original no se modifica. ¿Continuar?",
      )
    )
      return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.reverseMovement({
        data: { ...payload, clientOperationId: getOperationId(`reverse:${entry.id}`, payload) },
      });
      pendingOperations.current.delete(`reverse:${entry.id}`);
      setReverseEntryId("");
      await reloadAfterSave("Reversión agregada como un nuevo movimiento.");
      setHistoryRevision((revision) => revision + 1);
    } catch (cause) {
      setError(getErrorMessage(cause, "No se pudo revertir el movimiento. Puedes reintentar."));
    } finally {
      setSaving(false);
    }
  }

  async function refreshStaff() {
    setRefreshing(true);
    setError("");
    try {
      setStaff(await api.listStaff());
    } catch (cause) {
      setError(getErrorMessage(cause, "No se pudo actualizar la lista."));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Compensatorios</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Administra el saldo histórico de horas acreditadas o debitadas, con motivo, fecha y
            trazabilidad.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 gap-2"
          onClick={() => void refreshStaff()}
          disabled={refreshing}
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          {refreshing ? "Actualizando…" : "Actualizar"}
        </Button>
      </div>
      <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
        La referencia mensual es editable y orientativa; no es un tope del saldo. Este registro no
        crea cuentas ni accesos. No hay datos existentes que se infieran automáticamente.
      </p>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-md border border-border bg-muted/30 p-3 text-sm">
          {notice}
        </p>
      )}
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(17rem,0.8fr)_minmax(0,1.6fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Agentes</CardTitle>
              <CardDescription>
                Identidad por DNI; un agente puede no tener cuenta de acceso.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <label htmlFor="staff-select" className="text-sm font-medium">
                Seleccionar agente
              </label>
              <select
                id="staff-select"
                className={`${inputClass()} w-full rounded-md border border-input bg-background px-3`}
                value={selectedId}
                disabled={saving}
                onChange={(event) => setSelectedId(event.currentTarget.value)}
              >
                <option value="">Selecciona un agente</option>
                {staff.map((person) => (
                  <option value={person.id} key={person.id}>
                    {person.name} · DNI {person.dni}
                    {person.isActive ? "" : " · Inactivo"}
                  </option>
                ))}
              </select>
              {!staff.length && (
                <p className="text-sm text-muted-foreground">Todavía no hay agentes registrados.</p>
              )}
              {selected && (
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Saldo disponible
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {hoursAndMinutes(selected.balanceMinutes)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    DNI {selected.dni} · Referencia {hoursAndMinutes(selected.monthlyLimitMinutes)}{" "}
                    al mes
                  </p>
                  {!selected.isActive && (
                    <p className="mt-2 text-sm font-medium text-destructive">
                      Inactivo: historial disponible; nuevos movimientos bloqueados.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Registrar agente</CardTitle>
              <CardDescription>
                El DNI es único e inmutable; no se crea una cuenta de acceso.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={(event) => void handleCreate(event)}>
                <Field id="new-dni" label="DNI">
                  <Input
                    id="new-dni"
                    name="dni"
                    className={inputClass()}
                    required
                    autoComplete="off"
                  />
                </Field>
                <Field id="new-name" label="Nombre y apellido">
                  <Input id="new-name" name="name" className={inputClass()} required />
                </Field>
                <Field id="new-email" label="Correo electrónico (opcional)">
                  <Input id="new-email" name="email" type="email" className={inputClass()} />
                </Field>
                <div>
                  <p className="mb-1.5 text-sm font-medium">Referencia mensual</p>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Valor inicial: 24 horas. Es una referencia, no un límite de saldo.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Field id="new-monthly-limit-hours" label="Horas">
                      <Input
                        id="new-monthly-limit-hours"
                        name="monthlyLimitHours"
                        type="number"
                        min="0"
                        step="1"
                        defaultValue="24"
                        className={inputClass()}
                        required
                      />
                    </Field>
                    <Field id="new-monthly-limit-minutes" label="Minutos">
                      <Input
                        id="new-monthly-limit-minutes"
                        name="monthlyLimitMinutes"
                        type="number"
                        min="0"
                        max="59"
                        step="1"
                        defaultValue="0"
                        className={inputClass()}
                        required
                      />
                    </Field>
                  </div>
                </div>
                <Button type="submit" className="min-h-11 w-full" disabled={saving}>
                  {saving ? "Guardando…" : "Crear agente"}
                </Button>
              </form>
            </CardContent>
          </Card>
          {selected && (
            <Card>
              <CardHeader>
                <CardTitle>Perfil y referencia mensual</CardTitle>
                <CardDescription>
                  Los cambios se registran en la auditoría. El DNI no se puede cambiar.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  key={`${selected.id}:${selected.version}`}
                  className="space-y-3"
                  onSubmit={(event) => void handleProfileSave(event)}
                >
                  <Field id="profile-name" label="Nombre">
                    <Input
                      id="profile-name"
                      name="profileName"
                      className={inputClass()}
                      defaultValue={selected.name}
                      required
                    />
                  </Field>
                  <Field id="profile-email" label="Correo electrónico (opcional)">
                    <Input
                      id="profile-email"
                      name="profileEmail"
                      type="email"
                      className={inputClass()}
                      defaultValue={selected.email ?? ""}
                    />
                  </Field>
                  <div>
                    <p className="mb-1.5 text-sm font-medium">Referencia mensual</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Field id="profile-limit-hours" label="Horas">
                        <Input
                          id="profile-limit-hours"
                          name="profileMonthlyHours"
                          type="number"
                          min="0"
                          step="1"
                          className={inputClass()}
                          defaultValue={Math.floor(selected.monthlyLimitMinutes / 60)}
                          required
                        />
                      </Field>
                      <Field id="profile-limit-minutes" label="Minutos">
                        <Input
                          id="profile-limit-minutes"
                          name="profileMonthlyMinutes"
                          type="number"
                          min="0"
                          max="59"
                          step="1"
                          className={inputClass()}
                          defaultValue={selected.monthlyLimitMinutes % 60}
                          required
                        />
                      </Field>
                    </div>
                  </div>
                  <Field id="profile-reason" label="Motivo del cambio">
                    <Input
                      id="profile-reason"
                      name="profileReason"
                      className={inputClass()}
                      required
                    />
                  </Field>
                  <Button type="submit" variant="outline" className="min-h-11" disabled={saving}>
                    Guardar perfil
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11"
                    disabled={saving}
                    onClick={(event) => {
                      const form = event.currentTarget.form;
                      if (form) void saveProfile(form, !selected.isActive);
                    }}
                  >
                    {selected.isActive ? "Desactivar agente" : "Reactivar agente"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
        <div className="min-w-0 space-y-5">
          {selected && (
            <Card>
              <CardHeader>
                <CardTitle>Registrar horas</CardTitle>
                <CardDescription>
                  Solo registra horas ya existentes. Toda cantidad requiere fecha efectiva y motivo
                  o respaldo.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  key={selected.id}
                  className="grid gap-3 sm:grid-cols-2"
                  onSubmit={(event) => void handleMovement(event)}
                >
                  <Field id="movement-kind" label="Tipo de movimiento">
                    <select
                      id="movement-kind"
                      name="kind"
                      className={`${inputClass()} w-full rounded-md border border-input bg-background px-3`}
                    >
                      {!entries.length && (
                        <option value="opening">Saldo inicial (solo primer movimiento)</option>
                      )}
                      <option value="credit">Crédito manual</option>
                      <option value="debit">Débito manual</option>
                    </select>
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field id="movement-hours" label="Horas">
                      <Input
                        id="movement-hours"
                        name="hours"
                        type="number"
                        min="0"
                        step="1"
                        className={inputClass()}
                        required
                      />
                    </Field>
                    <Field id="movement-minutes" label="Minutos">
                      <Input
                        id="movement-minutes"
                        name="minutes"
                        type="number"
                        min="0"
                        max="59"
                        step="1"
                        defaultValue="0"
                        className={inputClass()}
                        required
                      />
                    </Field>
                  </div>
                  <Field id="movement-effective-date" label="Fecha efectiva">
                    <Input
                      id="movement-effective-date"
                      name="effectiveDate"
                      type="date"
                      max={today()}
                      defaultValue={today()}
                      className={inputClass()}
                      required
                    />
                  </Field>
                  <Field id="movement-reason" label="Motivo y respaldo">
                    <Input id="movement-reason" name="reason" className={inputClass()} required />
                  </Field>
                  <div className="sm:col-span-2">
                    <Button
                      type="submit"
                      className="min-h-11"
                      disabled={saving || !selected.isActive}
                    >
                      {saving ? "Guardando…" : "Registrar movimiento"}
                    </Button>
                    {!selected.isActive && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Reactiva al agente para registrar movimientos.
                      </p>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Historial de saldo</CardTitle>
              <CardDescription>
                Movimientos cronológicos inmutables, con saldo anterior y posterior.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!selected && (
                <p className="text-sm text-muted-foreground">
                  Selecciona un agente para consultar su historial.
                </p>
              )}
              {historyLoading && (
                <p role="status" className="text-sm text-muted-foreground">
                  Cargando historial…
                </p>
              )}
              {historyError && (
                <div role="alert" className="space-y-2">
                  <p className="text-sm text-destructive">{historyError}</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => setHistoryRevision((revision) => revision + 1)}
                  >
                    Reintentar carga
                  </Button>
                </div>
              )}
              {selected && !historyLoading && !historyError && !entries.length && (
                <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                  No hay movimientos registrados para este agente.
                </p>
              )}
              {entries.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="p-2">Fecha / registro</th>
                        <th className="p-2">Movimiento</th>
                        <th className="p-2">Motivo</th>
                        <th className="p-2">Saldo antes / después</th>
                        <th className="p-2">Responsable</th>
                        <th className="p-2">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry) => (
                        <tr
                          id={`ledger-entry-${entry.id}`}
                          className="border-b align-top"
                          key={entry.id}
                        >
                          <td className="p-2 tabular-nums">
                            {entry.effectiveDate}
                            <br />
                            <span className="text-xs text-muted-foreground">
                              {new Date(entry.createdAt).toLocaleString()}
                            </span>
                          </td>
                          <td className="p-2">
                            <span className="capitalize">
                              {entry.kind === "opening"
                                ? "Saldo inicial"
                                : entry.kind === "credit"
                                  ? "Crédito"
                                  : entry.kind === "debit"
                                    ? "Débito"
                                    : "Reversión"}
                            </span>
                            <br />
                            <span className="tabular-nums">{hoursAndMinutes(entry.minutes)}</span>
                          </td>
                          <td className="max-w-64 whitespace-normal p-2">
                            {entry.reason}
                            {entry.reversesEntryId && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                <a
                                  className="underline underline-offset-2"
                                  href={`#ledger-entry-${entry.reversesEntryId}`}
                                >
                                  Reversa el movimiento original
                                </a>
                              </p>
                            )}
                          </td>
                          <td className="p-2 tabular-nums">
                            {hoursAndMinutes(entry.balanceBeforeMinutes)}
                            <br />
                            {hoursAndMinutes(entry.balanceAfterMinutes)}
                          </td>
                          <td className="p-2">{entry.actorName}</td>
                          <td className="p-2">
                            {selected?.isActive &&
                              entry.kind !== "reversal" &&
                              !entry.reversesEntryId &&
                              !entries.some((item) => item.reversesEntryId === entry.id) && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="min-h-11"
                                  onClick={() => setReverseEntryId(entry.id)}
                                >
                                  Revertir
                                </Button>
                              )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {reverseEntryId &&
                selected &&
                entries.find((entry) => entry.id === reverseEntryId) && (
                  <form
                    className="mt-4 grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
                    onSubmit={(event) =>
                      void handleReverse(
                        event,
                        entries.find((entry) => entry.id === reverseEntryId)!,
                      )
                    }
                  >
                    <p className="sm:col-span-2 text-sm font-medium">
                      La reversión crea un asiento nuevo y no edita el original.
                    </p>
                    <Field id="reverse-reason" label="Motivo de la reversión">
                      <Input
                        id="reverse-reason"
                        name="reverseReason"
                        className={inputClass()}
                        required
                      />
                    </Field>
                    <Field id="reverse-date" label="Fecha efectiva">
                      <Input
                        id="reverse-date"
                        name="reverseDate"
                        type="date"
                        max={today()}
                        defaultValue={today()}
                        className={inputClass()}
                        required
                      />
                    </Field>
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <Button type="submit" className="min-h-11" disabled={saving}>
                        Confirmar reversión
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-11"
                        onClick={() => setReverseEntryId("")}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </form>
                )}
            </CardContent>
          </Card>
          {selected && <StaffAuditHistory changes={changes} />}
        </div>
      </div>
    </div>
  );
}
