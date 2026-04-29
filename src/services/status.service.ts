import mongoose from "mongoose";
import type { CreateStatusDto } from "../dto/createStatus.dto.js";
import type { MongoIdParamDto } from "../dto/mongoIdParam.dto.js";
import type { PatchStatusDto } from "../dto/patchStatus.dto.js";
import { failResult, okResult, type ServiceResult } from "../lib/serviceResponse.js";
import { STATUS_CATEGORIES, StatusModel } from "../models/status.model.js";

let statusIndexesEnsured = false;

type StatusOut = {
  id: string;
  name: string;
  description: string;
  category: string;
  color: string;
  isActive: boolean;
  createdAt: Date | undefined;
  updatedAt: Date | undefined;
};

function isMongoDuplicateKeyError(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    const msg = String((err as Error).message ?? "");
    if (msg.includes("E11000") || msg.includes("duplicate key")) return true;
  }
  let cur: unknown = err;
  for (let d = 0; d < 5 && cur != null && typeof cur === "object"; d++) {
    const o = cur as { code?: number; errorResponse?: { code?: number } };
    if (o.code === 11000 || o.errorResponse?.code === 11000) return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

function duplicateIndexName(err: unknown): string {
  const e = err as {
    message?: string;
    keyPattern?: Record<string, number>;
    errorResponse?: { keyPattern?: Record<string, number>; errmsg?: string };
  };
  const keys = Object.keys(e.keyPattern ?? e.errorResponse?.keyPattern ?? {});
  if (keys.length > 0) {
    return keys.join(",");
  }
  const msg = String(e.message ?? e.errorResponse?.errmsg ?? "");
  if (msg.includes("category_1_name_1")) return "category,name";
  if (msg.includes("category_1_code_1")) return "category,code";
  return "";
}

async function ensureStatusIndexes(): Promise<void> {
  if (statusIndexesEnsured) return;
  try {
    await StatusModel.collection.dropIndex("category_1_code_1");
  } catch {
    // ignore missing/legacy index errors
  }
  statusIndexesEnsured = true;
}

function toStatusOut(row: {
  _id: unknown;
  name: string;
  description?: string;
  category: string;
  color?: string;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}): StatusOut {
  return {
    id: String(row._id),
    name: row.name,
    description: row.description ?? "",
    category: row.category,
    color: row.color ?? "#6b7280",
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listStatuses(
  category?: string,
  includeInactive = false,
): Promise<ServiceResult<{ items: StatusOut[] }>> {
  const filter: Record<string, unknown> = {};
  if (category && category.trim()) {
    filter.category = category.trim();
  }
  if (!includeInactive) {
    filter.isActive = true;
  }
  const rows = await StatusModel.find(filter).sort({ category: 1, name: 1 }).lean().exec();
  return okResult(200, "OK", { items: rows.map((r) => toStatusOut(r)) });
}

export async function getListVendorCategory(): Promise<ServiceResult<{ items: StatusOut[] }>> {
  return listStatuses(STATUS_CATEGORIES.VENDOR_CATEGORY, false);
}

export async function listStatusCategories(): Promise<ServiceResult<{ items: string[] }>> {
  return okResult(200, "OK", { items: Object.values(STATUS_CATEGORIES) });
}

export async function createStatus(
  dto: CreateStatusDto,
): Promise<ServiceResult<{ item: StatusOut }>> {
  try {
    await ensureStatusIndexes();
    const created = await StatusModel.create({
      name: dto.name.trim(),
      description: dto.description?.trim() ?? "",
      category: dto.category.trim(),
      color: dto.color?.trim() ?? "#6b7280",
      isActive: dto.isActive ?? true,
    });
    return okResult(201, "Created", { item: toStatusOut(created) });
  } catch (err) {
    if (isMongoDuplicateKeyError(err)) {
      const idx = duplicateIndexName(err);
      if (idx.includes("category,code")) {
        return failResult(409, "Legacy status index conflict detected. Please retry this request.");
      }
      return failResult(409, "Status name already exists in this category");
    }
    return failResult(500, "Could not create status");
  }
}

export async function patchStatus(
  statusId: string | undefined,
  dto: PatchStatusDto,
): Promise<ServiceResult<{ item: StatusOut }>> {
  if (!statusId || !mongoose.isValidObjectId(statusId)) {
    return failResult(400, "Invalid status id");
  }
  const $set: Record<string, unknown> = {};
  if (dto.name !== undefined) $set.name = dto.name.trim();
  if (dto.description !== undefined) $set.description = dto.description.trim();
  if (dto.category !== undefined) $set.category = dto.category.trim();
  if (dto.color !== undefined) $set.color = dto.color.trim();
  if (dto.isActive !== undefined) $set.isActive = dto.isActive;
  if (Object.keys($set).length === 0) {
    return failResult(400, "Provide at least one field to update");
  }

  try {
    await ensureStatusIndexes();
    const updated = await StatusModel.findByIdAndUpdate(
      statusId,
      { $set },
      { new: true, runValidators: true },
    )
      .lean()
      .exec();
    if (updated == null) return failResult(404, "Status not found");
    return okResult(200, "Updated", { item: toStatusOut(updated) });
  } catch (err) {
    if (isMongoDuplicateKeyError(err)) {
      const idx = duplicateIndexName(err);
      if (idx.includes("category,code")) {
        return failResult(409, "Legacy status index conflict detected. Please retry this request.");
      }
      return failResult(409, "Status name already exists in this category");
    }
    return failResult(500, "Could not update status");
  }
}

export async function deleteStatus(dto: MongoIdParamDto): Promise<ServiceResult<{ id: string }>> {
  const deleted = await StatusModel.findByIdAndDelete(dto.id).lean().exec();
  if (deleted == null) return failResult(404, "Status not found");
  return okResult(200, "Deleted", { id: dto.id });
}
