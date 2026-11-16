import { readFileSync } from "node:fs";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { compensatoryDecisionNotification } from "./schema";

const migration = readFileSync(
  new URL("../../drizzle/0034_compensatory_decision_notifications.sql", import.meta.url),
  "utf8",
);
const deliveryMigration = readFileSync(
  new URL("../../drizzle/0035_compensatory_notification_delivery.sql", import.meta.url),
  "utf8",
);

describe("compensatory decision notification schema", () => {
  it("stores an immutable decision snapshot and requires recipient review before dispatch", () => {
    const columns = getTableColumns(compensatoryDecisionNotification);
    expect(Object.keys(columns)).toEqual([
      "id",
      "requestId",
      "decisionVersion",
      "decision",
      "recipientKind",
      "recipient",
      "status",
      "reason",
      "subject",
      "text",
      "createdAt",
      "reviewedByUserId",
      "reviewedAt",
      "idempotencyKey",
      "providerId",
      "lastAttemptAt",
    ]);
    const config = getTableConfig(compensatoryDecisionNotification);
    expect(config.uniqueConstraints.map((item) => item.name)).toContain(
      "compensatory_decision_notification_request_decision_recipient_unique",
    );
    expect(config.checks.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "compensatory_decision_notification_decision_allowed",
        "compensatory_decision_notification_status_allowed",
        "compensatory_decision_notification_recipient_state_consistent",
      ]),
    );
    expect(migration).toContain('CREATE TABLE "compensatory_decision_notification"');
    expect(migration).not.toMatch(/\b(UPDATE\s+"|DELETE\s+FROM|TRUNCATE\s+)/i);
    expect(deliveryMigration).toContain('CREATE TABLE "compensatory_decision_notification_attempt"');
    expect(deliveryMigration).toContain('ADD COLUMN "reviewed_by_user_id"');
    expect(deliveryMigration).not.toMatch(/\b(UPDATE\s+"|DELETE\s+FROM|TRUNCATE\s+)/i);
  });
});
