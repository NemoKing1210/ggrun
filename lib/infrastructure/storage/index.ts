/**
 * File storage — the application-side entry point.
 *
 * `getStorage()` resolves the configured driver lazily and memoizes it, so the
 * AWS client (S3 driver) is constructed at most once per process and only when
 * a request actually touches storage. `setStorage()` swaps the instance; tests
 * use it to inject a fake, and it is also the seam for a future driver that is
 * chosen at runtime.
 */
import { getEnv } from "@/lib/config/env";

import { createStorageDriver, resolveStorageConfig, type StorageConfig } from "./config";
import type { StorageDriver } from "./types";

export * from "./types";
export * from "./errors";
export * from "./keys";
export * from "./sign";
export { resolveStorageConfig, createStorageDriver };
export type { StorageConfig };

let cached: StorageDriver | null = null;
let cachedConfig: StorageConfig | null = null;

/** The process-wide driver, built from the environment on first use. */
export function getStorage(): StorageDriver {
  if (!cached) {
    cachedConfig = resolveStorageConfig(getEnv());
    cached = createStorageDriver(cachedConfig);
  }
  return cached;
}

/**
 * The resolved config. Independent of `getStorage()`: a test may inject a
 * driver without a config, and callers of `maxUploadBytes()`/link signing still
 * need the environment values.
 */
export function getStorageConfig(): StorageConfig {
  if (!cachedConfig) cachedConfig = resolveStorageConfig(getEnv());
  return cachedConfig;
}

/**
 * Replaces the driver (and its config). Passing `null` drops both, so the next
 * `getStorage()` re-reads the environment — the reset tests need.
 */
export function setStorage(driver: StorageDriver | null, config: StorageConfig | null = null): void {
  cached = driver;
  cachedConfig = config;
}

/** Shortcut for the one config field every caller needs. */
export function maxUploadBytes(): number {
  return getStorageConfig().maxUploadBytes;
}
