import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// `override: true` so a stale DATABASE_URL from the outer shell/session
// environment cannot shadow the project `.env` file.
config({ override: true });

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: false,
  verbose: true,
});

