import { Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as neonDrizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { drizzle as pgDrizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

type Database = NeonDatabase<typeof schema> | NodePgDatabase<typeof schema>;

let database: Database | undefined;

export function getDatabase() {
  const connectionString = process.env["DATABASE_URL"]?.trim();
  if (!connectionString) {
    throw new Error("Database is not configured. Set DATABASE_URL before using database services.");
  }

  if (!database) {
    const hostname = new URL(connectionString).hostname.toLowerCase();
    // Ordinary local PostgreSQL has no Neon WebSocket proxy.
    const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
    database = isLoopback
      ? pgDrizzle(new pg.Pool({ connectionString }), { schema })
      : neonDrizzle(new NeonPool({ connectionString }), { schema });
  }
  return database;
}
