import ansis from "ansis";

export const LogLevel = {
  QUIET: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
} as const;

export type LogLevelValue = (typeof LogLevel)[keyof typeof LogLevel];

export interface Logger {
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export function createLogger(level: LogLevelValue = LogLevel.INFO): Logger {
  const write = (msg: string) => {
    process.stderr.write(`${msg}\n`);
  };

  return {
    debug(msg: string) {
      if (level >= LogLevel.DEBUG) write(ansis.gray(`[debug] ${msg}`));
    },
    info(msg: string) {
      if (level >= LogLevel.INFO) write(ansis.blue(`[info] ${msg}`));
    },
    warn(msg: string) {
      if (level >= LogLevel.WARN) write(ansis.yellow(`[warn] ${msg}`));
    },
    error(msg: string) {
      write(ansis.red(`[error] ${msg}`));
    },
  };
}
