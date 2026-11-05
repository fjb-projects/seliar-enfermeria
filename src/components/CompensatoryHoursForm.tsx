import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getCompensatoryHistory,
  recordCompensatoryMovement,
  type LedgerView,
  type StaffView,
} from "@/lib/compensatory-bank.functions";
import {
  listCompensatoryPeriods,
  recordCompensatoryPeriod,
  type CompensatoryPeriod,
} from "@/lib/compensatory-period.functions";
import {
  buildBalanceReviewRows,
  calculatePeriodPreview,
  formatWorkflowMinutes,
  getArgentinaToday,
  getWorkflowOperation,
  parseWorkflowMinutes,
  validateManualMovement,
  type WorkflowOperation,
} from "@/lib/compensatory-hours-workflow";

export type CompensatoryHoursMode = "period" | "manual";
export type CompensatoryHoursFormProps = {
  staff: StaffView;
  onSaved: () => void | Promise<void>;
  onBusyChange?: (busy: boolean) => void;
  api?: Partial<CompensatoryHoursApi>;
  availableMinutes?: number;
  reservedMinutes?: number;
};

export type CompensatoryHoursApi = {
  getHistory: (
    input: Parameters<typeof getCompensatoryHistory>[0],
  ) => ReturnType<typeof getCompensatoryHistory>;
  recordMovement: (
    input: Parameters<typeof recordCompensatoryMovement>[0],
  ) => ReturnType<typeof recordCompensatoryMovement>;
  listPeriods: (
    input: Parameters<typeof listCompensatoryPeriods>[0],
  ) => ReturnType<typeof listCompensatoryPeriods>;
  recordPeriod: (
    input: Parameters<typeof recordCompensatoryPeriod>[0],
  ) => ReturnType<typeof recordCompensatoryPeriod>;
};

const defaultApi: CompensatoryHoursApi = {
  getHistory: getCompensatoryHistory,
  recordMovement: recordCompensatoryMovement,
  listPeriods: listCompensatoryPeriods,
  recordPeriod: recordCompensatoryPeriod,
};

const monthNames = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

type Step = "data" | "review" | "confirmed";

function operationId() {
  return globalThis.crypto.randomUUID();
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function MinuteInputs({
  id,
  label,
  hours,
  minutes,
  onHoursChange,
  onMinutesChange,
}: {
  id: string;
  label: string;
  hours: string;
  minutes: string;
  onHoursChange: (value: string) => void;
  onMinutesChange: (value: string) => void;
}) {
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Horas" htmlFor={`${id}-hours`}>
          <Input
            id={`${id}-hours`}
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            className="min-h-11"
            value={hours}
            onChange={(event) => onHoursChange(event.currentTarget.value)}
          />
        </Field>
        <Field label="Minutos" htmlFor={`${id}-minutes`}>
          <Input
            id={`${id}-minutes`}
            type="number"
            min="0"
            max="59"
            step="1"
            inputMode="numeric"
            className="min-h-11"
            value={minutes}
            onChange={(event) => onMinutesChange(event.currentTarget.value)}
          />
        </Field>
      </div>
    </fieldset>
  );
}

