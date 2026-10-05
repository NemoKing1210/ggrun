import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OPTIONAL_KEYS = [
  "NEXT_PUBLIC_SITE_URL",
  "RAWG_API_KEY",
  "STEAM_WEB_API_KEY",
  "GAMESPOT_API_KEY",
  "IGDB_CLIENT_ID",
  "IGDB_CLIENT_SECRET",
  "PROXY_URL",
  "BOOTSTRAP_ADMIN_EMAIL",
  "BOOTSTRAP_ADMIN_PASSWORD",
  "STORAGE_DRIVER",
  "STORAGE_LOCAL_ROOT",
  "STORAGE_PUBLIC_URL",
  "STORAGE_SIGNING_SECRET",
  "STORAGE_MAX_UPLOAD_BYTES",
  "S3_BUCKET",
  "S3_REGION",
  "S3_ENDPOINT",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_FORCE_PATH_STYLE",
  "LOG_LEVEL",
  "NODE_ENV",
] as const;

const DATABASE_URL = "postgresql://u:p@127.0.0.1:1/db";
const AUTH_SECRET = "test-secret";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", DATABASE_URL);
  vi.stubEnv("AUTH_SECRET", AUTH_SECRET);
  for (const key of OPTIONAL_KEYS) vi.stubEnv(key, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("getEnv", () => {
  it("parses the required vars and fills every documented default", async () => {
    const { getEnv } = await import("./env");
    const env = getEnv();

    expect(env.DATABASE_URL).toBe(DATABASE_URL);
    expect(env.AUTH_SECRET).toBe(AUTH_SECRET);
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
    expect(env.NODE_ENV).toBe("development");
    expect(env.LOG_LEVEL).toBeUndefined();
    expect(env.RAWG_API_KEY).toBe("");
    expect(env.STEAM_WEB_API_KEY).toBe("");
    expect(env.GAMESPOT_API_KEY).toBe("");
    expect(env.IGDB_CLIENT_ID).toBe("");
    expect(env.IGDB_CLIENT_SECRET).toBe("");
    expect(env.PROXY_URL).toBe("");
    expect(env.BOOTSTRAP_ADMIN_EMAIL).toBe("");
    expect(env.BOOTSTRAP_ADMIN_PASSWORD).toBe("");
    expect(env.STORAGE_DRIVER).toBe("local");
    expect(env.STORAGE_LOCAL_ROOT).toBe(".storage");
    expect(env.STORAGE_PUBLIC_URL).toBe("");
    expect(env.STORAGE_SIGNING_SECRET).toBe("");
    expect(env.STORAGE_MAX_UPLOAD_BYTES).toBe(8 * 1024 * 1024);
    expect(env.S3_BUCKET).toBe("");
    expect(env.S3_REGION).toBe("us-east-1");
    expect(env.S3_ENDPOINT).toBe("");
    expect(env.S3_ACCESS_KEY_ID).toBe("");
    expect(env.S3_SECRET_ACCESS_KEY).toBe("");
    expect(env.S3_FORCE_PATH_STYLE).toBe("false");
  });

  it("memoizes the parsed env across calls", async () => {
    const { getEnv } = await import("./env");
    expect(getEnv()).toBe(getEnv());
  });

  it("throws when DATABASE_URL is present but empty", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();
    const { getEnv } = await import("./env");
    expect(() => getEnv()).toThrow(/Invalid environment variables: DATABASE_URL/);
  });

  it("throws when DATABASE_URL is absent", async () => {
    vi.stubEnv("DATABASE_URL", undefined);
    vi.resetModules();
    const { getEnv } = await import("./env");
    expect(() => getEnv()).toThrow(/DATABASE_URL/);
  });

  it("throws when AUTH_SECRET is empty", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.resetModules();
    const { getEnv } = await import("./env");
    expect(() => getEnv()).toThrow(/AUTH_SECRET/);
  });

  it("rejects a NODE_ENV outside the documented enum", async () => {
    vi.stubEnv("NODE_ENV", "staging");
    vi.resetModules();
    const { getEnv } = await import("./env");
    expect(() => getEnv()).toThrow(/Invalid environment variables: NODE_ENV/);
  });

  it("rejects an unknown STORAGE_DRIVER and keeps a valid one", async () => {
    vi.stubEnv("STORAGE_DRIVER", "gcs");
    vi.resetModules();
    const invalid = await import("./env");
    expect(() => invalid.getEnv()).toThrow(/STORAGE_DRIVER/);

    vi.stubEnv("STORAGE_DRIVER", "s3");
    vi.resetModules();
    const valid = await import("./env");
    expect(valid.getEnv().STORAGE_DRIVER).toBe("s3");
  });

  it("coerces STORAGE_MAX_UPLOAD_BYTES to a positive integer", async () => {
    vi.stubEnv("STORAGE_MAX_UPLOAD_BYTES", "1048576");
    vi.resetModules();
    const { getEnv } = await import("./env");
    expect(getEnv().STORAGE_MAX_UPLOAD_BYTES).toBe(1_048_576);

    vi.stubEnv("STORAGE_MAX_UPLOAD_BYTES", "0");
    vi.resetModules();
    const invalid = await import("./env");
    expect(() => invalid.getEnv()).toThrow(/STORAGE_MAX_UPLOAD_BYTES/);
  });

  it("rejects an unknown LOG_LEVEL and accepts a valid one", async () => {
    vi.stubEnv("LOG_LEVEL", "verbose");
    vi.resetModules();
    const invalid = await import("./env");
    expect(() => invalid.getEnv()).toThrow(/LOG_LEVEL/);

    vi.stubEnv("LOG_LEVEL", "warn");
    vi.resetModules();
    const valid = await import("./env");
    expect(valid.getEnv().LOG_LEVEL).toBe("warn");
  });

  it("rejects a malformed NEXT_PUBLIC_SITE_URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "not-a-url");
    vi.resetModules();
    const { getEnv } = await import("./env");
    expect(() => getEnv()).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it("keeps a valid non-default NEXT_PUBLIC_SITE_URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://ggrun.test");
    vi.resetModules();
    const { getEnv } = await import("./env");
    expect(getEnv().NEXT_PUBLIC_SITE_URL).toBe("https://ggrun.test");
  });
});

describe("requireEnv", () => {
  it("returns the value of a populated key", async () => {
    const { requireEnv } = await import("./env");
    expect(requireEnv("DATABASE_URL")).toBe(DATABASE_URL);
    expect(requireEnv("AUTH_SECRET")).toBe(AUTH_SECRET);
  });

  it("throws with the key name when the value is empty or absent", async () => {
    const { requireEnv } = await import("./env");
    expect(() => requireEnv("RAWG_API_KEY")).toThrow("Missing required env: RAWG_API_KEY");
    expect(() => requireEnv("LOG_LEVEL")).toThrow("Missing required env: LOG_LEVEL");
  });
});
