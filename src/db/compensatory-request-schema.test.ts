import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { compensatoryRequest } from "./schema";

describe("compensatory request schema", () => {
  it("keeps the original request fields as text and associates each row with staff", () => {
    const columns = getTableColumns(compensatoryRequest);
    expect(Object.keys(columns)).toEqual([
      "id",
      "clientOperationId",
      "staffId",
      "createdByUserId",
      "submittedAt",
      "requesterName",
      "requesterMobile",
      "compensatoryDate",
      "hours",
      "createdAt",
    ]);
    for (const key of [
      "submittedAt",
      "requesterName",
      "requesterMobile",
      "compensatoryDate",
      "hours",
    ] as const) {
      expect(columns[key].dataType).toBe("string");
      expect(columns[key].notNull).toBe(true);
    }
    expect(columns.staffId.notNull).toBe(true);
    expect(columns).not.toHaveProperty("sourceResponseId");
  });
});
