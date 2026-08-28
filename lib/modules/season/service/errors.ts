import { AppError } from "@/lib/errors";

export class AdminError extends AppError {
  constructor(code: string, params: Record<string, string> = {}) {
    super(code, params, 403);
    this.name = "AdminError";
  }
}
