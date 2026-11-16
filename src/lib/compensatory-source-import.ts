import { parseCompensatoryJson } from "./compensatory-source-review";
import { getOperationalDate } from "./efa-staffing-plan.date";

function requestedCalendarDate(value: string): string | null {
  const trimmed = value.trim();
  const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  const iso = local
    ? `${local[3]}-${local[2]!.padStart(2, "0")}-${local[1]!.padStart(2, "0")}`
    : trimmed;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const timestamp = Date.parse(`${iso}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === iso
    ? iso
    : null;
}

export function parseCompensatoryImportJson(text: string, now = new Date()) {
  return filterCompensatoryImport(parseCompensatoryJson(text), now);
}

export function filterCompensatoryImport(
  parsed: ReturnType<typeof parseCompensatoryJson>,
  now = new Date(),
  onlyFuture = true,
) {
  const today = getOperationalDate(now);
  let omittedCount = 0;
  let hasInvalidDate = false;
  const requests = parsed.requests.flatMap((request) => {
    const date = requestedCalendarDate(request.requestedDate);
    if (!date) {
      hasInvalidDate = true;
      return [
        {
          ...request,
          canLink: false,
          issues: [
            ...request.issues,
            "No se pudo validar la fecha solicitada; revisa el dato original antes de importar.",
          ],
        },
      ];
    }
    if (onlyFuture && date < today) {
      omittedCount += 1;
      return [];
    }
    return [request];
  });
  const warnings = [...parsed.warnings];
  if (omittedCount > 0) {
    warnings.push(
      `Solicitudes omitidas por fecha solicitada anterior a hoy (${today}, Buenos Aires): ${omittedCount}.`,
    );
  }
  if (hasInvalidDate) {
    warnings.push(
      "Hay fechas solicitadas que no se pudieron validar; revisa las tarjetas señaladas.",
    );
  }
  return { ...parsed, requests, warnings };
}
