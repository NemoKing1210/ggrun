/**
 * Failures that come from the storage backend itself, not from application
 * rules. The `files` module catches these and translates them into its own
 * error codes (`fileStorageUnavailable`), so a driver never has to know the
 * UI vocabulary.
 */
export type StorageErrorCode =
  | "storageInvalidKey"
  | "storageReadFailed"
  | "storageWriteFailed"
  | "storageDeleteFailed";

export class StorageError extends Error {
  constructor(
    public readonly code: StorageErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "StorageError";
  }
}

export function isStorageError(e: unknown): e is StorageError {
  return e instanceof StorageError;
}