export function CompensatoryHoursForm({
  staff,
  onSaved,
  onBusyChange,
  api: apiOverrides,
  availableMinutes,
  reservedMinutes,
}: CompensatoryHoursFormProps) {
  const api = useMemo(() => ({ ...defaultApi, ...apiOverrides }), [apiOverrides]);
  const currentYear = Number(getArgentinaToday().slice(0, 4));
  const [mode, setMode] = useState<CompensatoryHoursMode>("period");
  const [step, setStep] = useState<Step>("data");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<LedgerView[]>([]);
  const [periods, setPeriods] = useState<CompensatoryPeriod[]>([]);
  const [registeredTakenByYear, setRegisteredTakenByYear] = useState<
    Record<number, Record<string, number>>
  >({});
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [year, setYear] = useState(String(currentYear));
  const [month, setMonth] = useState(String(Number(getArgentinaToday().slice(5, 7))));
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("0");
  const [externalHours, setExternalHours] = useState("0");
  const [externalMinutes, setExternalMinutes] = useState("0");
  const [kind, setKind] = useState<"opening" | "credit" | "debit">("credit");
  const [effectiveDate, setEffectiveDate] = useState(getArgentinaToday());
  const [reason, setReason] = useState("");
  const pendingOperation = useRef<WorkflowOperation | null>(null);

  useEffect(() => onBusyChange?.(busy || uncertain), [busy, uncertain, onBusyChange]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setDataError("");
    const years = [2024, 2025, currentYear].filter(
      (value, index, all) => all.indexOf(value) === index,
    );
    void Promise.all([
      api.getHistory({ data: { staffId: staff.id } }),
      ...years.map((value) => api.listPeriods({ data: { staffId: staff.id, year: value } })),
    ])
      .then(([ledger, ...periodResults]) => {
        if (!active) return;
        setHistory(ledger.entries);
        setPeriods(periodResults.flatMap((item) => item.periods));
        setRegisteredTakenByYear(
          Object.fromEntries(
            periodResults.map((item, index) => [years[index]!, item.registeredTakenByMonth]),
          ),
        );
      })
      .catch((cause: unknown) => {
        if (active)
          setDataError(
            cause instanceof Error ? cause.message : "No se pudo cargar el historial previo.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, staff.id, currentYear]);

  const parsedHours = parseWorkflowMinutes(hours, minutes);
  const parsedExternal = parseWorkflowMinutes(externalHours, externalMinutes);
  const selectedYear = Number(year);
  const isAnnual = selectedYear === 2024 || selectedYear === 2025;
  const activeDuplicate = periods.some(
    (period) =>
      period.status === "active" &&
      period.year === selectedYear &&
      period.month === (isAnnual ? null : Number(month)),
  );
  const periodPreview = isAnnual
    ? calculatePeriodPreview({ annualNetMinutes: parsedHours ?? 0, registeredTakenMinutes: 0 })
    : calculatePeriodPreview({
        generatedMinutes: parsedHours ?? 0,
        externalTakenMinutes: parsedExternal ?? 0,
        registeredTakenMinutes: registeredTakenByYear[selectedYear]?.[month] ?? 0,
      });
  const manualValidation =
    parsedHours === null
      ? "Ingresa horas enteras y minutos entre 0 y 59."
      : validateManualMovement({
          kind,
          minutes: parsedHours,
          balanceMinutes: availableMinutes ?? staff.balanceMinutes,
          hasMovements: history.length > 0,
        });

  function validateData() {
    if (loading || dataError) return dataError || "Espera a que se cargue el historial previo.";
    if (!staff.isActive) return "Reactiva al agente antes de registrar movimientos.";
    if (!reason.trim()) return "Indica el motivo o respaldo del movimiento.";
    if (mode === "manual") {
      if (manualValidation) return manualValidation;
      if (!effectiveDate) return "Indica la fecha efectiva.";
      return null;
    }
    if (activeDuplicate) return "Ya existe un período activo para ese mes o año.";
    if (parsedHours === null || (!isAnnual && parsedExternal === null))
      return "Ingresa horas enteras y minutos entre 0 y 59.";
    if (isAnnual && parsedHours < 0) return "El saldo anual neto no puede ser negativo.";
    return null;
  }

  function moveToReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const issue = validateData();
    if (issue) {
      setError(issue);
      return;
    }
    setError("");
    setStep("review");
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const issue = validateData();
    if (issue) {
      setStep("data");
      setError(issue);
      return;
    }
    const cleanReason = reason.trim();
    const payload =
      mode === "manual"
        ? { staffId: staff.id, kind, minutes: parsedHours!, reason: cleanReason, effectiveDate }
        : isAnnual
          ? {
              staffId: staff.id,
              year: selectedYear,
              month: null,
              generatedMinutes: null,
              externalTakenMinutes: null,
              annualNetMinutes: parsedHours!,
              reason: cleanReason,
            }
          : {
              staffId: staff.id,
              year: selectedYear,
              month: Number(month),
              generatedMinutes: parsedHours!,
              externalTakenMinutes: parsedExternal!,
              annualNetMinutes: null,
              reason: cleanReason,
            };
    pendingOperation.current = getWorkflowOperation(pendingOperation.current, payload, operationId);
    setBusy(true);
    setError("");
    try {
      if (mode === "manual") {
        await api.recordMovement({
          data: { ...payload, clientOperationId: pendingOperation.current.id },
        });
      } else {
        await api.recordPeriod({ data: { ...payload, operationId: pendingOperation.current.id } });
      }
    } catch (cause) {
      setUncertain(true);
      setError(
        `${cause instanceof Error ? cause.message : "No se pudo confirmar el registro."} Conservamos los datos para reintentar con la misma operación.`,
      );
      setBusy(false);
      return;
    }

    pendingOperation.current = null;
    setUncertain(false);
    setNotice(
      mode === "manual"
        ? "El ajuste quedó registrado en el historial."
        : "El período quedó registrado en el historial.",
    );
    setStep("confirmed");
    try {
      await onSaved();
    } catch {
      setError(
        "El registro quedó confirmado, pero no se pudo actualizar la vista. Puedes volver a cargarla.",
      );
    } finally {
      setBusy(false);
    }
  }

  function startAnother() {
    setStep("data");
    setError("");
    setNotice("");
    setUncertain(false);
    setReason("");
    setHours("");
    setMinutes("0");
    setExternalHours("0");
    setExternalMinutes("0");
    setEffectiveDate(getArgentinaToday());
  }

  const balanceDelta =
    mode === "manual"
      ? kind === "debit"
        ? -parsedHours!
        : parsedHours!
      : periodPreview.balanceDeltaMinutes;
  const displayedNet = mode === "period" ? periodPreview.netMinutes : balanceDelta;
  const balanceReviewRows = buildBalanceReviewRows({
    balanceMinutes: staff.balanceMinutes,
    ...(availableMinutes === undefined ? {} : { availableMinutes }),
    ...(reservedMinutes === undefined ? {} : { reservedMinutes }),
    monthlyReferenceMinutes: staff.monthlyLimitMinutes,
    balanceDeltaMinutes: balanceDelta,
  });
  const statusText = loading
    ? "Cargando saldos e historial…"
    : dataError ||
      [
        `Saldo contable: ${formatWorkflowMinutes(staff.balanceMinutes)}`,
        availableMinutes === undefined
          ? undefined
          : `Disponible: ${formatWorkflowMinutes(availableMinutes)}`,
        reservedMinutes === undefined
          ? undefined
          : `Reservado: ${formatWorkflowMinutes(reservedMinutes)}`,
        staff.monthlyLimitMinutes > 0
          ? `Referencia mensual: ${formatWorkflowMinutes(staff.monthlyLimitMinutes)}`
          : undefined,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" · ");

  return (
    <section className="space-y-4" aria-label={`Gestionar horas de ${staff.name}`}>
      <div className="flex justify-end border-b pb-3">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {step === "confirmed"
            ? "Confirmación"
            : step === "review"
              ? "Paso 2 de 2 · Revisar"
              : "Paso 1 de 2 · Datos"}
        </p>
      </div>
      {step === "confirmed" ? (
        <div role="status" className="space-y-3">
          <p className="font-medium">{notice}</p>
          <p className="text-sm text-muted-foreground">
            El saldo se actualiza al volver a cargar los datos del agente.
          </p>
          <Button type="button" variant="outline" onClick={startAnother}>
            Gestionar otro movimiento
          </Button>
        </div>
      ) : step === "data" ? (
        <form className="space-y-4" onSubmit={moveToReview}>
          <fieldset className="space-y-2" disabled={busy}>
            <legend className="text-sm font-medium">¿Qué querés gestionar?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <input
                  type="radio"
                  name="mode"
                  value="period"
                  checked={mode === "period"}
                  onChange={() => setMode("period")}
                />
                Liquidación por período
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <input
                  type="radio"
                  name="mode"
                  value="manual"
                  checked={mode === "manual"}
                  onChange={() => setMode("manual")}
                />
                Ajuste manual
              </label>
            </div>
          </fieldset>
          <p className="text-sm text-muted-foreground">{statusText}</p>
          {mode === "period" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Tipo de período" htmlFor="hours-year">
                  <select
                    id="hours-year"
                    className="min-h-11 w-full rounded-md border bg-background px-3 text-sm"
                    value={year}
                    onChange={(event) => setYear(event.currentTarget.value)}
                  >
                    <option value={String(currentYear)}>Mensual · {currentYear}</option>
                    <option value="2024">Anual · 2024</option>
                    <option value="2025">Anual · 2025</option>
                  </select>
                </Field>
                {!isAnnual && (
                  <Field label="Mes" htmlFor="hours-month">
                    <select
                      id="hours-month"
                      className="min-h-11 w-full rounded-md border bg-background px-3 text-sm"
                      value={month}
                      onChange={(event) => setMonth(event.currentTarget.value)}
                    >
                      {monthNames.map((name, index) => (
                        <option value={String(index + 1)} key={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>
              {isAnnual ? (
                <MinuteInputs
                  id="annual-net"
                  label="Saldo anual neto"
                  hours={hours}
                  minutes={minutes}
                  onHoursChange={setHours}
                  onMinutesChange={setMinutes}
                />
              ) : (
                <div className="space-y-3">
                  <MinuteInputs
                    id="generated"
                    label="Horas generadas"
                    hours={hours}
                    minutes={minutes}
                    onHoursChange={setHours}
                    onMinutesChange={setMinutes}
                  />
                  <MinuteInputs
                    id="external"
                    label="Horas externas tomadas"
                    hours={externalHours}
                    minutes={externalMinutes}
                    onHoursChange={setExternalHours}
                    onMinutesChange={setExternalMinutes}
                  />
                  <p className="text-xs text-muted-foreground">
                    Los consumos ya registrados por el sistema se muestran en la revisión y no se
                    descuentan otra vez.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <Field label="Tipo de ajuste" htmlFor="hours-kind">
                <select
                  id="hours-kind"
                  className="min-h-11 w-full rounded-md border bg-background px-3 text-sm"
                  value={kind}
                  onChange={(event) => setKind(event.currentTarget.value as typeof kind)}
                >
                  {!history.length && <option value="opening">Saldo inicial</option>}
                  <option value="credit">Acreditación</option>
                  <option value="debit">Débito</option>
                </select>
              </Field>
              <MinuteInputs
                id="manual"
                label="Cantidad a ajustar"
                hours={hours}
                minutes={minutes}
                onHoursChange={setHours}
                onMinutesChange={setMinutes}
              />
              <Field label="Fecha efectiva" htmlFor="hours-date">
                <Input
                  id="hours-date"
                  type="date"
                  max={getArgentinaToday()}
                  className="min-h-11"
                  value={effectiveDate}
                  onChange={(event) => setEffectiveDate(event.currentTarget.value)}
                />
              </Field>
            </div>
          )}
          <Field label="Motivo o respaldo" htmlFor="hours-reason">
            <textarea
              id="hours-reason"
              className="min-h-20 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm"
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.currentTarget.value)}
            />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || loading || Boolean(dataError)}>
              Revisar
            </Button>
          </div>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={confirm}>
          <dl className="grid grid-cols-1 gap-2 rounded-md border p-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Tipo</dt>
              <dd className="font-medium">
                {mode === "period"
                  ? isAnnual
                    ? `Saldo anual ${selectedYear}`
                    : `${monthNames[Number(month) - 1]} ${selectedYear}`
                  : { opening: "Saldo inicial", credit: "Acreditación", debit: "Débito" }[kind]}
              </dd>
            </div>
            {balanceReviewRows.map((row) => (
              <div key={row.label}>
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="font-medium">{formatWorkflowMinutes(row.minutes)}</dd>
              </div>
            ))}
            <div>
              <dt className="text-muted-foreground">Neto mostrado</dt>
              <dd className="font-medium">{formatWorkflowMinutes(displayedNet)}</dd>
            </div>
            {mode === "period" && !isAnnual && (
              <div>
                <dt className="text-muted-foreground">Consumos ya registrados por el sistema</dt>
                <dd className="font-medium">
                  {formatWorkflowMinutes(periodPreview.registeredTakenMinutes)} · sin segundo débito
                </dd>
              </div>
            )}
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Motivo</dt>
              <dd>{reason.trim()}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            Las reservas vigentes se mantienen protegidas por el registro del servidor; esta
            revisión no las convierte en un débito adicional.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy || uncertain}
              onClick={() => {
                setError("");
                setStep("data");
              }}
            >
              Volver a datos
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Registrando…" : uncertain ? "Reintentar registro" : "Confirmar registro"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
