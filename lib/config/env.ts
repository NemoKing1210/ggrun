import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional().default("http://localhost:3000"),
  RAWG_API_KEY: z.string().optional().default(""),
  STEAM_WEB_API_KEY: z.string().optional().default(""),
  GAMESPOT_API_KEY: z.string().optional().default(""),
  IGDB_CLIENT_ID: z.string().optional().default(""),
  IGDB_CLIENT_SECRET: z.string().optional().default(""),
  PROXY_URL: z.string().optional().default(""),
  BOOTSTRAP_ADMIN_EMAIL: z.string().optional().default(""),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional().default(""),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "fatal"]).optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).optional().default("development"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment variables: ${details}`);
  }
  cached = parsed.data;
  return cached;
}

export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const env = getEnv();
  const value = env[key];
  if (!value) throw new Error(`Missing required env: ${String(key)}`);
  return value as NonNullable<Env[K]>;
}
