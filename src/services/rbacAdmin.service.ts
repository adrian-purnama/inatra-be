import mongoose from "mongoose";
import { logger } from "../lib/logger.js";
import {
  autoPermissionDescription,
  flattenDiscoveredRoutes,
  normalizeHttpMethod,
  normalizeHttpPath,
  routeKey,
  suggestPermissionName,
} from "../lib/listHttpRoutes.js";
import type { ServiceResult } from "../lib/serviceResponse.js";
import { failResult, okResult } from "../lib/serviceResponse.js";
import type { CreatePermissionDto } from "../dto/createPermission.dto.js";
import type { CreateRoleDto } from "../dto/createRole.dto.js";
import type { MongoIdParamDto } from "../dto/mongoIdParam.dto.js";
import type { PatchPermissionDto } from "../dto/patchPermission.dto.js";
import type { PatchRoleDto } from "../dto/patchRole.dto.js";
import type { PermissionSource } from "../models/permission.model.js";
import { PermissionModel } from "../models/permission.model.js";
import { RoleModel } from "../models/role.model.js";
import { UserModel } from "../models/user.model.js";

const PERMISSION_SOURCES: readonly PermissionSource[] = [
  "auto",
  "custom",
  "all_user",
  "all_guest",
];

type PermissionOut = {
  id: string;
  name: string;
  path: string;
  method: string;
  description: string;
  source: PermissionSource;
};

