import { beforeEach, describe, expect, it } from "vitest";

import type { StorageConfig } from "./config";
import { getStorage, getStorageConfig, maxUploadBytes, setStorage } from "./index";
import type { StorageDriver } from "./types";

const fake: StorageDriver = {
  kind: "local",
  put: async () => {},
  get: async () => null,
  stat: async () => null,
  exists: async () => false,
  delete: async () => {},
  publicUrl: () => null,
  signedUrl: async () => null,
};

const config: StorageConfig = {
  driver: "local",
  root: ".storage",
  signingSecret: "s",
  maxUploadBytes: 1234,
};

beforeEach(() => setStorage(null));

describe("getStorage", () => {
  it("resolves the configured driver lazily and memoizes it", () => {
    const first = getStorage();
    expect(first.kind).toBe("local");
    expect(getStorage()).toBe(first);
  });

  it("rebuilds after a reset", () => {
    const first = getStorage();
    setStorage(null);
    expect(getStorage()).not.toBe(first);
  });

  it("serves an injected driver and config", () => {
    setStorage(fake, config);
    expect(getStorage()).toBe(fake);
    expect(getStorageConfig()).toBe(config);
    expect(maxUploadBytes()).toBe(1234);
  });
});
