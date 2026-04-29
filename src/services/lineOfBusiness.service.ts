import mongoose from "mongoose";
import type { CreateLineOfBusinessDto } from "../dto/createLineOfBusiness.dto.js";
import type { MongoIdParamDto } from "../dto/mongoIdParam.dto.js";
import type { PatchLineOfBusinessDto } from "../dto/patchLineOfBusiness.dto.js";
import { failResult, okResult, type ServiceResult } from "../lib/serviceResponse.js";
import { LineOfBusinessModel } from "../models/lineOfBusiness.model.js";

type LineOfBusinessOut = {
  id: string;
  code: string;
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

function toLineOfBusinessOut(row: {
  _id: unknown;
  code: string;
  name: string;
  description: string;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}): LineOfBusinessOut {
  return {
    id: String(row._id),
    code: row.code,
    name: row.name,
    description: row.description,
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listLineOfBusiness(): Promise<
  ServiceResult<{ items: LineOfBusinessOut[] }>
> {
  const rows = await LineOfBusinessModel.find()
    .sort({ code: 1, name: 1 })
    .lean()
    .exec();
  return okResult(200, "OK", { items: rows.map((r) => toLineOfBusinessOut(r)) });
}

export async function createLineOfBusiness(
  dto: CreateLineOfBusinessDto,
): Promise<ServiceResult<{ item: LineOfBusinessOut }>> {
  const code = dto.code.trim();
  const name = dto.name.trim();
  const description = dto.description.trim();
  const isActive = dto.isActive ?? true;

  try {
    const created = await LineOfBusinessModel.create({
      code,
      name,
      description,
      isActive,
    });
    return okResult(201, "Created", { item: toLineOfBusinessOut(created) });
  } catch (err) {
    if (isMongoDuplicateKeyError(err)) {
      return failResult(409, "Line of business code already exists");
    }
    return failResult(500, "Could not create line of business");
  }
}

export async function patchLineOfBusiness(
  lineOfBusinessId: string | undefined,
  dto: PatchLineOfBusinessDto,
): Promise<ServiceResult<{ item: LineOfBusinessOut }>> {
  if (!lineOfBusinessId || !mongoose.isValidObjectId(lineOfBusinessId)) {
    return failResult(400, "Invalid line of business id");
  }

  const $set: Record<string, unknown> = {};
  if (dto.code !== undefined) {
    $set.code = dto.code.trim();
  }
  if (dto.name !== undefined) {
    $set.name = dto.name.trim();
  }
  if (dto.description !== undefined) {
    $set.description = dto.description.trim();
  }
  if (dto.isActive !== undefined) {
    $set.isActive = dto.isActive;
  }
  if (Object.keys($set).length === 0) {
    return failResult(400, "Provide at least one field to update");
  }

  try {
    const updated = await LineOfBusinessModel.findByIdAndUpdate(
      lineOfBusinessId,
      { $set },
      { new: true, runValidators: true },
    )
      .lean()
      .exec();
    if (updated == null) {
      return failResult(404, "Line of business not found");
    }
    return okResult(200, "Updated", { item: toLineOfBusinessOut(updated) });
  } catch (err) {
    if (isMongoDuplicateKeyError(err)) {
      return failResult(409, "Line of business code already exists");
    }
    return failResult(500, "Could not update line of business");
  }
}

export async function deleteLineOfBusiness(
  dto: MongoIdParamDto,
): Promise<ServiceResult<{ id: string }>> {
  const deleted = await LineOfBusinessModel.findByIdAndDelete(dto.id).lean().exec();
  if (deleted == null) {
    return failResult(404, "Line of business not found");
  }
  return okResult(200, "Deleted", { id: dto.id });
}
