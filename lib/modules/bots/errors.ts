import { AppError } from "@/lib/errors";

export class BotError extends AppError {
  constructor(code: string, params?: Record<string, string>) {
    super(code, params ?? {}, 400);
    this.name = "BotError";
  }
}
