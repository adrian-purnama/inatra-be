import type { IncomingMessage } from "node:http";
import pino from "pino";
import type { SerializedRequest, SerializedResponse } from "pino-std-serializers";

const isProd = process.env.NODE_ENV === "production";
const level = process.env.LOG_LEVEL ?? (isProd ? "info" : "debug");

/**
 * App-wide logger. Uses JSON → stdout in production (Docker-friendly);
 * pretty-print in development via pino-pretty.
 */
export const logger = isProd
  ? pino({ level })
  : pino({
      level,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:HH:MM:ss",
          ignore: "pid,hostname",
          singleLine: true,
          /** Merge with defaults so other levels keep stock colors; `debug` → bright blue (colorette). */
          useOnlyCustomProps: false,
          customColors: "debug:magenta",
        },
      },
    });

function requestPathForLog(req: IncomingMessage): string {
  const withOriginal = req as IncomingMessage & { originalUrl?: string };
  const raw = withOriginal.originalUrl ?? req.url ?? "";
  const pathOnly = raw.split("?")[0] ?? raw;
  return pathOnly || "/";
}

/**
 * Options for `pino-http`: drop verbose std fields (headers, full response header blob, etc.).
 */
export const slimPinoHttpOpts = {
  serializers: {
    req(o: SerializedRequest) {
      return {
        id: o.id,
        method: o.method,
        url: requestPathForLog(o.raw),
      };
    },
    res(o: SerializedResponse) {
      return { statusCode: o.statusCode };
    },
    err: pino.stdSerializers.err,
  },
  customSuccessMessage(req: IncomingMessage, res: { statusCode: number }, responseTime: number) {
    return `${req.method} ${requestPathForLog(req)} ${res.statusCode} ${responseTime}ms`;
  },
  customErrorMessage(req: IncomingMessage, res: { statusCode: number }, err: Error) {
    return `${req.method} ${requestPathForLog(req)} ${res.statusCode} — ${err.message}`;
  },
};
