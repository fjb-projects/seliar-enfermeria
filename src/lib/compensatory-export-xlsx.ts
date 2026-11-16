import writeXlsxFile, { type Cell, type SheetData } from "write-excel-file/browser";
import { compensatoryMonthNames, type CompensatoryExport } from "./compensatory-export";

export async function createCompensatoryWorkbook(report: CompensatoryExport) {
  const width = report.months.length + 2;
  const note = (value: string, height: number): Cell[] => [
    {
      value,
      type: String,
      columnSpan: width,
      wrap: true,
      height,
    },
  ];
  const data: SheetData = [
    [
      {
        value: `Compensatorios ${report.year} · Horas netas`,
        type: String,
        columnSpan: width,
        fontSize: 15,
        fontWeight: "bold",
        height: 28,
      },
    ],
    note(
      "Celdas vacías: sin liquidación cargada. El total suma solo los períodos incluidos con datos; no es el saldo acumulado del banco.",
      report.months.length ? 36 : 64,
    ),
    note(
      "Horas decimales: 1,5 equivale a 1 h 30 min. Incluye todos los agentes, también los inactivos.",
      report.months.length ? 30 : 48,
    ),
    [
      "Agente",
      ...report.months.map((month) => compensatoryMonthNames[month - 1]!),
      `Total ${report.year}`,
    ].map((value) => ({
      value,
      type: String,
      fontWeight: "bold",
      textColor: "#ffffff",
      backgroundColor: "#334155",
      height: 25,
    })),
    ...report.rows.map((person): Cell[] => [
      { value: person.name, type: String, height: 30, wrap: true },
      ...[...person.minutes, person.totalMinutes].map((value, index): Cell => ({
        ...(value === null ? {} : { value: value / 60 }),
        type: Number,
        format: "0.##########;[Red]-0.##########;0",
        align: "right",
        ...(index === person.minutes.length ? { fontWeight: "bold" as const } : {}),
      })),
    ]),
  ];
  if (report.warnings.length) {
    data.push([]);
    data.push(...report.warnings.map((warning) => note(warning, report.months.length ? 36 : 64)));
  }
  const blob = await writeXlsxFile(
    data,
    {
      sheet: `Compensatorios ${report.year}`,
      columns: Array.from({ length: width }, (_, index) => ({ width: index ? 17 : 38 })),
      stickyRowsCount: 4,
      stickyColumnsCount: 1,
      orientation: "landscape",
    },
    { fontFamily: "Calibri", fontSize: 11 },
  ).toBlob();
  return blob.arrayBuffer();
}
