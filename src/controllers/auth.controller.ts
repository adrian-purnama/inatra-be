import type { Request, Response } from "express";
import { failResult } from "../lib/serviceResponse.js";
import { LoginDto } from "../dto/login.dto.js";
import { RegisterDto } from "../dto/register.dto.js";
import { SendOtpDto } from "../dto/sendOtp.dto.js";
import { sendServiceResult } from "../lib/serviceResponse.js";
import { validateOrThrow } from "../lib/errors.js";
import * as authService from "../services/auth.service.js";
import { logger } from "../lib/logger.js";

export async function sendOtp(req: Request, res: Response) {
  const dto = Object.assign(new SendOtpDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await authService.sendOtp(dto);
  sendServiceResult(res, result);
}

export async function register(req: Request, res: Response) {
  const dto = Object.assign(new RegisterDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await authService.register(dto);
  sendServiceResult(res, result);
}

export async function login(req: Request, res: Response) {
  const dto = Object.assign(new LoginDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await authService.login(dto);
  sendServiceResult(res, result);
}

/** `GET /auth/me` — validate Bearer token and return current user (DB-backed). */
export async function me(req: Request, res: Response) {
  const sub = req.auth?.sub;
  if (!sub) {
    sendServiceResult(res, failResult(401, "Not authenticated"));
    return;
  }
  const result = await authService.getMe(sub);
  sendServiceResult(res, result);
}

