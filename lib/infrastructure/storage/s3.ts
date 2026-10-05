/**
 * S3-compatible storage driver (AWS S3, Cloudflare R2, MinIO, Wasabi, B2, …).
 *
 * The client is injected rather than constructed here, so the driver is a thin
 * translation layer over four commands and the tests can exercise it without a
 * network. `config.ts` builds the real `S3Client` from the environment.
 *
 * `get` returns `null` for a missing object the same way `local.ts` does —
 * S3 answers with a 404-shaped error, which is a normal read outcome, not a
 * failure.
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { StorageError } from "./errors";
import { assertStorageKey } from "./keys";
import type { ObjectStat, StorageDriver } from "./types";

/** Minimal structural view of `S3Client` — enough for `send`, easy to fake. */
export type S3SendClient = {
  send(command: unknown): Promise<unknown>;
};

export type S3Presigner = (
  client: unknown,
  command: GetObjectCommand,
  options: { expiresIn: number },
) => Promise<string>;

type S3ObjectBody = { transformToByteArray(): Promise<Uint8Array> };
type GetObjectResult = { Body?: S3ObjectBody };
type HeadObjectResult = {
  ContentLength?: number;
  ContentType?: string;
  LastModified?: Date;
};

/** S3 reports a missing object as either of these names, or as a 404 status. */
function isNotFound(e: unknown): boolean {
  const err = e as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  if (!err) return false;
  if (err.name === "NoSuchKey" || err.name === "NotFound") return true;
  return err.$metadata?.httpStatusCode === 404;
}

export type S3DriverOptions = {
  bucket: string;
  client: S3SendClient;
  /** Overridden in tests; defaults to the official pre-signer. */
  presign?: S3Presigner;
  /** Public bucket / CDN base URL. Without it, objects are served via `/api/files`. */
  publicBaseUrl?: string;
};

export function createS3Driver({
  bucket,
  client,
  presign = (c, cmd, opts) => getSignedUrl(c as never, cmd, opts),
  publicBaseUrl,
}: S3DriverOptions): StorageDriver {
  const base = publicBaseUrl ? publicBaseUrl.replace(/\/+$/, "") : null;

  /** Head-object on a validated key; `null` when the object is absent. */
  async function statObject(key: string): Promise<ObjectStat | null> {
    assertStorageKey(key);
    try {
      const head = (await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      )) as HeadObjectResult;
      return {
        size: head.ContentLength ?? 0,
        contentType: head.ContentType,
        modifiedAt: head.LastModified,
      };
    } catch (e) {
      if (isNotFound(e)) return null;
      throw new StorageError("storageReadFailed", `Failed to stat ${key}`, e);
    }
  }

  return {
    kind: "s3",

    async put(key, body, opts) {
      assertStorageKey(key);
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: opts?.contentType,
            CacheControl: opts?.cacheControl,
          }),
        );
      } catch (e) {
        throw new StorageError("storageWriteFailed", `Failed to write ${key}`, e);
      }
    },

    async get(key) {
      assertStorageKey(key);
      try {
        const result = (await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
        )) as GetObjectResult;
        if (!result.Body) return null;
        return new Uint8Array(await result.Body.transformToByteArray());
      } catch (e) {
        if (isNotFound(e)) return null;
        throw new StorageError("storageReadFailed", `Failed to read ${key}`, e);
      }
    },

    async stat(key) {
      return statObject(key);
    },

    async exists(key) {
      return (await statObject(key)) !== null;
    },

    async delete(key) {
      assertStorageKey(key);
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch (e) {
        if (isNotFound(e)) return;
        throw new StorageError("storageDeleteFailed", `Failed to delete ${key}`, e);
      }
    },

    publicUrl(key) {
      if (!base) return null;
      assertStorageKey(key);
      return `${base}/${key}`;
    },

    async signedUrl(key, { expiresIn, contentType }) {
      assertStorageKey(key);
      try {
        return await presign(
          client,
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
            ...(contentType ? { ResponseContentType: contentType } : {}),
          }),
          { expiresIn },
        );
      } catch (e) {
        throw new StorageError("storageReadFailed", `Failed to sign ${key}`, e);
      }
    },
  };
}
