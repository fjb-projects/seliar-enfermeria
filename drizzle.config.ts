import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Schema generation is offline; a connection is only required for DB operations.
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
