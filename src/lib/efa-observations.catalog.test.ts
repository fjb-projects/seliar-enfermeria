import { describe, expect, it } from "vitest";
import { efaObservationCatalog, getObservationCatalogForContext } from "./efa-observations.catalog";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("EFA observation catalog", () => {
  it("provides the 24 accepted stable-key options with unique labels and context filters", () => {
    expect(efaObservationCatalog).toHaveLength(24);
    expect(new Set(efaObservationCatalog.map((item) => item.key)).size).toBe(24);
    expect(efaObservationCatalog.find((item) => item.key === "phone.early_location")?.label).toBe(
      "Ubicación temprana",
    );
    expect(getObservationCatalogForContext("phone").every((item) => item.group === "phone")).toBe(
      true,
    );
    expect(efaObservationCatalog.some((item) => item.key === "other")).toBe(false);
  });

  it("seeds the exact accepted key-label pairs without overwriting existing catalog rows", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "drizzle/0010_efa_observations.sql"),
      "utf8",
    );
    const seeded = [
      ...migration.matchAll(/\('([^']+)', '([^']+)', '(?:phone|radio|coordination|duty|record)',/g),
    ].map((match) => [match[1], match[2]]);
    expect(seeded).toHaveLength(24);
    expect(seeded).toEqual(efaObservationCatalog.map((item) => [item.key, item.label]));
    expect(migration).toContain("ON CONFLICT (key) DO NOTHING");
  });
});
