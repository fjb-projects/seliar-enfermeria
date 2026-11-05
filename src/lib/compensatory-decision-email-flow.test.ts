import { describe, expect, it, vi } from "vitest";
import { decideAndNotify } from "./compensatory-decision-email-flow";

describe("decision with optional notification", () => {
  const input = { requestId: "request", expectedVersion: 4, recipient: "test@example.org", notificationOperationId: "send-op" };
  it("never sends if the decision fails", async () => {
    const decide = vi.fn().mockRejectedValue(new Error("decision failed"));
    const list = vi.fn();
    const send = vi.fn();
    await expect(decideAndNotify(input, { decide, list, send })).rejects.toThrow("decision failed");
    expect(list).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
  it("sends only the requester notice for the committed decision version", async () => {
    const decide = vi.fn().mockResolvedValue(undefined);
    const list = vi.fn().mockResolvedValue([
      { id: "old", recipientKind: "requester", decisionVersion: 4, status: "pending_review" },
      { id: "admin", recipientKind: "admin", decisionVersion: 5, status: "pending_review" },
      { id: "new", recipientKind: "requester", decisionVersion: 5, status: "pending_review" },
    ]);
    const send = vi.fn().mockResolvedValue({ status: "accepted" });
    expect(await decideAndNotify(input, { decide, list, send })).toEqual({ kind: "notification", status: "accepted" });
    expect(send).toHaveBeenCalledWith({ notificationId: "new", recipient: input.recipient, confirmed: true, clientOperationId: "send-op" });
  });
  it("preserves committed decision when lookup or sending fails", async () => {
    const decide = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn().mockRejectedValue(new Error("connection lost"));
    expect(await decideAndNotify(input, { decide, list: vi.fn().mockRejectedValue(new Error("lookup")), send })).toEqual({ kind: "pending" });
    expect(await decideAndNotify(input, { decide, list: vi.fn().mockResolvedValue([{ id: "new", recipientKind: "requester", decisionVersion: 5, status: "pending_review" }]), send })).toEqual({ kind: "uncertain" });
  });
  it("does not send when the matching notification is missing or ambiguous", async () => {
    const send = vi.fn();
    const decide = vi.fn().mockResolvedValue(undefined);
    const list = vi.fn().mockResolvedValue([{ id: "a", recipientKind: "requester", decisionVersion: 5, status: "pending_review" }, { id: "b", recipientKind: "requester", decisionVersion: 5, status: "pending_review" }]);
    expect(await decideAndNotify(input, { decide, list, send })).toEqual({ kind: "pending" });
    expect(send).not.toHaveBeenCalled();
  });
  it("does not start another send for an accepted or uncertain notification", async () => {
    const send = vi.fn();
    const decide = vi.fn().mockResolvedValue(undefined);
    for (const status of ["accepted", "uncertain", "sending"]) {
      const list = vi.fn().mockResolvedValue([{ id: "a", recipientKind: "requester", decisionVersion: 5, status }]);
      expect(await decideAndNotify(input, { decide, list, send })).toEqual({ kind: "notification", status });
    }
    expect(send).not.toHaveBeenCalled();
  });
});
