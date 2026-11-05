import { describe, expect, it } from "vitest";
import { notificationDatabaseTimestampDecoder } from "./compensatory-notification.server";

describe("notification database clock decoder", () => {
  it("turns a Neon timestamp string into a Date before timestamp columns encode writes", () => {
    const value = notificationDatabaseTimestampDecoder.mapFromDriverValue("2026-10-31T20:30:00.000Z");
    expect(value).toBeInstanceOf(Date);
    expect(value.toISOString()).toBe("2026-10-31T20:30:00.000Z");
  });
});
