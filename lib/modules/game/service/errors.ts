import { AppError } from "@/lib/errors";

export class GameLoopError extends AppError {
  constructor(code: string) {
    super(code, {}, 400);
    this.name = "GameLoopError";
  }
}
