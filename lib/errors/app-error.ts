export type ErrorCode =
  | "authLoginRequired"
  | "authUserExists"
  | "adminStaffRequired"
  | "adminSeasonNotFound"
  | "adminPlayerNotFound"
  | "adminActiveSeasonExists"
  | "adminInvalidTransition"
  | "adminSelfBlock"
  | "adminSelfDelete"
  | "adminSelfDemote"
  | "gameParticipantNotFound"
  | "gameSeasonNotActive"
  | "gameAlreadyHaveRoll"
  | "gameRollNotFound"
  | "gameRollAlreadyResolved"
  | "gameNotAllowed"
  | "gameRerollPending"
  | "gameCompletionPending"
  | "gameRerollLimit"
  | "gameRerollLimitForGame"
  | "gameRerollRequestNotFound"
  | "gameCompletionRequestNotFound"
  | "catalogEmpty"
  | "formUnknown"
  | "formTitleRequired"
  | "formReasonRequired"
  | "formRatingInvalid"
  | "formConfigInvalidJson"
  | "formLoginRequired"
  | "formPasswordRequired"
  | string;

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly params: Record<string, string> = {},
    public readonly status: number = 400,
  ) {
    super(code);
    this.name = "AppError";
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
