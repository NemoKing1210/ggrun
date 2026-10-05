import { AppError } from "@/lib/errors";

/**
 * Errors the file module can raise. Codes travel to the UI through the shared
 * `errorText` dictionary (en/ru/uk), exactly like `AdminError` and
 * `GameLoopError` do for their own domains.
 */
export class FileError extends AppError {
  constructor(code: string, params: Record<string, string> = {}, status = 400) {
    super(code, params, status);
    this.name = "FileError";
  }
}

export function isFileError(e: unknown): e is FileError {
  return e instanceof FileError;
}
