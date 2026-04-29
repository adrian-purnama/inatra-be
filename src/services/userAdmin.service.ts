import mongoose from "mongoose";
import bcrypt from "bcrypt";
import type { PatchUserDto } from "../dto/patchUser.dto.js";
import { UserModel } from "../models/user.model.js";
import { RoleModel } from "../models/role.model.js";
import type { ServiceResult } from "../lib/serviceResponse.js";
import { failResult, okResult } from "../lib/serviceResponse.js";

const SALT_ROUNDS = 12;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function listUsers(
  pageRaw: number,
  limitRaw: number,
  searchRaw?: string,
): Promise<
  ServiceResult<{
    users: Array<{
      id: string;
      email: string;
      isAdmin: boolean;
      isSuperAdmin: boolean;
      isActive: boolean;
      roleIds: string[];
      createdAt?: Date;
    }>;
    total: number;
    page: number;
    limit: number;
    query: { search: string };
  }>
> {
  const page = Math.max(1, Number.isFinite(pageRaw) ? Math.floor(pageRaw) : 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 10),
  );
  const search = (searchRaw ?? "").trim();
  const skip = (page - 1) * limit;

  const filter =
    search.length > 0
      ? { email: { $regex: new RegExp(escapeRegex(search), "i") } }
      : {};

  const [total, docs] = await Promise.all([
    UserModel.countDocuments(filter).exec(),
    UserModel.find(filter)
      .select("email isAdmin isSuperAdmin isActive roleIds createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec(),
  ]);

  return okResult(200, "OK", {
    users: docs.map((u) => ({
      id: String(u._id),
      email: u.email,
      isAdmin: Boolean(u.isAdmin),
      isSuperAdmin: Boolean(u.isSuperAdmin),
      isActive: Boolean(u.isActive),
      roleIds: (u.roleIds ?? []).map(String),
      createdAt: u.createdAt,
    })),
    total,
    page,
    limit,
    query: { search },
  });
}

export async function patchUser(
  userId: string | undefined,
  dto: PatchUserDto,
): Promise<
  ServiceResult<{
    id: string;
    email: string;
    isAdmin: boolean;
    isSuperAdmin: boolean;
    isActive: boolean;
    roleIds: string[];
  }>
> {
  if (!userId || !mongoose.isValidObjectId(userId)) {
    return failResult(400, "Invalid user id");
  }
  const existing = await UserModel.findById(userId)
    .select("roleIds isSuperAdmin")
    .lean()
    .exec();
  if (existing == null) {
    return failResult(404, "User not found");
  }
  if (existing.isSuperAdmin === true) {
    return failResult(403, "Super admin users cannot be modified");
  }
  const $set: Record<string, unknown> = {};

  if (dto.isActive !== undefined) {
    $set.isActive = dto.isActive;
  }

  if (dto.isAdmin !== undefined) {
    $set.isAdmin = dto.isAdmin;
  }

  if (dto.isSuperAdmin !== undefined) {
    $set.isSuperAdmin = dto.isSuperAdmin;
  }

  if (dto.roleIds !== undefined) {
    const roleIds = dto.roleIds;
    if (roleIds.length > 0) {
      const count = await RoleModel.countDocuments({ _id: { $in: roleIds } }).exec();
      if (count !== roleIds.length) {
        return failResult(400, "One or more role ids do not exist");
      }
    }
    $set.roleIds = roleIds;
  }

  if (dto.addRoleId !== undefined || dto.removeRoleId !== undefined) {
    if (dto.roleIds !== undefined) {
      return failResult(400, "Use either roleIds or addRoleId/removeRoleId, not both");
    }

    let roleIds = (existing.roleIds ?? []).map(String);

    if (dto.addRoleId !== undefined) {
      const exists = await RoleModel.exists({ _id: dto.addRoleId }).exec();
      if (!exists) {
        return failResult(400, "addRoleId does not exist");
      }
      if (!roleIds.includes(dto.addRoleId)) {
        roleIds = [...roleIds, dto.addRoleId];
      }
    }

    if (dto.removeRoleId !== undefined) {
      roleIds = roleIds.filter((id) => id !== dto.removeRoleId);
    }

    $set.roleIds = roleIds;
  }

  if (dto.password !== undefined) {
    $set.passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
  }

  if (Object.keys($set).length === 0) {
    return failResult(
      400,
      "Provide at least one of: isActive, isAdmin, isSuperAdmin, roleIds, addRoleId, removeRoleId, password",
    );
  }

  const updated = await UserModel.findByIdAndUpdate(
    userId,
    { $set },
    { new: true, runValidators: true },
  )
    .select("email isAdmin isSuperAdmin isActive roleIds")
    .lean()
    .exec();

  if (updated == null) {
    return failResult(404, "User not found");
  }

  return okResult(200, "Updated", {
    id: String(updated._id),
    email: updated.email,
    isAdmin: Boolean(updated.isAdmin),
    isSuperAdmin: Boolean(updated.isSuperAdmin),
    isActive: Boolean(updated.isActive),
    roleIds: (updated.roleIds ?? []).map(String),
  });
}

