import { describe, expect, it } from "vitest";
import { administrativeCompensatoryRequestSchema } from "./compensatory-admin-request.functions";

const valid = {
  clientOperationId: "c0c7b62f-0879-4b0b-8fc2-e983f4713ea3",
  staffId: "00000000-0000-4000-8000-000000000001",
  requesterEmail: "contact@example.org",
  requesterMobile: "+54 11 1234-5678",
  compensatoryDate: "2026-10-30",
  hours: "2.5",
  reason: "Carga administrativa excepcional",
};

describe("administrative compensatory request function input", () => {
  it("accepts the request contract and an explicit duplicate confirmation", () => {
    expect(administrativeCompensatoryRequestSchema.parse(valid)).toEqual(valid);
    expect(
      administrativeCompensatoryRequestSchema.parse({ ...valid, confirmDuplicate: true }),
    ).toMatchObject({
      ...valid,
      confirmDuplicate: true,
    });
    expect(administrativeCompensatoryRequestSchema.parse({ ...valid, hours: "0:01" }).hours).toBe(
      "0:01",
    );
    expect(administrativeCompensatoryRequestSchema.parse({ ...valid, hours: "12:59" }).hours).toBe(
      "12:59",
    );
  });

  it("rejects missing fields, invalid values, and unrecognized caller-supplied actor data", () => {
    expect(
      administrativeCompensatoryRequestSchema.safeParse({ ...valid, reason: undefined }).success,
    ).toBe(false);
    expect(
      administrativeCompensatoryRequestSchema.safeParse({ ...valid, confirmDuplicate: "yes" })
        .success,
    ).toBe(false);
    expect(
      administrativeCompensatoryRequestSchema.safeParse({ ...valid, actorUserId: "admin" }).success,
    ).toBe(false);
    expect(
      administrativeCompensatoryRequestSchema.safeParse({
        ...valid,
        compensatoryDate: "2026-02-30",
      }).success,
    ).toBe(false);
    expect(
      administrativeCompensatoryRequestSchema.safeParse({ ...valid, hours: "0:60" }).success,
    ).toBe(false);
  });
});