function isMongoDuplicateKeyError(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    const msg = String((err as Error).message ?? "");
    if (msg.includes("E11000") || msg.includes("duplicate key")) {
      return true;
    }
  }
  let cur: unknown = err;
  for (let d = 0; d < 5 && cur != null && typeof cur === "object"; d++) {
    const o = cur as {
      code?: number;
      errorResponse?: { code?: number };
    };
    if (o.code === 11000 || o.errorResponse?.code === 11000) {
      return true;
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

function toPermissionOut(p: {
  _id: unknown;
  name: string;
  path: string;
  method: string;
  description?: string;
  source?: string;
}): PermissionOut {
  return {
    id: String(p._id),
    name: p.name,
    path: p.path,
    method: p.method,
    description: p.description ?? "",
    source: (p.source ?? "custom") as PermissionSource,
  };
}

export async function listDiscoveredRoutes(): Promise<
  ServiceResult<{
    routes: Array<{ path: string; method: string; suggestedName: string }>;
  }>
> {
  const routes = flattenDiscoveredRoutes().map(({ path, method }) => ({
    path,
    method,
    suggestedName: suggestPermissionName(path, method),
  }));
  return okResult(200, "OK", { routes });
}

export async function listRbacProblems(): Promise<
  ServiceResult<{
    routesWithoutPermission: Array<{
      path: string;
      method: string;
      suggestedName: string;
    }>;
    permissionsNotInApp: PermissionOut[];
  }>
> {
  const flat = flattenDiscoveredRoutes();
  const discoveredKeys = new Set(flat.map((x) => routeKey(x.path, x.method)));
  const permissions = await PermissionModel.find()
    .sort({ path: 1, method: 1, name: 1 })
    .lean()
    .exec();

  const permsByRouteKey = new Map<string, typeof permissions>();
  for (const p of permissions) {
    const k = routeKey(p.path, p.method);
    const list = permsByRouteKey.get(k);
    if (list) {
      list.push(p);
    } else {
      permsByRouteKey.set(k, [p]);
    }
  }

  const routesWithoutPermission = flat
    .filter(({ path, method }) => (permsByRouteKey.get(routeKey(path, method)) ?? []).length === 0)
    .map(({ path, method }) => ({
      path,
      method,
      suggestedName: suggestPermissionName(path, method),
    }));

  const permissionsNotInApp: PermissionOut[] = permissions
    .filter((p) => !discoveredKeys.has(routeKey(p.path, p.method)))
    .map((p) => toPermissionOut(p));

  return okResult(200, "OK", {
    routesWithoutPermission,
    permissionsNotInApp,
  });
}

export async function fetchAllPermissions(): Promise<
  ServiceResult<{ permissions: PermissionOut[] }>
> {
  const permissions = await PermissionModel.find().sort({ name: 1 }).lean().exec();
  return okResult(200, "OK", {
    permissions: permissions.map((p) => toPermissionOut(p)),
  });
}

export async function fetchPermissionById(
  permissionId: string | undefined,
): Promise<ServiceResult<{ permission: PermissionOut }>> {
  if (!permissionId || !mongoose.isValidObjectId(permissionId)) {
    return failResult(400, "Invalid permission id");
  }
  const p = await PermissionModel.findById(permissionId).lean().exec();
  if (p == null) {
    return failResult(404, "Permission not found");
  }
  return okResult(200, "OK", { permission: toPermissionOut(p) });
}

export async function createPermissionRecord(
  dto: CreatePermissionDto,
): Promise<ServiceResult<PermissionOut>> {
  const path = normalizeHttpPath(dto.path);
  const method = normalizeHttpMethod(dto.method);
  const mode = dto.mode;

  let name = dto.name?.trim() ?? "";
  let description = dto.description?.trim() ?? "";
  let source: PermissionSource = "custom";

  switch (mode) {
    case "auto": {
      source = "auto";
      name = suggestPermissionName(path, method);
      description = autoPermissionDescription(path, method);
      let candidate = name;
      let n = 0;
      while (await PermissionModel.exists({ path, method, name: candidate }).exec()) {
        n += 1;
        candidate = `${name}_${n}`;
        if (n > 50) {
          return failResult(409, "Could not allocate a unique auto permission name for this route");
        }
      }
      name = candidate;
      break;
    }
    case "custom": {
      source = "custom";
      if (!name) {
        return failResult(400, "name is required for mode custom");
      }
      break;
    }
    case "all_user": {
      source = "all_user";
      name = "ALL_USER";
      description = "Open to all authenticated users";
      break;
    }
    case "all_guest": {
      source = "all_guest";
      name = "ALL_GUEST";
      description = "Open to everyone (guest and logged-in users)";
      break;
    }
  }

  if (await PermissionModel.exists({ path, method, name }).exec()) {
    return failResult(409, "Permission name already exists for this route");
  }

  try {
    const created = await PermissionModel.create({
      name,
      description,
      path,
      method,
      source,
    });
    return okResult(201, "Created", toPermissionOut(created));
  } catch (err: unknown) {
    if (isMongoDuplicateKeyError(err)) {
      return failResult(409, "Permission already exists for this route");
    }
    if (err instanceof mongoose.Error.ValidationError) {
      return failResult(400, err.message);
    }
    logger.error({ err }, "createPermissionRecord failed");
    return failResult(500, "Could not create permission");
  }
}

export async function updatePermissionRecord(
  permissionId: string | undefined,
  dto: PatchPermissionDto,
): Promise<ServiceResult<PermissionOut>> {
  if (!permissionId || !mongoose.isValidObjectId(permissionId)) {
    return failResult(400, "Invalid permission id");
  }
  const existing = await PermissionModel.findById(permissionId).lean().exec();
  if (existing == null) {
    return failResult(404, "Permission not found");
  }

  const $set: Record<string, unknown> = {};

  if (dto.name !== undefined) {
    const trimmed = dto.name.trim();
    const dup = await PermissionModel.exists({
      name: trimmed,
      path: existing.path,
      method: existing.method,
      _id: { $ne: permissionId },
    }).exec();
    if (dup) {
      return failResult(409, "Another permission on this route already uses this name");
    }
    $set.name = trimmed;
  }

  if (dto.description !== undefined) {
    $set.description = dto.description.trim();
  }

  if (dto.source !== undefined) {
    const s = dto.source;
    if (!PERMISSION_SOURCES.includes(s as PermissionSource)) {
      return failResult(
        400,
        `source must be one of: ${PERMISSION_SOURCES.map((x) => `"${x}"`).join(", ")}`,
      );
    }
    $set.source = s;
  }

  if (Object.keys($set).length === 0) {
    return failResult(400, "Provide at least one of: name, description, source");
  }

  try {
    const updated = await PermissionModel.findByIdAndUpdate(
      permissionId,
      { $set },
      { new: true, runValidators: true },
    )
      .lean()
      .exec();

    if (updated == null) {
      return failResult(404, "Permission not found");
    }

    return okResult(200, "OK", toPermissionOut(updated));
  } catch (err: unknown) {
    if (isMongoDuplicateKeyError(err)) {
      return failResult(409, "Permission name already exists for this route");
    }
    if (err instanceof mongoose.Error.ValidationError) {
      return failResult(400, err.message);
    }
    logger.error({ err }, "updatePermissionRecord failed");
    return failResult(500, "Could not update permission");
  }
}

export async function deletePermissionRecord(
  dto: MongoIdParamDto,
): Promise<ServiceResult<{ deleted: true }>> {
  const idStr = dto.id;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const deleted = await PermissionModel.findByIdAndDelete(dto.id, { session })
        .lean()
        .exec();
      if (deleted == null) {
        throw { code: "NOT_FOUND" };
      }

      await RoleModel.updateMany(
        { permissionIds: idStr },
        { $pull: { permissionIds: idStr } },
        { session },
      ).exec();
    });

    return okResult(200, "Deleted", { deleted: true });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      (err as { code?: string }).code === "NOT_FOUND"
    ) {
      return failResult(404, "Permission not found");
    }
    logger.error({ err }, "deletePermissionRecord failed");
    return failResult(500, "Could not delete permission");
  } finally {
    await session.endSession();
  }
}

