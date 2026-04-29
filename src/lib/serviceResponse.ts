import type { Response } from "express";

/**
 * Standard service → HTTP JSON: use with `sendServiceResult`.
 * Failures always use `data: Record<string, unknown>` so typed success payloads
 * stay accurate on the success branch.
 */
export type ServiceResult<T extends object = Record<string, unknown>> =
  | { success: true; code: number; message: string; data: T }
  | { success: false; code: number; message: string; data: Record<string, unknown> };

export function okResult<T extends object>(
  httpCode: number,
  message: string,
  data: T,
): ServiceResult<T> {
  return { success: true, code: httpCode, message, data };
}

export function failResult(
  httpCode: number,
  message: string,
  data: Record<string, unknown> = {},
): ServiceResult<never> {
  return { success: false, code: httpCode, message, data };
}

export function sendServiceResult(res: Response, result: ServiceResult): void {
  res.status(result.code).json(result);
}
