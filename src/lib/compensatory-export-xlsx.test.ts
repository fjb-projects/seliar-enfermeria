import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createCompensatoryWorkbook } from "./compensatory-export-xlsx";

async function inspect(report: Parameters<typeof createCompensatoryWorkbook>[0]) {
  const zip = unzipSync(new Uint8Array(await createCompensatoryWorkbook(report)));
  return {
    sheet: strFromU8(zip["xl/worksheets/sheet1.xml"]!),
    strings: strFromU8(zip["xl/sharedStrings.xml"]!),
    styles: strFromU8(zip["xl/styles.xml"]!),
  };
}
function numeric(sheet: string, address: string) {
  const cell = sheet.match(
    new RegExp(`<c\\b[^>]*r="${address}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`),
  )?.[1];
  const value = cell?.match(/<v>([^<]+)<\/v>/)?.[1];
  return value === undefined ? null : Number(value);
}

describe("compensatory XLSX serialization", () => {
  it("writes numeric hours, exact minute totals, blank cells and literal names to a real XLSX", async () => {
    const { sheet, strings, styles } = await inspect({
      year: 2026,
      months: [1, 3],
      warnings: ["Synthetic warning: consumption without liquidation"],
      rows: [
        { name: "=1+1", minutes: [90, -30], totalMinutes: 60 },
        { name: "Álvarez", minutes: [1, null], totalMinutes: 1 },
        { name: "Zero", minutes: [0, 0], totalMinutes: 0 },
        { name: "Missing", minutes: [null, null], totalMinutes: null },
      ],
    });
    expect(strings).toContain("Compensatorios 2026 · Horas netas");
    expect(strings).toContain("Enero");
    expect(strings).toContain("Marzo");
    expect(strings).not.toContain("Febrero");
    expect(strings).toContain("Total 2026");
    expect(strings).toContain("=1+1");
    expect(sheet).not.toContain("<f>");
    expect(numeric(sheet, "B5")).toBe(1.5);
    expect(numeric(sheet, "C5")).toBe(-0.5);
    expect(numeric(sheet, "D5")).toBe(1);
    expect(numeric(sheet, "B6")).toBeCloseTo(1 / 60, 14);
    expect(numeric(sheet, "C6")).toBeNull();
    expect(numeric(sheet, "D7")).toBe(0);
    expect(numeric(sheet, "D8")).toBeNull();
    expect(strings).toContain("Synthetic warning");
    expect(sheet).toContain('ySplit="4"');
    expect(sheet).toContain('xSplit="1"');
    expect(styles).toContain("0.##########");
  });
  it("produces a two-column annual historical statement", async () => {
    const { sheet, strings } = await inspect({
      year: 2025,
      months: [],
      warnings: [],
      rows: [{ name: "Synthetic", minutes: [], totalMinutes: 120 }],
    });
    expect(strings).toContain("Total 2025");
    expect(numeric(sheet, "B5")).toBe(2);
    expect(numeric(sheet, "C5")).toBeNull();
  });
});