export async function deleteAllOrphanPermissions(): Promise<
  ServiceResult<{ deletedCount: number }>
> {
  const flat = flattenDiscoveredRoutes();
  const discoveredKeys = new Set(flat.map((x) => routeKey(x.path, x.method)));
  const orphanPermissions = await PermissionModel.find()
    .select("_id path method")
    .lean()
    .exec();
  const orphanIds = orphanPermissions
    .filter((p) => !discoveredKeys.has(routeKey(p.path, p.method)))
    .map((p) => String(p._id));

  if (orphanIds.length === 0) {
    return okResult(200, "No orphan permissions to delete", { deletedCount: 0 });
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await PermissionModel.deleteMany({ _id: { $in: orphanIds } }, { session }).exec();
      await RoleModel.updateMany(
        { permissionIds: { $in: orphanIds } },
        { $pull: { permissionIds: { $in: orphanIds } } },
        { session },
      ).exec();
    });

    return okResult(200, "Deleted orphan permissions", {
      deletedCount: orphanIds.length,
    });
  } catch (err: unknown) {
    logger.error({ err }, "deleteAllOrphanPermissions failed");
    return failResult(500, "Could not delete orphan permissions");
  } finally {
    await session.endSession();
  }
}

export async function createRoleRecord(
  dto: CreateRoleDto,
): Promise<
  ServiceResult<{
    id: string;
    name: string;
    description: string;
    permissionIds: string[];
    roleIds: string[];
    applyOnRegisterUser: boolean;
  }>
