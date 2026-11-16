import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  listCompensatoryPeriods,
  recordCompensatoryPeriod,
  reverseCompensatoryPeriod,
  type CompensatoryPeriod,
} from "@/lib/compensatory-period.functions";

type Period = CompensatoryPeriod;

type PeriodApi = {
  list: typeof listCompensatoryPeriods;
  record: typeof recordCompensatoryPeriod;
  reverse: typeof reverseCompensatoryPeriod;
};

type PeriodInput = {
  operationId: string;
  staffId: string;
  year: number;
  month: number | null;
  generatedMinutes: number | null;
  externalTakenMinutes: number | null;
  annualNetMinutes: number | null;
  reason: string;
};

const defaultApi: PeriodApi = {
  list: listCompensatoryPeriods,
  record: recordCompensatoryPeriod,
  reverse: reverseCompensatoryPeriod,
};

const years = [2024, 2025, 2026];
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

function formatMinutes(minutes: number) {
  const sign = minutes < 0 ? "−" : "";
  const absolute = Math.abs(minutes);
  return `${sign}${Math.floor(absolute / 60)} h ${absolute % 60} min`;
}

export function parsePeriodMinutes(hours: string, minutes: string) {
  if (!/^\d+$/.test(hours) || !/^\d+$/.test(minutes)) return null;
  const hourCount = Number(hours);
  const minuteCount = Number(minutes);
  if (!Number.isSafeInteger(hourCount) || !Number.isSafeInteger(minuteCount) || minuteCount > 59)
    return null;
  const total = hourCount * 60 + minuteCount;
  return Number.isSafeInteger(total) ? total : null;
}

function formatMonth(period: Period) {
  return period.month === null ? `Anual ${period.year}` : `${monthNames[period.month - 1]} ${period.year}`;
}

