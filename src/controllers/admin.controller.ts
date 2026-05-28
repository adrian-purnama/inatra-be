import type { Request, Response } from "express";
import { plainToInstance } from "class-transformer";
import { failResult, sendServiceResult } from "../lib/serviceResponse.js";
import { validateOrThrow } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { CreatePermissionDto } from "../dto/createPermission.dto.js";
import { CreateRoleDto } from "../dto/createRole.dto.js";
import { MongoIdParamDto } from "../dto/mongoIdParam.dto.js";
import { PatchPermissionDto } from "../dto/patchPermission.dto.js";
import { PatchRoleDto } from "../dto/patchRole.dto.js";
import { PatchUserDto } from "../dto/patchUser.dto.js";
import { PatchAppDto } from "../dto/patchApp.dto.js";
import { CreateStatusDto } from "../dto/createStatus.dto.js";
import { PatchStatusDto } from "../dto/patchStatus.dto.js";
import * as adminApp from "../services/adminApp.service.js";
import * as rbacAdmin from "../services/rbacAdmin.service.js";
import * as userAdmin from "../services/userAdmin.service.js";
import * as statusService from "../services/status.service.js";

function paramId(req: Request, key: string): string | undefined {
  const raw = req.params[key];
  return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
}

export async function getApp(_req: Request, res: Response) {
  const result = await adminApp.fetchAppSettings();
  sendServiceResult(res, result);
}

export async function patchApp(req: Request, res: Response) {
  // This endpoint includes nested objects/arrays; use class-transformer so
  // class-validator can validate nested DTOs correctly.
  const dto = plainToInstance(PatchAppDto, req.body ?? {});
  await validateOrThrow(dto);
  const result = await adminApp.patchAppSettings(dto);
  sendServiceResult(res, result);
}

/** `POST` multipart `file` → GridFS + updates `appLogo` to public URL. */
export async function uploadAppLogo(req: Request, res: Response) {
  const f = req.file;
  if (f == null) {
    sendServiceResult(
      res,
      failResult(400, 'Missing image file (multipart field name: "file")'),
    );
    return;
  }
  const result = await adminApp.uploadAppLogoImage(f);
  sendServiceResult(res, result);
}

export async function getDiscoveredRoutes(_req: Request, res: Response) {
  const result = await rbacAdmin.listDiscoveredRoutes();
  if (result.success) {
    const routes = result.data?.routes ?? [];
    const watched = routes.filter(
      (r) =>
        r.path.includes("line-of-business") ||
        r.path.includes("market-segment") ||
        r.path.includes("external-org") ||
        r.path.includes("/data-entry/") ||
        r.path.includes("/opportunity/"),
    );
    logger.info(
      {
        totalRoutes: routes.length,
        watchedRoutes: watched.map((r) => `${r.method} ${r.path}`),
      },
      "RBAC discovered routes snapshot",
    );
  } else {
    logger.warn(
      { code: result.code, message: result.message },
      "RBAC discovered routes request failed",
    );
  }
  sendServiceResult(res, result);
}

export async function getRbacProblems(_req: Request, res: Response) {
  const result = await rbacAdmin.listRbacProblems();
  sendServiceResult(res, result);
}

export async function deleteAllOrphanPermissions(_req: Request, res: Response) {
  const result = await rbacAdmin.deleteAllOrphanPermissions();
  sendServiceResult(res, result);
}

export async function listPermissions(_req: Request, res: Response) {
  const result = await rbacAdmin.fetchAllPermissions();
  sendServiceResult(res, result);
}

export async function getPermission(req: Request, res: Response) {
  const result = await rbacAdmin.fetchPermissionById(paramId(req, "id"));
  sendServiceResult(res, result);
}

