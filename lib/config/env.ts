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
  // --- File storage (see lib/infrastructure/storage) ---
  STORAGE_DRIVER: z.enum(["local", "s3"]).optional().default("local"),
  /** Directory the `local` driver writes into, relative to the process cwd. */
  STORAGE_LOCAL_ROOT: z.string().optional().default(".storage"),
  /** Public base URL for direct object delivery (CDN / public bucket). Empty → the app serves the bytes. */
  STORAGE_PUBLIC_URL: z.string().optional().default(""),
  /** HMAC secret for private access links. Empty → AUTH_SECRET is used. */
  STORAGE_SIGNING_SECRET: z.string().optional().default(""),
  /** Hard ceiling for any single upload, whatever the category allows. */
  STORAGE_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().optional().default(8 * 1024 * 1024),
  S3_BUCKET: z.string().optional().default(""),
  S3_REGION: z.string().optional().default("us-east-1"),
  S3_ENDPOINT: z.string().optional().default(""),
  S3_ACCESS_KEY_ID: z.string().optional().default(""),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(""),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).optional().default("false"),
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
