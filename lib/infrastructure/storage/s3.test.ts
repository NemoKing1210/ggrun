import { describe, expect, it, vi } from "vitest";

import { StorageError } from "./errors";
import { buildStorageKey } from "./keys";
import { createS3Driver, type S3Presigner, type S3SendClient } from "./s3";

const AT = new Date(Date.UTC(2026, 9, 5));
const KEY = buildStorageKey("avatar", "png", AT);

function notFound(): Error {
  return Object.assign(new Error("missing"), { name: "NoSuchKey" });
}

/** In-memory stand-in for `S3Client`, keyed by command class name. */
class FakeS3 implements S3SendClient {
  objects = new Map<string, Uint8Array>();
  sent: { name: string; input: Record<string, unknown> }[] = [];

  async send(command: unknown): Promise<unknown> {
    const name = (command as object).constructor.name;
    const input = (command as unknown as { input: Record<string, unknown> }).input;
    this.sent.push({ name, input });

    switch (name) {
      case "PutObjectCommand":
        this.objects.set(input.Key as string, input.Body as Uint8Array);
        return {};
      case "GetObjectCommand": {
        const body = this.objects.get(input.Key as string);
        if (!body) throw notFound();
        return { Body: { transformToByteArray: async () => body } };
      }
      case "HeadObjectCommand": {
        if (!this.objects.has(input.Key as string)) {
          throw Object.assign(new Error("missing"), { $metadata: { httpStatusCode: 404 } });
        }
        const body = this.objects.get(input.Key as string)!;
        return { ContentLength: body.byteLength, ContentType: "image/png", LastModified: new Date(0) };
      }
      case "DeleteObjectCommand":
        if (!this.objects.delete(input.Key as string)) throw notFound();
        return {};
      default:
        throw new Error(`unexpected command ${name}`);
    }
  }
}

function makeDriver(opts: { client?: FakeS3; presign?: S3Presigner; publicBaseUrl?: string } = {}) {
  const client = opts.client ?? new FakeS3();
  const presign = opts.presign ?? vi.fn(async () => "https://signed.test/get");
  const driver = createS3Driver({
    bucket: "ggrun-files",
    client,
    presign,
    publicBaseUrl: opts.publicBaseUrl,
  });
  return { client, presign, driver };
}

describe("s3 driver", () => {
  it("uploads with bucket, key, body and content metadata", async () => {
    const { client, driver } = makeDriver();
    await driver.put(KEY, new TextEncoder().encode("bytes"), {
      contentType: "image/png",
      cacheControl: "public, max-age=31536000, immutable",
    });

    const put = client.sent.find((s) => s.name === "PutObjectCommand")!;
    expect(put.input).toMatchObject({
      Bucket: "ggrun-files",
      Key: KEY,
      ContentType: "image/png",
      CacheControl: "public, max-age=31536000, immutable",
    });
    expect(new TextDecoder().decode(put.input.Body as Uint8Array)).toBe("bytes");
  });

  it("round-trips an object and reports a missing one as null", async () => {
    const { driver } = makeDriver();
    await driver.put(KEY, new TextEncoder().encode("hello"));

    expect(new TextDecoder().decode((await driver.get(KEY))!)).toBe("hello");
    expect(await driver.get(buildStorageKey("avatar", "png", AT))).toBeNull();
    expect(await driver.exists(KEY)).toBe(true);
    expect(await driver.exists(buildStorageKey("avatar", "png", AT))).toBe(false);
  });

  it("stats an object through HeadObject and tolerates a 404 status variant", async () => {
    const { driver } = makeDriver();
    await driver.put(KEY, new TextEncoder().encode("1234"));

    expect(await driver.stat(KEY)).toMatchObject({ size: 4, contentType: "image/png" });
    expect(await driver.stat(buildStorageKey("avatar", "png", AT))).toBeNull();
  });

  it("deletes an object and treats a missing delete as success", async () => {
    const { driver } = makeDriver();
    await driver.put(KEY, new TextEncoder().encode("x"));
    await driver.delete(KEY);
    expect(await driver.exists(KEY)).toBe(false);
    await expect(driver.delete(KEY)).resolves.toBeUndefined();
  });

  it("maps backend failures to storage errors", async () => {
    const failing: S3SendClient = { send: () => Promise.reject(new Error("boom")) };
    const { driver } = makeDriver({ client: failing as FakeS3 });
    await expect(driver.put(KEY, new Uint8Array([1]))).rejects.toMatchObject({
      code: "storageWriteFailed",
    });
    await expect(driver.get(KEY)).rejects.toMatchObject({ code: "storageReadFailed" });
    await expect(driver.delete(KEY)).rejects.toMatchObject({ code: "storageDeleteFailed" });
  });

  it("validates the key before every call", async () => {
    const { driver } = makeDriver();
    const bad = "../../etc/passwd";
    await expect(driver.put(bad, new Uint8Array())).rejects.toBeInstanceOf(StorageError);
    await expect(driver.get(bad)).rejects.toBeInstanceOf(StorageError);
    await expect(driver.stat(bad)).rejects.toBeInstanceOf(StorageError);
    await expect(driver.delete(bad)).rejects.toBeInstanceOf(StorageError);
    await expect(driver.signedUrl(bad, { expiresIn: 60 })).rejects.toBeInstanceOf(StorageError);
    // With no base URL there is nothing to build, so the key is never read.
    expect(driver.publicUrl(bad)).toBeNull();
    expect(() => makeDriver({ publicBaseUrl: "https://cdn.test" }).driver.publicUrl(bad)).toThrow(
      StorageError,
    );
  });

  it("builds a direct public URL only when a base URL is configured", () => {
    expect(makeDriver({ publicBaseUrl: "https://cdn.test/files/" }).driver.publicUrl(KEY)).toBe(
      `https://cdn.test/files/${KEY}`,
    );
    expect(makeDriver().driver.publicUrl(KEY)).toBeNull();
  });

  it("pre-signs a time-limited GET with the response content type", async () => {
    const presign = vi.fn<S3Presigner>(async () => "https://signed.test/x");
    const { driver } = makeDriver({ presign });

    expect(await driver.signedUrl(KEY, { expiresIn: 900, contentType: "image/png" })).toBe(
      "https://signed.test/x",
    );
    const [, command, options] = presign.mock.calls[0]!;
    expect((command as unknown as { input: Record<string, unknown> }).input).toMatchObject({
      Bucket: "ggrun-files",
      Key: KEY,
      ResponseContentType: "image/png",
    });
    expect(options).toEqual({ expiresIn: 900 });
  });

  it("omits the response content type when none is given", async () => {
    const presign = vi.fn<S3Presigner>(async () => "https://signed.test/x");
    const { driver } = makeDriver({ presign });
    await driver.signedUrl(KEY, { expiresIn: 60 });
    const [, command] = presign.mock.calls[0]!;
    expect((command as unknown as { input: Record<string, unknown> }).input).not.toHaveProperty(
      "ResponseContentType",
    );
  });

  it("maps a pre-signer failure to a storage error", async () => {
    const { driver } = makeDriver({ presign: async () => { throw new Error("no creds"); } });
    await expect(driver.signedUrl(KEY, { expiresIn: 60 })).rejects.toMatchObject({
      code: "storageReadFailed",
    });
  });
});