function PeriodAmountFields({
  id,
  label,
  hoursName,
  minutesName,
  hours,
  minutes,
  disabled,
  onHoursChange,
  onMinutesChange,
}: {
  id: string;
  label: string;
  hoursName: string;
  minutesName: string;
  hours: string;
  minutes: string;
  disabled: boolean;
  onHoursChange: (value: string) => void;
  onMinutesChange: (value: string) => void;
}) {
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor={`${id}-hours`}>
            Horas
          </label>
          <Input
            id={`${id}-hours`}
            name={hoursName}
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            className="min-h-11"
            disabled={disabled}
            value={hours}
            onChange={(event) => onHoursChange(event.currentTarget.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor={`${id}-minutes`}>
            Minutos
          </label>
          <Input
            id={`${id}-minutes`}
            name={minutesName}
            type="number"
            min="0"
            max="59"
            step="1"
            inputMode="numeric"
            className="min-h-11"
            disabled={disabled}
            value={minutes}
            onChange={(event) => onMinutesChange(event.currentTarget.value)}
          />
        </div>
      </div>
    </fieldset>
  );
}

export function CompensatoryPeriodPanel({
  staffId,
  api = defaultApi,
  initialYear = 2026,
  initialPeriods = [],
  initialRegisteredTakenByMonth = {},
}: {
  staffId: string;
  api?: PeriodApi;
  initialYear?: number;
  initialPeriods?: Period[];
  initialRegisteredTakenByMonth?: Record<string, number>;
}) {
  const [year, setYear] = useState(initialYear);
  const [periods, setPeriods] = useState(initialPeriods);
  const [registeredTakenByMonth, setRegisteredTakenByMonth] = useState(
    initialRegisteredTakenByMonth,
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [historyRevision, setHistoryRevision] = useState(0);
  const [month, setMonth] = useState("1");
  const [generatedHours, setGeneratedHours] = useState("");
  const [generatedMinutes, setGeneratedMinutes] = useState("0");
  const [externalHours, setExternalHours] = useState("0");
  const [externalMinutes, setExternalMinutes] = useState("0");
  const [annualHours, setAnnualHours] = useState("");
  const [annualMinutes, setAnnualMinutes] = useState("0");
  const [reason, setReason] = useState("");
  const [reversingId, setReversingId] = useState("");
  const [reversalReason, setReversalReason] = useState("");
  const [confirmedReversalIds, setConfirmedReversalIds] = useState<Set<string>>(new Set());
  const requestSequence = useRef(0);
  const pendingOperation = useRef<{ fingerprint: string; id: string } | null>(null);
  const pendingReversal = useRef<{ fingerprint: string; id: string } | null>(null);

  useEffect(() => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError("");
    void api
      .list({ data: { staffId, year } })
      .then((result) => {
        if (requestSequence.current !== sequence) return;
        setPeriods(result.periods);
        setRegisteredTakenByMonth(result.registeredTakenByMonth);
        setConfirmedReversalIds(new Set());
      })
      .catch((cause: unknown) => {
        if (requestSequence.current !== sequence) return;
        setError(cause instanceof Error ? cause.message : "No se pudo cargar el historial.");
      })
      .finally(() => {
        if (requestSequence.current === sequence) setLoading(false);
      });
    return () => {
      requestSequence.current += 1;
    };
  }, [api, staffId, year, historyRevision]);

  const visiblePeriods = periods.filter((period) => period.year === year);
  const registeredTakenForYear = Object.values(registeredTakenByMonth).reduce(
    (sum, minutes) => sum + Math.abs(minutes),
    0,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanReason = reason.trim();
    if (!cleanReason) {
      setError("Indica el motivo o respaldo del período.");
      return;
    }

    let payload: PeriodInput;
    if (year === 2026) {
      const generated = parsePeriodMinutes(generatedHours, generatedMinutes);
      const external = parsePeriodMinutes(externalHours, externalMinutes);
      if (generated === null || external === null) {
        setError("Ingresa horas enteras y minutos entre 0 y 59 para cada cantidad.");
        return;
      }
      if (visiblePeriods.some((period) => period.month === Number(month) && period.status === "active")) {
        setError("Ya existe un período activo para ese mes. Revisa el historial antes de continuar.");
        return;
      }
      payload = {
        staffId,
        year,
        month: Number(month),
        generatedMinutes: generated,
        externalTakenMinutes: external,
        annualNetMinutes: null,
        reason: cleanReason,
        operationId: "",
      };
    } else {
      const annualNet = parsePeriodMinutes(annualHours, annualMinutes);
      if (annualNet === null) {
        setError("Ingresa un saldo anual neto con horas enteras y minutos entre 0 y 59.");
        return;
      }
      if (visiblePeriods.some((period) => period.month === null && period.status === "active")) {
        setError("Ya existe un saldo anual activo para ese año. Revisa el historial antes de continuar.");
        return;
      }
      payload = {
        staffId,
        year,
        month: null,
        generatedMinutes: null,
        externalTakenMinutes: null,
        annualNetMinutes: annualNet,
        reason: cleanReason,
        operationId: "",
      };
    }

    const { operationId: _ignored, ...fingerprintPayload } = payload;
    const fingerprint = JSON.stringify(fingerprintPayload);
    if (pendingOperation.current?.fingerprint !== fingerprint) {
      pendingOperation.current = { fingerprint, id: globalThis.crypto.randomUUID() };
    }
    payload.operationId = pendingOperation.current.id;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.record({ data: payload });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `${cause.message} Conservamos los datos para que puedas reintentar.`
          : "No se pudo confirmar el registro. Conservamos los datos para reintentar con la misma operación.",
      );
      setSaving(false);
      return;
    }

    pendingOperation.current = null;
    setReason("");
    setGeneratedHours("");
    setGeneratedMinutes("0");
    setExternalHours("0");
    setExternalMinutes("0");
    setAnnualHours("");
    setAnnualMinutes("0");
    setNotice("Período registrado. El saldo disponible refleja únicamente los movimientos que corresponden.");
    try {
      const result = await api.list({ data: { staffId, year } });
      setPeriods(result.periods);
      setRegisteredTakenByMonth(result.registeredTakenByMonth);
      setConfirmedReversalIds(new Set());
    } catch {
      setError("El período se registró, pero no se pudo actualizar el historial. Intenta cargarlo nuevamente.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePeriodReversal(event: FormEvent<HTMLFormElement>, period: Period) {
    event.preventDefault();
    const cleanReason = reversalReason.trim();
    if (!cleanReason) {
      setError("Indica el motivo de la reversión del período.");
      return;
    }
    const fingerprint = JSON.stringify({ staffId, periodId: period.id, reason: cleanReason });
    if (pendingReversal.current?.fingerprint !== fingerprint) {
      pendingReversal.current = { fingerprint, id: globalThis.crypto.randomUUID() };
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.reverse({
        data: {
          operationId: pendingReversal.current.id,
          staffId,
          periodId: period.id,
          reason: cleanReason,
        },
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `${cause.message} Conservamos el motivo para reintentar la misma operación.`
          : "No se pudo confirmar la reversión. Conservamos el motivo para reintentar la misma operación.",
      );
      setSaving(false);
      return;
    }

    pendingReversal.current = null;
    setReversingId("");
    setReversalReason("");
    setConfirmedReversalIds((current) => new Set(current).add(period.id));
    setNotice("Período revertido y reversión auditada.");
    try {
      const result = await api.list({ data: { staffId, year } });
      setPeriods(result.periods);
      setRegisteredTakenByMonth(result.registeredTakenByMonth);
      setConfirmedReversalIds(new Set());
    } catch {
      setError("La reversión se registró, pero no se pudo actualizar el historial. Intenta cargarlo nuevamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Historial por período</CardTitle>
        <CardDescription>
          Consulta el saldo anual neto de 2024 y 2025 o el detalle mensual de 2026.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(10rem,16rem)_1fr] sm:items-end">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="compensatory-period-year">
              Filtrar por año
            </label>
            <select
              id="compensatory-period-year"
              className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              disabled={saving}
              value={year}
              onChange={(event) => setYear(Number(event.currentTarget.value))}
            >
              {years.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm text-muted-foreground">
            Los consumos registrados por el sistema son informativos; no se descuentan nuevamente del saldo.
          </p>
        </div>

        <form className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2" onSubmit={handleSubmit}>
          <div className="space-y-3 sm:col-span-2">
            <h3 className="text-sm font-semibold">
              {year === 2026 ? "Agregar período mensual" : `Agregar saldo anual ${year}`}
            </h3>
            {year === 2026 ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="compensatory-period-month">
                    Mes
                  </label>
                  <select
                    id="compensatory-period-month"
                    className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                    disabled={saving}
                    value={month}
                    onChange={(event) => setMonth(event.currentTarget.value)}
                  >
                    {monthNames.map((name, index) => (
                      <option key={name} value={index + 1}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <PeriodAmountFields
                  id="compensatory-generated"
                  label="Horas generadas"
                  hoursName="generatedHours"
                  minutesName="generatedMinutes"
                  hours={generatedHours}
                  minutes={generatedMinutes}
                  disabled={saving}
                  onHoursChange={setGeneratedHours}
                  onMinutesChange={setGeneratedMinutes}
                />
                <PeriodAmountFields
                  id="compensatory-external"
                  label="Horas externas tomadas"
                  hoursName="externalHours"
                  minutesName="externalMinutes"
                  hours={externalHours}
                  minutes={externalMinutes}
                  disabled={saving}
                  onHoursChange={setExternalHours}
                  onMinutesChange={setExternalMinutes}
                />
              </>
            ) : (
              <PeriodAmountFields
                id="compensatory-annual-net"
                label="Saldo anual neto"
                hoursName="annualNetHours"
                minutesName="annualNetMinutes"
                hours={annualHours}
                minutes={annualMinutes}
                disabled={saving}
                onHoursChange={setAnnualHours}
                onMinutesChange={setAnnualMinutes}
              />
            )}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor="compensatory-period-reason">
              Motivo y respaldo
            </label>
            <Input
              id="compensatory-period-reason"
              value={reason}
              onChange={(event) => setReason(event.currentTarget.value)}
              className="min-h-11"
              disabled={saving}
              required
            />
          </div>
          {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
          {notice && <p role="status" className="text-sm text-muted-foreground sm:col-span-2">{notice}</p>}
          <div className="sm:col-span-2">
            <Button type="submit" className="min-h-11" disabled={saving}>
              {saving ? "Guardando…" : "Registrar período"}
            </Button>
          </div>
        </form>

        {registeredTakenForYear > 0 && (
          <p className="rounded-md bg-muted/40 p-3 text-sm">
            Consumos registrados por la aplicación en {year}: {formatMinutes(registeredTakenForYear)}.
            {" "}Se muestran para contexto y no se descuentan nuevamente del saldo.
          </p>
        )}
        {loading && <p role="status" className="text-sm text-muted-foreground">Cargando historial…</p>}
        {error && !loading && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!loading && !visiblePeriods.length && (
          <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
            No hay períodos registrados para {year}.
          </p>
        )}
        {visiblePeriods.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[62rem] border-collapse text-left text-sm">
              <caption className="pb-2 text-left font-medium">Detalle de períodos de {year}</caption>
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th scope="col" className="p-2">Período</th>
                  <th scope="col" className="p-2">Revisión / estado</th>
                  <th scope="col" className="p-2">Generadas</th>
                  <th scope="col" className="p-2">Tomadas externas</th>
                  <th scope="col" className="p-2">Registradas por el sistema</th>
                  <th scope="col" className="p-2">Horas netas del período</th>
                  <th scope="col" className="p-2">Acciones y auditoría</th>
                </tr>
              </thead>
              <tbody>
                {visiblePeriods.map((period) => (
                  <tr id={`compensatory-period-${period.id}`} key={period.id} className="border-b align-top">
                    <th scope="row" className="p-2 font-medium">{formatMonth(period)}</th>
                    <td className="p-2">
                      <span className="font-medium">Revisión {period.revision}</span>
                      <br />
                      <span
                        className={
                          period.status === "reversed" || confirmedReversalIds.has(period.id)
                            ? "text-destructive"
                            : "text-muted-foreground"
                        }
                      >
                        {period.status === "reversed"
                          ? "Revertido"
                          : confirmedReversalIds.has(period.id)
                            ? "Reversión confirmada"
                            : "Activo"}
                      </span>
                    </td>
                    <td className="p-2 tabular-nums">
                      {period.generatedMinutes === null ? "—" : formatMinutes(period.generatedMinutes)}
                    </td>
                    <td className="p-2 tabular-nums">
                      {period.externalTakenMinutes === null ? "—" : formatMinutes(period.externalTakenMinutes)}
                    </td>
                    <td className="p-2 tabular-nums">
                      {period.month === null
                        ? "—"
                        : formatMinutes(
                            Math.abs(
                              period.registeredTakenMinutes ??
                                registeredTakenByMonth[String(period.month)] ??
                                0,
                            ),
                          )}
                    </td>
                    <td className="p-2 tabular-nums">{formatMinutes(period.netMinutes)}</td>
                    <td className="max-w-80 space-y-2 p-2">
                      <p className="text-xs text-muted-foreground">
                        Registrado {period.createdAt} · {period.actorName}. Motivo: {period.reason}
                      </p>
                      {period.status === "reversed" ? (
                        <p className="text-xs text-muted-foreground">
                          Revertido {period.reversedAt} · {period.reversedByName}. Motivo: {period.reversalReason}
                        </p>
                      ) : confirmedReversalIds.has(period.id) ? (
                        <div className="space-y-2">
                          <p role="status" className="text-xs text-muted-foreground">
                            Reversión confirmada; falta actualizar el detalle auditado.
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-11"
                            disabled={loading || saving}
                            onClick={() => setHistoryRevision((revision) => revision + 1)}
                          >
                            Recargar historial
                          </Button>
                        </div>
                      ) : reversingId === period.id ? (
                        <form
                          className="space-y-2 rounded-md border p-2"
                          onSubmit={(event) => void handlePeriodReversal(event, period)}
                        >
                          <p className="text-sm font-medium">Revertir este período desde el historial</p>
                          <p className="text-xs text-muted-foreground">
                            Al confirmar, se compensará el efecto del período y quedará una revisión auditada;
                            el registro original no se elimina. No uses la reversión genérica del movimiento.
                          </p>
                          <label className="text-xs font-medium" htmlFor={`period-reversal-reason-${period.id}`}>
                            Motivo de la reversión
                          </label>
                          <Input
                            id={`period-reversal-reason-${period.id}`}
                            value={reversalReason}
                            onChange={(event) => setReversalReason(event.currentTarget.value)}
                            className="min-h-11"
                            disabled={saving || Boolean(pendingReversal.current)}
                            required
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button type="submit" className="min-h-11" disabled={saving || !reversalReason.trim()}>
                              {saving
                                ? "Revirtiendo…"
                                : pendingReversal.current
                                  ? "Reintentar reversión"
                                  : "Confirmar reversión"}
                            </Button>
                            {!pendingReversal.current && (
                              <Button
                                type="button"
                                variant="outline"
                                className="min-h-11"
                                disabled={saving}
                                onClick={() => {
                                  setReversingId("");
                                  setReversalReason("");
                                }}
                              >
                                Cancelar
                              </Button>
                            )}
                          </div>
                        </form>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          disabled={saving || Boolean(reversingId)}
                          onClick={() => {
                            setReversingId(period.id);
                            setReversalReason("");
                            setError("");
                          }}
                        >
                          Revertir período
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
