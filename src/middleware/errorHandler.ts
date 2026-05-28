import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { HttpError, ValidationFailedError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

function sendError(
  res: Response,
  httpCode: number,
  message: string,
  data: Record<string, unknown> = {},
): void {
  res.status(httpCode).json({
    success: false,
    code: httpCode,
    message,
    data,
  });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ValidationFailedError) {
    logger.debug({ errors: err.details }, "Validation failed");
    sendError(res, 400, err.message, { errors: err.details });
    return;
  }
  if (err instanceof HttpError) {
    sendError(res, err.statusCode, err.message, err.extra ?? {});
    return;
  }
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      sendError(res, 413, "File too large (max 10 MiB)");
      return;
    }
    sendError(res, 400, err.message);
    return;
  }
  if (
    err instanceof Error &&
    (err.message === "Only image files are allowed" ||
      err.message === "Only JPG, JPEG, and PNG files are allowed" ||
      err.message === "File too large (max 10 MiB)")
  ) {
    sendError(res, 400, err.message);
    return;
  }
  logger.error({ err }, "Unhandled route error");
  sendError(res, 500, "Internal server error");
}
