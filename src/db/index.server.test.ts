import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const drivers = vi.hoisted(() => ({
  localPool: vi.fn(),
  neonPool: vi.fn(),
  localDrizzle: vi.fn(),
  neonDrizzle: vi.fn(),
}));

vi.mock("pg", () => ({
  default: {
    Pool: class {
      constructor(options: unknown) {
        drivers.localPool(options);
      }
    },
  },
}));
vi.mock("@neondatabase/serverless", () => ({
  Pool: class {
    constructor(options: unknown) {
      drivers.neonPool(options);
    }
  },
}));
vi.mock("drizzle-orm/node-postgres", () => ({ drizzle: drivers.localDrizzle }));
vi.mock("drizzle-orm/neon-serverless", () => ({ drizzle: drivers.neonDrizzle }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  drivers.localDrizzle.mockReturnValue({ driver: "pg" });
  drivers.neonDrizzle.mockReturnValue({ driver: "neon" });
});
afterEach(() => vi.unstubAllEnvs());

describe("database transport selection", () => {
  it.each(["localhost", "LOCALHOST", "127.0.0.1", "[::1]"])(
    "uses native PostgreSQL for the exact loopback host %s",
    async (host) => {
      const url = `postgresql://user:password@${host}:5434/local?sslmode=disable`;
      vi.stubEnv("DATABASE_URL", url);
      const { getDatabase } = await import("./index.server");

      expect(getDatabase()).toEqual({ driver: "pg" });
      expect(drivers.localPool).toHaveBeenCalledExactlyOnceWith({ connectionString: url });
      expect(drivers.localDrizzle).toHaveBeenCalledOnce();
      expect(drivers.localDrizzle.mock.calls[0]?.[1]).toHaveProperty("schema");
      expect(drivers.neonPool).not.toHaveBeenCalled();
      expect(drivers.neonDrizzle).not.toHaveBeenCalled();
    },
  );

  it.each(["db.example.test", "localhost.example.test", "127.0.0.1.example.test"])(
    "preserves Neon for the remote host %s",
    async (host) => {
      const url = `postgres://localhost:password@${host}/remote?sslmode=require`;
      vi.stubEnv("DATABASE_URL", url);
      const { getDatabase } = await import("./index.server");

      const database = getDatabase();
      expect(database).toEqual({ driver: "neon" });
      expect(getDatabase()).toBe(database);
      expect(drivers.neonPool).toHaveBeenCalledExactlyOnceWith({ connectionString: url });
      expect(drivers.neonDrizzle).toHaveBeenCalledOnce();
      expect(drivers.neonDrizzle.mock.calls[0]?.[1]).toHaveProperty("schema");
      expect(drivers.localPool).not.toHaveBeenCalled();
      expect(drivers.localDrizzle).not.toHaveBeenCalled();
    },
  );

  it("creates the local database only once and preserves connection options", async () => {
    const url = "  postgres://user:password@localhost:5434/local?sslmode=require  ";
    vi.stubEnv("DATABASE_URL", url);
    const { getDatabase } = await import("./index.server");

    const database = getDatabase();
    expect(getDatabase()).toBe(database);
    expect(drivers.localPool).toHaveBeenCalledExactlyOnceWith({ connectionString: url.trim() });
    expect(drivers.localDrizzle).toHaveBeenCalledOnce();
  });

  it.each(["", " "])("rejects an absent URL without constructing a client", async (url) => {
    vi.stubEnv("DATABASE_URL", url);
    const { getDatabase } = await import("./index.server");
    expect(() => getDatabase()).toThrow("Database is not configured");
    expect(drivers.localPool).not.toHaveBeenCalled();
    expect(drivers.neonPool).not.toHaveBeenCalled();
  });
});
