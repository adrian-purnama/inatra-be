import type { Response } from "express";

export type ApiSuccessBody<T> = { success: true; data: T };

export function okData<T>(data: T): ApiSuccessBody<T> {
  return { success: true, data };
}

export function sendSuccess<T>(res: Response, status: number, data: T): void {
  res.status(status).json(okData(data));
}
