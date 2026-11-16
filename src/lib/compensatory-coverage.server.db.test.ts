import { describe, expect, it } from "vitest";
import { compensatoryRequest, compensatoryStaff } from "../db/schema";
import { createCompensatoryCoverageStore } from "./compensatory-coverage.server.db";

const OWNER = "10000000-0000-4000-8000-000000000002";
const COVERER = "10000000-0000-4000-8000-000000000003";

function getParamStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(getParamStrings);
  if (!value || typeof value !== "object") return [];
  const record = value as { queryChunks?: unknown; value?: unknown };
  return [...getParamStrings(record.queryChunks), ...getParamStrings(record.value)];
}

describe("compensatory coverage DB staff locks", () => {
  it("takes actual staff row locks in sorted order before the request row lock", async () => {
    const events: string[] = [];
    const ids = [OWNER, COVERER];
    const fakeDatabase = {
      transaction: async (work: (db: unknown) => Promise<unknown>) =>
        work({
          execute: async (query: unknown) => {
            const queryStrings = getParamStrings(query);
            const staffId = ids.find((id) => queryStrings.some((value) => value.includes(id)));
            if (!staffId) throw new Error("Missing staff lock identity in advisory SQL.");
            events.push(`advisory:${staffId}`);
          },
          select: () => ({
            from: (table: unknown) => ({
              where: (condition: unknown) => {
                const isStaff = table === compensatoryStaff;
                const queryStrings = getParamStrings(condition);
                const staffId = isStaff
                  ? ids.find((id) => queryStrings.some((value) => value.includes(id)))
                  : undefined;
                return {
                  for: (mode: string) => {
                    if (mode !== "update") throw new Error(`Unexpected lock mode ${mode}`);
                    events.push(`${isStaff ? "staff-row" : "request-row"}:${staffId ?? "request"}`);
                    return {
                      limit: async () => (isStaff ? [{ id: staffId }] : [{ id: "request" }]),
                    };
                  },
                };
              },
            }),
          }),
        }),
    };
    const store = createCompensatoryCoverageStore(fakeDatabase as never);
    await store.transaction(async (tx) => {
      await tx.lockStaffIds([COVERER, OWNER]);
      await tx.lockRequest("10000000-0000-4000-8000-000000000001");
    });
    expect(events).toEqual([
      `advisory:${OWNER}`,
      `staff-row:${OWNER}`,
      `advisory:${COVERER}`,
      `staff-row:${COVERER}`,
      "request-row:request",
    ]);
  });
});