export async function createPermission(req: Request, res: Response) {
  const dto = Object.assign(new CreatePermissionDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await rbacAdmin.createPermissionRecord(dto);
  sendServiceResult(res, result);
}

export async function patchPermission(req: Request, res: Response) {
  const dto = Object.assign(new PatchPermissionDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await rbacAdmin.updatePermissionRecord(
    paramId(req, "id"),
    dto,
  );
  sendServiceResult(res, result);
}

export async function deletePermission(req: Request, res: Response) {
  const dto = Object.assign(new MongoIdParamDto(), { id: paramId(req, "id") ?? "" });
  await validateOrThrow(dto);
  const result = await rbacAdmin.deletePermissionRecord(dto);
  sendServiceResult(res, result);
}

export async function listRoles(req: Request, res: Response) {
  const page = Math.max(
    1,
    parseInt(String(req.query["page"] ?? "1"), 10) || 1,
  );
  const limit = Math.min(
    100,
    Math.max(1, parseInt(String(req.query["limit"] ?? "10"), 10) || 10),
  );
  const result = await rbacAdmin.fetchRolesWithPermissions(page, limit);
  sendServiceResult(res, result);
}

export async function getRole(req: Request, res: Response) {
  const result = await rbacAdmin.fetchRoleById(paramId(req, "id"));
  sendServiceResult(res, result);
}

export async function createRole(req: Request, res: Response) {
  const dto = Object.assign(new CreateRoleDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await rbacAdmin.createRoleRecord(dto);
  sendServiceResult(res, result);
}

export async function patchRole(req: Request, res: Response) {
  const idDto = Object.assign(new MongoIdParamDto(), { id: paramId(req, "id") ?? "" });
  await validateOrThrow(idDto);
  const dto = Object.assign(new PatchRoleDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await rbacAdmin.updateRoleRecord(idDto, dto);
  sendServiceResult(res, result);
}

export async function deleteRole(req: Request, res: Response) {
  const dto = Object.assign(new MongoIdParamDto(), { id: paramId(req, "id") ?? "" });
  await validateOrThrow(dto);
  const result = await rbacAdmin.deleteRoleRecord(dto);
  sendServiceResult(res, result);
}

export async function listUsers(req: Request, res: Response) {
  const page = Math.max(
    1,
    parseInt(String(req.query["page"] ?? "1"), 10) || 1,
  );
  const limit = Math.min(
    100,
    Math.max(1, parseInt(String(req.query["limit"] ?? "10"), 10) || 10),
  );
  const searchRaw = req.query["search"];
  const search =
    typeof searchRaw === "string"
      ? searchRaw
      : Array.isArray(searchRaw) && typeof searchRaw[0] === "string"
        ? searchRaw[0]
        : "";
  const result = await userAdmin.listUsers(page, limit, search);
  sendServiceResult(res, result);
}

export async function patchUser(req: Request, res: Response) {
  const dto = Object.assign(new PatchUserDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await userAdmin.patchUser(paramId(req, "id"), dto);
  sendServiceResult(res, result);
}

export async function listStatuses(req: Request, res: Response) {
  const qCategory = req.query["category"];
  const qIncludeInactive = req.query["includeInactive"];
  const category =
    typeof qCategory === "string"
      ? qCategory
      : Array.isArray(qCategory) && typeof qCategory[0] === "string"
        ? qCategory[0]
        : undefined;
  const includeInactive =
    qIncludeInactive === "1" ||
    qIncludeInactive === "true" ||
    (Array.isArray(qIncludeInactive) &&
      (qIncludeInactive.includes("1") || qIncludeInactive.includes("true")));
  const result = await statusService.listStatuses(category, includeInactive);
  sendServiceResult(res, result);
}

export async function createStatus(req: Request, res: Response) {
  const dto = Object.assign(new CreateStatusDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await statusService.createStatus(dto);
  sendServiceResult(res, result);
}

export async function patchStatus(req: Request, res: Response) {
  const dto = Object.assign(new PatchStatusDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await statusService.patchStatus(paramId(req, "id"), dto);
  sendServiceResult(res, result);
}

export async function deleteStatus(req: Request, res: Response) {
  const dto = Object.assign(new MongoIdParamDto(), { id: paramId(req, "id") ?? "" });
  await validateOrThrow(dto);
  const result = await statusService.deleteStatus(dto);
  sendServiceResult(res, result);
}
