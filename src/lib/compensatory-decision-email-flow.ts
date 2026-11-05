type Notification = { id: string; recipientKind: string; decisionVersion: number; status: string };
type SendInput = { notificationId: string; recipient: string; confirmed: true; clientOperationId: string };
export type DecisionEmailResult =
  | { kind: "notification"; status: string }
  | { kind: "pending" }
  | { kind: "uncertain" };

/** Decision persistence is authoritative; notification can never roll it back. */
export async function decideAndNotify(
  input: { requestId: string; expectedVersion: number; recipient: string; notificationOperationId: string },
  api: {
    decide: () => Promise<unknown>;
    list: (requestId: string) => Promise<Notification[]>;
    send: (data: SendInput) => Promise<{ status: string }>;
  },
): Promise<DecisionEmailResult> {
  await api.decide();
  let notices: Notification[];
  try {
    notices = await api.list(input.requestId);
  } catch {
    return { kind: "pending" };
  }
  const matches = notices.filter((item) =>
    item.recipientKind === "requester" && item.decisionVersion === input.expectedVersion + 1,
  );
  if (matches.length !== 1) return { kind: "pending" };
  const notice = matches[0]!;
  if (["accepted", "delivered", "sending", "uncertain"].includes(notice.status))
    return { kind: "notification", status: notice.status };
  if (!["pending_review", "pending_recipient", "pending_configuration", "failed"].includes(notice.status))
    return { kind: "pending" };
  try {
    const result = await api.send({
      notificationId: notice.id,
      recipient: input.recipient,
      confirmed: true,
      clientOperationId: input.notificationOperationId,
    });
    return { kind: "notification", status: result.status };
  } catch {
    return { kind: "uncertain" };
  }
}
