import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import {
  joinMountedPath,
  normalizeHttpMethod,
  normalizePathPatternForLookup,
} from "../lib/listHttpRoutes.js";
import { env } from "../env.js";
import { logger } from "../lib/logger.js";
import { HttpError } from "../lib/errors.js";
import { PermissionModel } from "../models/permission.model.js";
import { UserModel } from "../models/user.model.js";
import { isAllUserAuthRoute, isGuestAuthRoute } from "../lib/authPublicRoutes.js";
import { getEffectivePermissionIdsForRoleIds } from "../lib/rbac.js";

type RoutePermRow = {
  _id: mongoose.Types.ObjectId;
  source?: "auto" | "custom" | "all_user" | "all_guest" | "all";
};

async function getRoutePermissionRows(path: string, method: string): Promise<RoutePermRow[]> {
  const pattern = normalizePathPatternForLookup(path);
  const [exact, pat] = await Promise.all([
    PermissionModel.find({ path, method }).select("_id source").lean().exec() as Promise<
      RoutePermRow[]
    >,
    pattern !== path
      ? (PermissionModel.find({ path: pattern, method })
          .select("_id source")
          .lean()
          .exec() as Promise<RoutePermRow[]>)
      : Promise.resolve([]),
  ]);
  return [...exact, ...pat];
}

async function checkRolePermission(
  userPermissionIds: Set<string>,
  routePermissionRows: RoutePermRow[],
): Promise<boolean> {
  if (routePermissionRows.length === 0) {
    return false;
  }

  const permIds = [...new Set(routePermissionRows.map((r) => String(r._id)))];
  if (permIds.length === 0) {
    return false;
  }

  return permIds.some((id) => userPermissionIds.has(id));
}


/**
 * Logs who is hitting which route (`userId` from `req.auth.sub` after `requireAuth`, else `null`).
 * Call **after** `requireAuth` when you want a trace line before the handler.
 */
export async function requirePermission(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  logger.debug("requirePermission middleware Check");
  const path = joinMountedPath(req.baseUrl, req.path);
  const method = normalizeHttpMethod(req.method);
  logger.debug({ path, method, baseUrl: req.baseUrl, reqPath: req.path }, "RBAC route lookup");

  if (isGuestAuthRoute(path, method)) {
    logger.debug({ path, method }, "proceed to next: built-in guest auth route");
    next();
    return;
  }

  const rows = await getRoutePermissionRows(path, method);
  logger.debug(
    { path, method, matchedRows: rows.map((r) => ({ id: String(r._id), source: r.source })) },
    "RBAC matched permission rows",
  );
  if (rows.some((r) => r.source === "all_guest")) {
    logger.debug({ path, method }, "proceed to next: route has ALL_GUEST");
    next();
    return;
  }

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
    logger.debug(
      {
        path,
        method,
        authorizationHeaderPresent: typeof hdr === "string",
        authorizationPrefix: typeof hdr === "string" ? hdr.slice(0, 10) : null,
      },
      "RBAC auth failed: missing/invalid Bearer token",
    );
    next(new HttpError(401, "Authentication required"));
    return;
  }

  let sub = "";
  try {
    const payload = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
    if (typeof payload.sub !== "string" || !payload.sub) {
      logger.debug({ path, method, payload }, "RBAC auth failed: token has no sub");
      next(new HttpError(401, "Invalid token"));
      return;
    }
    sub = payload.sub;
    req.auth = { sub };
    if (typeof payload.email === "string") {
      req.auth.email = payload.email;
    }
  } catch {
    logger.debug({ path, method }, "RBAC auth failed: token invalid/expired");
    next(new HttpError(401, "Invalid or expired token"));
    return;
  }

  logger.debug(
    { userId: sub ?? null, route: `${method} ${path}` },
    "RBAC: user + route",
  );

  let user = null;
  if (sub && mongoose.isValidObjectId(sub)) {
    user = await UserModel.findById(sub)
      .select("isAdmin isActive isSuperAdmin roleIds")
      .lean()
      .exec();
  }

  logger.debug(user, "user");

  if (!user) {
    logger.debug("forbidden: no user");
    next(new HttpError(403, "Forbidden"));
    return;
  }

  if (user.isSuperAdmin === true) {
    const allPermissionRows = await PermissionModel.find()
      .select("_id name")
      .lean()
      .exec();
    req.auth = {
      ...req.auth,
      isAdmin: Boolean(user.isAdmin),
      isSuperAdmin: true,
      permissionIds: allPermissionRows.map((p) => String(p._id)),
      permissionKeys: allPermissionRows.map((p) => String(p.name)),
    };
    logger.debug("proceed to next: super-admin bypass");
    next();
    return;
  }

  if (user.isActive !== true) {
    logger.debug("forbidden: inactive");
    next(new HttpError(403, "Forbidden"));
    return;
  }

  if (
    isAllUserAuthRoute(path, method) ||
    rows.some((r) => r.source === "all_user" || r.source === "all")
  ) {
    const permissionIds = await getEffectivePermissionIdsForRoleIds(user.roleIds ?? []);
    const permissionRows =
      permissionIds.length > 0
        ? await PermissionModel.find({ _id: { $in: permissionIds } })
            .select("_id name")
            .lean()
            .exec()
        : [];
    req.auth = {
      ...req.auth,
      isAdmin: Boolean(user.isAdmin),
      isSuperAdmin: false,
      permissionIds: permissionRows.map((p) => String(p._id)),
      permissionKeys: permissionRows.map((p) => String(p.name)),
    };
    logger.debug("proceed to next: route has ALL_USER");
    next();
    return;
  }

  const permissionIds = await getEffectivePermissionIdsForRoleIds(user.roleIds ?? []);
  const permissionRows =
    permissionIds.length > 0
      ? await PermissionModel.find({ _id: { $in: permissionIds } })
          .select("_id name")
          .lean()
          .exec()
      : [];
  const userPermissionIds = new Set(permissionRows.map((p) => String(p._id)));
  req.auth = {
    ...req.auth,
    isAdmin: Boolean(user.isAdmin),
    isSuperAdmin: false,
    permissionIds: permissionRows.map((p) => String(p._id)),
    permissionKeys: permissionRows.map((p) => String(p.name)),
  };

  const allowed = await checkRolePermission(userPermissionIds, rows);
  if (!allowed) {
    logger.debug("forbidden Not Allowed");
    next(new HttpError(403, "Forbidden"));
    return;
  }

  logger.debug("proceed to next");

  next();
}
