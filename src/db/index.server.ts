import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

let pool: Pool | undefined;
let database: ReturnType<typeof drizzle> | undefined;

export function getDatabase() {
  const connectionString = process.env["DATABASE_URL"]?.trim();
  if (!connectionString) {
    throw new Error("Database is not configured. Set DATABASE_URL before using database services.");
  }

  if (!pool) pool = new Pool({ connectionString });
  if (!database) database = drizzle(pool, { schema });
  return database;
}