> {
  const name = dto.name.trim();
  const description = dto.description?.trim() ?? "";
  const applyOnRegisterUser = dto.applyOnRegisterUser ?? false;
  const permissionIds = dto.permissionIds ?? [];
  const roleIds = dto.roleIds ?? [];

  if (permissionIds.length > 0) {
    const count = await PermissionModel.countDocuments({
      _id: { $in: permissionIds },
    }).exec();
    if (count !== permissionIds.length) {
      return failResult(400, "One or more permission ids do not exist");
    }
  }
  if (roleIds.length > 0) {
    const count = await RoleModel.countDocuments({
      _id: { $in: roleIds },
    }).exec();
    if (count !== roleIds.length) {
      return failResult(400, "One or more role ids do not exist");
    }
  }

  const dup = await RoleModel.exists({ name }).exec();
  if (dup) {
    return failResult(409, "Role name already exists");
  }

  try {
    const created = await RoleModel.create({
      name,
      description,
      permissionIds,
      roleIds,
      applyOnRegisterUser,
    });
    return okResult(201, "Created", {
      id: String(created._id),
      name: created.name,
      description: created.description ?? "",
      permissionIds: (created.permissionIds ?? []).map(String),
      roleIds: (created.roleIds ?? []).map(String),
      applyOnRegisterUser: Boolean(created.applyOnRegisterUser),
    });
  } catch (err: unknown) {
    if (isMongoDuplicateKeyError(err)) {
      return failResult(409, "Role already exists (duplicate name)");
    }
    if (err instanceof mongoose.Error.ValidationError) {
      return failResult(400, err.message);
    }
    logger.error({ err }, "createRoleRecord failed");
    return failResult(500, "Could not create role");
  }
}

type RoleDocLean = {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  permissionIds?: string[];
  roleIds?: string[];
  applyOnRegisterUser?: boolean;
};

async function hydrateRolesWithPermissions(
  roleDocs: RoleDocLean[],
): Promise<
  Array<{
    id: string;
    name: string;
    description: string;
    applyOnRegisterUser: boolean;
    permissionIds: string[];
    roleIds: string[];
    permissions: Array<{
      id: string;
      name: string;
      path: string;
      method: string;
      source: PermissionSource;
    }>;
  }>
> {
  const permIds = new Set<string>();
  for (const r of roleDocs) {
    for (const id of r.permissionIds ?? []) {
      if (id) permIds.add(String(id));
    }
  }
  const perms =
    permIds.size > 0
      ? await PermissionModel.find({ _id: { $in: [...permIds] } })
          .select("name path method source")
          .lean()
          .exec()
      : [];
  const permById = new Map(perms.map((p) => [String(p._id), p]));

  return roleDocs.map((r) => ({
    id: String(r._id),
    name: r.name,
    description: r.description ?? "",
    applyOnRegisterUser: Boolean(r.applyOnRegisterUser),
    permissionIds: (r.permissionIds ?? []).map(String),
    roleIds: (r.roleIds ?? []).map(String),
    permissions: (r.permissionIds ?? []).map((pid: string) => {
      const p = permById.get(String(pid));
      return p
        ? {
            id: String(p._id),
            name: p.name,
            path: p.path,
            method: p.method,
            source: (p.source ?? "custom") as PermissionSource,
          }
        : {
            id: String(pid),
            name: "?",
            path: "",
            method: "",
            source: "custom" as PermissionSource,
          };
    }),
  }));
}

export async function fetchRolesWithPermissions(
  pageRaw: number,
  limitRaw: number,
): Promise<
  ServiceResult<{
    roles: Awaited<ReturnType<typeof hydrateRolesWithPermissions>>;
    total: number;
    page: number;
    limit: number;
  }>
> {
  const page = Math.max(1, Number.isFinite(pageRaw) ? Math.floor(pageRaw) : 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 10),
  );
  const skip = (page - 1) * limit;

  const total = await RoleModel.countDocuments().exec();
  const roleDocs = (await RoleModel.find()
    .sort({ name: 1 })
    .skip(skip)
    .limit(limit)
    .lean()
    .exec()) as RoleDocLean[];

  const roles = await hydrateRolesWithPermissions(roleDocs);

  return okResult(200, "OK", {
    roles,
    total,
    page,
    limit,
  });
}

export async function fetchRoleById(roleId: string | undefined): Promise<
  ServiceResult<{
    role: {
      id: string;
      name: string;
      description: string;
      applyOnRegisterUser: boolean;
      permissionIds: string[];
      roleIds: string[];
      permissions: Array<{
        id: string;
        name: string;
        path: string;
        method: string;
        source: PermissionSource;
      }>;
    };
  }>
