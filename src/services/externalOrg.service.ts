import mongoose from "mongoose";
import type { CreateExternalOrgDto } from "../dto/createExternalOrg.dto.js";
import type { MongoIdParamDto } from "../dto/mongoIdParam.dto.js";
import type { PatchExternalOrgDto } from "../dto/patchExternalOrg.dto.js";
import { failResult, okResult, type ServiceResult } from "../lib/serviceResponse.js";
import { ExternalOrgModel } from "../models/externalOrg.model.js";

type ExternalOrgOut = {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: Date | undefined;
  updatedAt: Date | undefined;
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
    const o = cur as { code?: number; errorResponse?: { code?: number } };
    if (o.code === 11000 || o.errorResponse?.code === 11000) {
      return true;
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

function toExternalOrgOut(row: {
  _id: unknown;
  name: string;
  description?: string;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}): ExternalOrgOut {
  return {
    id: String(row._id),
    name: row.name,
    description: row.description ?? "",
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listExternalOrgs(): Promise<ServiceResult<{ items: ExternalOrgOut[] }>> {
  const rows = await ExternalOrgModel.find().sort({ name: 1 }).lean().exec();
  return okResult(200, "OK", { items: rows.map((r) => toExternalOrgOut(r)) });
}

export async function createExternalOrg(
  dto: CreateExternalOrgDto,
): Promise<ServiceResult<{ item: ExternalOrgOut }>> {
  try {
    const created = await ExternalOrgModel.create({
      name: dto.name.trim(),
      description: dto.description.trim(),
      isActive: dto.isActive ?? true,
    });
    return okResult(201, "Created", { item: toExternalOrgOut(created) });
  } catch (err) {
    if (isMongoDuplicateKeyError(err)) {
      return failResult(409, "External org name already exists");
    }
    return failResult(500, "Could not create external org");
  }
}

export async function patchExternalOrg(
  externalOrgId: string | undefined,
  dto: PatchExternalOrgDto,
): Promise<ServiceResult<{ item: ExternalOrgOut }>> {
  if (!externalOrgId || !mongoose.isValidObjectId(externalOrgId)) {
    return failResult(400, "Invalid external org id");
  }

  const $set: Record<string, unknown> = {};
  if (dto.name !== undefined) $set.name = dto.name.trim();
  if (dto.description !== undefined) $set.description = dto.description.trim();
  if (dto.isActive !== undefined) $set.isActive = dto.isActive;

  if (Object.keys($set).length === 0) {
    return failResult(400, "Provide at least one field to update");
  }

  try {
    const updated = await ExternalOrgModel.findByIdAndUpdate(
      externalOrgId,
      { $set },
      { new: true, runValidators: true },
    )
      .lean()
      .exec();
    if (updated == null) return failResult(404, "External org not found");
    return okResult(200, "Updated", { item: toExternalOrgOut(updated) });
  } catch (err) {
    if (isMongoDuplicateKeyError(err)) {
      return failResult(409, "External org name already exists");
    }
    return failResult(500, "Could not update external org");
  }
}

export async function deleteExternalOrg(
  dto: MongoIdParamDto,
): Promise<ServiceResult<{ id: string }>> {
  const deleted = await ExternalOrgModel.findByIdAndDelete(dto.id).lean().exec();
  if (deleted == null) return failResult(404, "External org not found");
  return okResult(200, "Deleted", { id: dto.id });
}
