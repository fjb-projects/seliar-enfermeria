import { describe, expect, it } from "vitest";
import { isActionConfirmationCurrent } from "./EfaActionConfirmation";

describe("isActionConfirmationCurrent", () => {
  it("allows confirmation only for the same target that opened the dialog", () => {
    expect(isActionConfirmationCurrent("call-1:3", "call-1:3")).toBe(true);
    expect(isActionConfirmationCurrent("call-1:3", "call-2:3")).toBe(false);
    expect(isActionConfirmationCurrent("call-1:3", null)).toBe(false);
    expect(isActionConfirmationCurrent(null, "call-1:3")).toBe(false);
  });
});