> {
  if (!roleId || !mongoose.isValidObjectId(roleId)) {
    return failResult(400, "Invalid role id");
  }
  const doc = (await RoleModel.findById(roleId).lean().exec()) as RoleDocLean | null;
  if (doc == null) {
    return failResult(404, "Role not found");
  }
  const hydrated = await hydrateRolesWithPermissions([doc]);
  const role = hydrated[0];
  if (role == null) {
    return failResult(404, "Role not found");
  }
  return okResult(200, "OK", { role });
}

export async function updateRoleRecord(
  idDto: MongoIdParamDto,
  dto: PatchRoleDto,
): Promise<
  ServiceResult<{
    id: string;
    name: string;
    description: string;
    permissionIds: string[];
    roleIds: string[];
    applyOnRegisterUser: boolean;
  }>
> {
  const roleId = idDto.id;
  const $set: Record<string, unknown> = {};

  if (dto.name !== undefined) {
    $set.name = dto.name.trim();
  }
  if (dto.description !== undefined) {
    $set.description = dto.description.trim();
  }

  if (dto.permissionIds !== undefined) {
    const permissionIds = dto.permissionIds;
    const count = await PermissionModel.countDocuments({
      _id: { $in: permissionIds },
    }).exec();
    if (count !== permissionIds.length) {
      return failResult(400, "One or more permission ids do not exist");
    }
    $set.permissionIds = permissionIds;
  }
  if (dto.roleIds !== undefined) {
    const roleIds = dto.roleIds;
    if (roleIds.includes(roleId)) {
      return failResult(400, "A role cannot include itself in roleIds");
    }
    const count = await RoleModel.countDocuments({
      _id: { $in: roleIds },
    }).exec();
    if (count !== roleIds.length) {
      return failResult(400, "One or more role ids do not exist");
    }
    $set.roleIds = roleIds;
  }

  if (dto.applyOnRegisterUser !== undefined) {
    $set.applyOnRegisterUser = dto.applyOnRegisterUser;
  }

  if (Object.keys($set).length === 0) {
    return failResult(
      400,
      "Provide at least one of: name, description, permissionIds, roleIds, applyOnRegisterUser",
    );
  }

  try {
    const updated = await RoleModel.findByIdAndUpdate(
      roleId,
      { $set },
      { new: true, runValidators: true },
    )
      .lean()
      .exec();

    if (updated == null) {
      return failResult(404, "Role not found");
    }

    return okResult(200, "OK", {
      id: String(updated._id),
      name: updated.name,
      description: updated.description ?? "",
      permissionIds: (updated.permissionIds ?? []).map(String),
      roleIds: (updated.roleIds ?? []).map(String),
      applyOnRegisterUser: Boolean(updated.applyOnRegisterUser),
    });
  } catch (err: unknown) {
    if (isMongoDuplicateKeyError(err)) {
      return failResult(409, "Another role already uses this name");
    }
    if (err instanceof mongoose.Error.ValidationError) {
      return failResult(400, err.message);
    }
    logger.error({ err }, "updateRoleRecord failed");
    return failResult(500, "Could not update role");
  }
}

export async function deleteRoleRecord(
  dto: MongoIdParamDto,
): Promise<ServiceResult<{ deleted: true }>> {
  const roleId = dto.id;
  const oid = new mongoose.Types.ObjectId(roleId);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const deleted = await RoleModel.findByIdAndDelete(roleId, { session })
        .lean()
        .exec();
      if (deleted == null) {
        throw { code: "NOT_FOUND" };
      }

      await UserModel.updateMany(
        { roleIds: oid },
        { $pull: { roleIds: oid } },
        { session },
      ).exec();
      await RoleModel.updateMany(
        { roleIds: roleId },
        { $pull: { roleIds: roleId } },
        { session },
      ).exec();
    });

    return okResult(200, "Deleted", { deleted: true });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      (err as { code?: string }).code === "NOT_FOUND"
    ) {
      return failResult(404, "Role not found");
    }
    logger.error({ err }, "deleteRoleRecord failed");
    return failResult(500, "Could not delete role");
  } finally {
    await session.endSession();
  }
}
