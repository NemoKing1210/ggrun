/**
 * The file-storage port.
 *
 * A driver moves opaque bytes in and out of one backend (a local directory, an
 * S3-compatible bucket, …). Everything the application cares about — file
 * categories, visibility, ownership, access links — lives one layer up in
 * `lib/modules/files`; a driver knows nothing about users or permissions.
 *
 * Drivers return `null` for a missing object instead of throwing: "not found"
 * is an ordinary outcome of a read, and only real failures (network, disk,
 * credentials) raise `StorageError`.
 */

export type StorageKind = "local" | "s3";

export type PutOptions = {
  /** MIME type recorded on the stored object (S3 sets `Content-Type`; local ignores it). */
  contentType?: string;
  /** `Cache-Control` hint for the stored object (S3 only). */
  cacheControl?: string;
};

export type ObjectStat = {
  size: number;
  contentType?: string;
  modifiedAt?: Date;
};

export type SignedUrlOptions = {
  /** Seconds until the link stops working. */
  expiresIn: number;
  /** MIME type the receiver should see (S3 `response-content-type`). */
  contentType?: string;
};

export interface StorageDriver {
  readonly kind: StorageKind;

  /** Writes `body` at `key`, replacing any existing object. */
  put(key: string, body: Uint8Array, opts?: PutOptions): Promise<void>;
  /** Reads the object, or `null` when it does not exist. */
  get(key: string): Promise<Uint8Array | null>;
  /** Metadata only, or `null` when the object does not exist. */
  stat(key: string): Promise<ObjectStat | null>;
  exists(key: string): Promise<boolean>;
  /** Removes the object. Missing objects are not an error. */
  delete(key: string): Promise<void>;

  /**
   * Permanent direct URL (public bucket or CDN). `null` means the bytes must be
   * served by the application (`/api/files`), which is always the case for the
   * local driver.
   */
  publicUrl(key: string): string | null;
  /**
   * Time-limited direct URL (S3 pre-signed GET). `null` means the application
   * signs its own link instead.
   */
  signedUrl(key: string, opts: SignedUrlOptions): Promise<string | null>;
}
