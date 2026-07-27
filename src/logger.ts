export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";

const ORDER: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

let resolved: LogLevel | null = null;

function isTruthy(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/**
 * Resolved lazily (and memoized) so `dotenv/config` has run before we read env.
 * LOG_LEVEL wins; DEBUG=true is shorthand for LOG_LEVEL=debug.
 */
function level(): LogLevel {
  if (resolved) return resolved;
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (raw && raw in ORDER) {
    resolved = raw as LogLevel;
  } else if (isTruthy(process.env.DEBUG)) {
    resolved = "debug";
  } else {
    resolved = "info";
  }
  return resolved;
}

function enabled(want: LogLevel): boolean {
  return ORDER[want] <= ORDER[level()];
}

function emit(want: LogLevel, scope: string, args: unknown[]): void {
  if (!enabled(want)) return;
  const sink = want === "error" ? console.error : want === "warn" ? console.warn : console.log;
  sink(`[${want}][${scope}]`, ...args);
}

export interface Logger {
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  trace: (...args: unknown[]) => void;
  isTrace: () => boolean;
}

export function createLogger(scope: string): Logger {
  return {
    error: (...a) => { emit("error", scope, a); },
    warn: (...a) => { emit("warn", scope, a); },
    info: (...a) => { emit("info", scope, a); },
    debug: (...a) => { emit("debug", scope, a); },
    trace: (...a) => { emit("trace", scope, a); },
    isTrace: () => enabled("trace"),
  };
}
