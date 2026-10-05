/**
 * Storage configuration, resolved from the environment once.
 *
 * `STORAGE_DRIVER` picks the backend; everything else is its settings. The
 * config is a plain value (no driver instance), so it can be asserted in tests
 * and logged without opening a connection.
 */
import { S3Client } from "@aws-sdk/client-s3";

import type { Env } from "@/lib/config/env";

import { createLocalDriver } from "./local";
import { createS3Driver } from "./s3";
import type { StorageDriver } from "./types";

export type LocalStorageConfig = {
  driver: "local";
  /** Directory (absolute) the driver writes into. */
  root: string;
  /** HMAC secret for private access links. */
  signingSecret: string;
  /** Hard ceiling for a single upload, in bytes. */
  maxUploadBytes: number;
};

export type S3StorageConfig = {
  driver: "s3";
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
  /** Public bucket / CDN base URL, when one exists. */
  publicBaseUrl?: string;
  signingSecret: string;
  maxUploadBytes: number;
};

export type StorageConfig = LocalStorageConfig | S3StorageConfig;

/** Turns the flat env into a validated storage config. Throws on a half-configured S3. */
export function resolveStorageConfig(env: Env): StorageConfig {
  const signingSecret = env.STORAGE_SIGNING_SECRET || env.AUTH_SECRET;
  const maxUploadBytes = env.STORAGE_MAX_UPLOAD_BYTES;

  if (env.STORAGE_DRIVER === "s3") {
    if (!env.S3_BUCKET) {
      throw new Error("STORAGE_DRIVER=s3 requires S3_BUCKET to be set");
    }
    const hasAccessKey = Boolean(env.S3_ACCESS_KEY_ID);
    const hasSecret = Boolean(env.S3_SECRET_ACCESS_KEY);
    if (hasAccessKey !== hasSecret) {
      throw new Error("S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set together");
    }
    return {
      driver: "s3",
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT || undefined,
      forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
      accessKeyId: env.S3_ACCESS_KEY_ID || undefined,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY || undefined,
      publicBaseUrl: env.STORAGE_PUBLIC_URL || undefined,
      signingSecret,
      maxUploadBytes,
    };
  }

  return {
    driver: "local",
    root: env.STORAGE_LOCAL_ROOT,
    signingSecret,
    maxUploadBytes,
  };
}

/** Builds the driver a config describes. */
export function createStorageDriver(config: StorageConfig): StorageDriver {
  if (config.driver === "local") {
    return createLocalDriver({ root: config.root });
  }

  const client = new S3Client({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    forcePathStyle: config.forcePathStyle,
    ...(config.accessKeyId && config.secretAccessKey
      ? { credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } }
      : {}),
    // SDK v3 adds a CRC32 trailer by default; several S3-compatible stores
    // (MinIO, older R2) reject it. Only compute checksums when the operation
    // requires one — AWS S3 accepts both.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return createS3Driver({
    bucket: config.bucket,
    client,
    publicBaseUrl: config.publicBaseUrl,
  });
}
