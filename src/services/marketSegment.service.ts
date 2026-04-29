import mongoose from "mongoose";
import type { CreateMarketSegmentDto } from "../dto/createMarketSegment.dto.js";
import type { MongoIdParamDto } from "../dto/mongoIdParam.dto.js";
import type { PatchMarketSegmentDto } from "../dto/patchMarketSegment.dto.js";
import { failResult, okResult, type ServiceResult } from "../lib/serviceResponse.js";
import { MarketSegmentModel } from "../models/marketSegment.model.js";

type MarketSegmentOut = {
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

function toMarketSegmentOut(row: {
  _id: unknown;
  code: string;
  name: string;
  description: string;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}): MarketSegmentOut {
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

export async function listMarketSegments(): Promise<
  ServiceResult<{ items: MarketSegmentOut[] }>
> {
  const rows = await MarketSegmentModel.find()
    .sort({ code: 1, name: 1 })
    .lean()
    .exec();
  return okResult(200, "OK", { items: rows.map((r) => toMarketSegmentOut(r)) });
}

export async function createMarketSegment(
  dto: CreateMarketSegmentDto,
): Promise<ServiceResult<{ item: MarketSegmentOut }>> {
  const code = dto.code.trim();
  const name = dto.name.trim();
  const description = dto.description.trim();
  const isActive = dto.isActive ?? true;

  try {
    const created = await MarketSegmentModel.create({
      code,
      name,
      description,
      isActive,
    });
    return okResult(201, "Created", { item: toMarketSegmentOut(created) });
  } catch (err) {
    if (isMongoDuplicateKeyError(err)) {
      return failResult(409, "Market segment code already exists");
    }
    return failResult(500, "Could not create market segment");
  }
}

export async function patchMarketSegment(
  marketSegmentId: string | undefined,
  dto: PatchMarketSegmentDto,
): Promise<ServiceResult<{ item: MarketSegmentOut }>> {
  if (!marketSegmentId || !mongoose.isValidObjectId(marketSegmentId)) {
    return failResult(400, "Invalid market segment id");
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
    const updated = await MarketSegmentModel.findByIdAndUpdate(
      marketSegmentId,
      { $set },
      { new: true, runValidators: true },
    )
      .lean()
      .exec();
    if (updated == null) {
      return failResult(404, "Market segment not found");
    }
    return okResult(200, "Updated", { item: toMarketSegmentOut(updated) });
  } catch (err) {
    if (isMongoDuplicateKeyError(err)) {
      return failResult(409, "Market segment code already exists");
    }
    return failResult(500, "Could not update market segment");
  }
}

export async function deleteMarketSegment(
  dto: MongoIdParamDto,
): Promise<ServiceResult<{ id: string }>> {
  const deleted = await MarketSegmentModel.findByIdAndDelete(dto.id).lean().exec();
  if (deleted == null) {
    return failResult(404, "Market segment not found");
  }
  return okResult(200, "Deleted", { id: dto.id });
}
