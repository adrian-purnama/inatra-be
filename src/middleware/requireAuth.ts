import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../env.js";
import { HttpError } from "../lib/errors.js";

/**
 * Requires `Authorization: Bearer <JWT>`. Attaches `req.auth` with `sub` and optional `email`.
 */
export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!env.jwtSecret) {
    next(new HttpError(503, "Authentication not configured"));
    return;
  }

  const hdr = req.headers.authorization;
  const token =
    typeof hdr === "string" && hdr.startsWith("Bearer ")
      ? hdr.slice(7).trim()
      : null;

  if (!token) {
    next(new HttpError(401, "Authentication required"));
    return;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
    const sub = payload.sub;
    if (typeof sub !== "string" || !sub) {
      next(new HttpError(401, "Invalid token"));
      return;
    }
    req.auth = { sub };
    if (typeof payload.email === "string") {
      req.auth.email = payload.email;
    }
    next();
  } catch {
    next(new HttpError(401, "Invalid or expired token"));
  }
}
