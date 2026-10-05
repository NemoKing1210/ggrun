import { describe, expect, it } from "vitest";

import type { Env } from "@/lib/config/env";

import { createStorageDriver, resolveStorageConfig } from "./config";

/** Only the fields `resolveStorageConfig` reads matter here. */
function env(overrides: Record<string, unknown> = {}): Env {
  return {
    STORAGE_DRIVER: "local",
    STORAGE_LOCAL_ROOT: ".storage",
    STORAGE_PUBLIC_URL: "",
    STORAGE_SIGNING_SECRET: "",
    STORAGE_MAX_UPLOAD_BYTES: 8 * 1024 * 1024,
    S3_BUCKET: "",
    S3_REGION: "us-east-1",
    S3_ENDPOINT: "",
    S3_ACCESS_KEY_ID: "",
    S3_SECRET_ACCESS_KEY: "",
    S3_FORCE_PATH_STYLE: "false",
    AUTH_SECRET: "auth-secret",
    ...overrides,
  } as unknown as Env;
}

describe("resolveStorageConfig", () => {
  it("defaults to the local driver with AUTH_SECRET as the link secret", () => {
    expect(resolveStorageConfig(env())).toEqual({
      driver: "local",
      root: ".storage",
      signingSecret: "auth-secret",
      maxUploadBytes: 8 * 1024 * 1024,
    });
  });

  it("prefers a dedicated signing secret when one is set", () => {
    const config = resolveStorageConfig(env({ STORAGE_SIGNING_SECRET: "own-secret" }));
    expect(config.signingSecret).toBe("own-secret");
  });

  it("maps the s3 driver, including a custom endpoint and path style", () => {
    const config = resolveStorageConfig(
      env({
        STORAGE_DRIVER: "s3",
        S3_BUCKET: "ggrun",
        S3_REGION: "auto",
        S3_ENDPOINT: "https://account.r2.cloudflarestorage.com",
        S3_FORCE_PATH_STYLE: "true",
        S3_ACCESS_KEY_ID: "key",
        S3_SECRET_ACCESS_KEY: "secret",
        STORAGE_PUBLIC_URL: "https://cdn.test/files",
      }),
    );
    expect(config).toEqual({
      driver: "s3",
      bucket: "ggrun",
      region: "auto",
      endpoint: "https://account.r2.cloudflarestorage.com",
      forcePathStyle: true,
      accessKeyId: "key",
      secretAccessKey: "secret",
      publicBaseUrl: "https://cdn.test/files",
      signingSecret: "auth-secret",
      maxUploadBytes: 8 * 1024 * 1024,
    });
  });

  it("throws when s3 is selected without a bucket", () => {
    expect(() => resolveStorageConfig(env({ STORAGE_DRIVER: "s3" }))).toThrow(/S3_BUCKET/);
  });

  it("throws when only half of an explicit credential pair is present", () => {
    const base = { STORAGE_DRIVER: "s3", S3_BUCKET: "ggrun" };
    expect(() => resolveStorageConfig(env({ ...base, S3_ACCESS_KEY_ID: "key" }))).toThrow(
      /must be set together/,
    );
    expect(() => resolveStorageConfig(env({ ...base, S3_SECRET_ACCESS_KEY: "secret" }))).toThrow(
      /must be set together/,
    );
    // A fully anonymous config (IAM role / instance profile) is allowed.
    expect(() => resolveStorageConfig(env(base))).not.toThrow();
  });
});

describe("createStorageDriver", () => {
  it("builds a local driver for a local config", () => {
    expect(createStorageDriver(resolveStorageConfig(env())).kind).toBe("local");
  });

  it("builds an s3 driver for an s3 config, without touching the network", () => {
    const config = resolveStorageConfig(env({ STORAGE_DRIVER: "s3", S3_BUCKET: "ggrun" }));
    const driver = createStorageDriver(config);
    expect(driver.kind).toBe("s3");
    expect(driver.publicUrl("avatar/2026/10/123e4567-e89b-42d3-a456-426614174000.jpg")).toBeNull();
  });
});
