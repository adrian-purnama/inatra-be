import mongoose from "mongoose";
import { PermissionModel } from "../models/permission.model.js";
import { RoleModel } from "../models/role.model.js";
import { UserModel } from "../models/user.model.js";

type UserRbacLean = {
  isSuperAdmin?: boolean;
  roleIds?: mongoose.Types.ObjectId[];
} | null;

async function loadUserForRbac(userId: string): Promise<UserRbacLean> {
  return UserModel.findById(userId).select("isSuperAdmin roleIds").lean().exec();
}

export async function getEffectivePermissionIdsForRoleIds(
  roleIds: Array<mongoose.Types.ObjectId | string>,
): Promise<string[]> {
  if (roleIds.length === 0) {
    return [];
  }

  const visitedRoleIds = new Set<string>();
  const pendingRoleIds = [...new Set(roleIds.map((id) => String(id)).filter(Boolean))];
  const permissionIdSet = new Set<string>();

  while (pendingRoleIds.length > 0) {
    const batch = pendingRoleIds.splice(0, 200);
    const roles = await RoleModel.find({ _id: { $in: batch } })
      .select("permissionIds roleIds")
      .lean()
      .exec();

    for (const role of roles) {
      const currentRoleId = String(role._id);
      if (visitedRoleIds.has(currentRoleId)) {
        continue;
      }
      visitedRoleIds.add(currentRoleId);

      for (const pid of role.permissionIds ?? []) {
        const id = String(pid);
        if (id) {
          permissionIdSet.add(id);
        }
      }

      for (const nestedRoleId of role.roleIds ?? []) {
        const childId = String(nestedRoleId);
        if (childId && !visitedRoleIds.has(childId)) {
          pendingRoleIds.push(childId);
        }
      }
    }
  }

  return [...permissionIdSet];
}

/** All permission **names** the user may use (roles + super-admin = every name in DB). */
export async function getEffectivePermissionKeys(userId: string): Promise<string[]> {
  if (!mongoose.isValidObjectId(userId)) {
    return [];
  }

  const user = await loadUserForRbac(userId);
  if (user == null) {
    return [];
  }

  if (user.isSuperAdmin === true) {
    const all = await PermissionModel.find().select("name").lean().exec();
    return [...new Set(all.map((p) => p.name))];
  }

  const permissionIds = await getEffectivePermissionIdsForRoleIds(user.roleIds ?? []);
  if (permissionIds.length === 0) {
    return [];
  }

  const perms = await PermissionModel.find({ _id: { $in: permissionIds } })
    .select("name")
    .lean()
    .exec();

  return [...new Set(perms.map((p) => p.name))];
}

/** True if the user has at least one of the permission names (OR for a route). */
export async function userHasAnyPermission(
  userId: string,
  candidateKeys: string[],
): Promise<boolean> {
  if (candidateKeys.length === 0) {
    return false;
  }
  const keys = new Set(await getEffectivePermissionKeys(userId));
  return candidateKeys.some((k) => keys.has(k));
}
