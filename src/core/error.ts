export const ExitCode = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  ARGUMENT_ERROR: 2,
  AUTH_FAILURE: 3,
  NETWORK_ERROR: 4,
  TRADE_REJECTED: 5,
  USER_CANCELLED: 6,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

export class WoooError extends Error {
  readonly exitCode: ExitCodeValue;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    exitCode: ExitCodeValue = ExitCode.GENERAL_ERROR,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "WoooError";
    this.exitCode = exitCode;
    this.details = details;
  }
}

export function formatError(err: WoooError, jsonMode: boolean): string {
  if (jsonMode) {
    const obj: Record<string, unknown> = {
      error: err.message,
      code: err.exitCode,
    };
    if (err.details) {
      obj.details = err.details;
    }
    return JSON.stringify(obj);
  }
  return `Error: ${err.message}`;
}
