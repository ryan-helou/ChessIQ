/**
 * Tiny structured logger. Emits JSON in production (Railway ingests it
 * natively), pretty key=value lines in dev. Keeps the dep footprint at zero —
 * if we outgrow this, swap for pino and keep the API identical.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const envLevel = (process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug")) as Level;
const MIN_LEVEL = LEVEL_ORDER[envLevel] ?? LEVEL_ORDER.info;

const IS_PROD = process.env.NODE_ENV === "production";

export interface LogFields {
  [key: string]: unknown;
  err?: unknown;
}

function serializeErr(err: unknown): Record<string, unknown> | undefined {
  if (!err) return undefined;
  if (err instanceof Error) {
    return { message: err.message, name: err.name, stack: err.stack };
  }
  return { message: String(err) };
}

function emit(level: Level, msg: string, fields?: LogFields) {
  if (LEVEL_ORDER[level] < MIN_LEVEL) return;

  const { err, ...rest } = fields ?? {};
  const record: Record<string, unknown> = {
    level,
    time: new Date().toISOString(),
    msg,
    ...rest,
  };
  const errSer = serializeErr(err);
  if (errSer) record.err = errSer;

  const out = IS_PROD
    ? JSON.stringify(record)
    : `[${level}] ${msg}${Object.keys(rest).length ? " " + JSON.stringify(rest) : ""}${errSer ? " err=" + errSer.message : ""}`;

  const sink = level === "error" || level === "warn" ? console.error : console.log;
  sink(out);
}

export const logger = {
  debug: (msg: string, fields?: LogFields) => emit("debug", msg, fields),
  info:  (msg: string, fields?: LogFields) => emit("info", msg, fields),
  warn:  (msg: string, fields?: LogFields) => emit("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => emit("error", msg, fields),
  /** Bind static fields (e.g. route, requestId) to a child logger. */
  child(bound: LogFields) {
    return {
      debug: (msg: string, fields?: LogFields) => emit("debug", msg, { ...bound, ...fields }),
      info:  (msg: string, fields?: LogFields) => emit("info", msg, { ...bound, ...fields }),
      warn:  (msg: string, fields?: LogFields) => emit("warn", msg, { ...bound, ...fields }),
      error: (msg: string, fields?: LogFields) => emit("error", msg, { ...bound, ...fields }),
    };
  },
};
