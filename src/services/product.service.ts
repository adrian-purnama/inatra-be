import mongoose from "mongoose";
import type { MongoIdParamDto } from "../dto/mongoIdParam.dto.js";
import { failResult, okResult, type ServiceResult } from "../lib/serviceResponse.js";
import { FolderCounterModel } from "../models/folderCounter.model.js";
import { FolderNodeModel } from "../models/folderNode.model.js";
import { ProductModel } from "../models/product.model.js";

type ProductOut = {
  id: string;
  name: string;
  folderId: string | null;
  sku: string;
  unit: string;
  skuHistory: string[];
  createdAt: Date | undefined;
  updatedAt: Date | undefined;
};

function toProductOut(row: any): ProductOut {
  return {
    id: String(row._id),
    name: String(row.name ?? ""),
    folderId: row.folderId ? String(row.folderId) : null,
    sku: String(row.sku ?? ""),
    unit: String(row.unit ?? ""),
    skuHistory: Array.isArray(row.skuHistory) ? row.skuHistory.map(String) : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getFolderPathCodes(params: {
  namespace: string;
  leafFolderId: mongoose.Types.ObjectId;
}): Promise<ServiceResult<{ code3s: string[] }>> {
  const seen = new Set<string>();
  const code3s: string[] = [];
  let curId: mongoose.Types.ObjectId | null = params.leafFolderId;
  for (let depth = 0; depth < 64 && curId; depth++) {
    const key = String(curId);
    if (seen.has(key)) return failResult(400, "Folder hierarchy cycle detected");
    seen.add(key);
    const row = await FolderNodeModel.findById(curId)
      .select("namespace parentId code3")
      .lean()
      .exec();
    if (!row) return failResult(400, "Folder does not exist");
    if (String((row as any).namespace ?? "") !== params.namespace) {
      return failResult(400, "Folder namespace mismatch");
    }
    code3s.push(String((row as any).code3 ?? "").toUpperCase());
    curId = (row as any).parentId ? new mongoose.Types.ObjectId(String((row as any).parentId)) : null;
  }
  return okResult(200, "OK", { code3s: code3s.reverse() });
}

async function allocateLeafSequence(params: {
  namespace: string;
  leafFolderId: mongoose.Types.ObjectId;
}): Promise<ServiceResult<{ seq: number }>> {
  const updated = await FolderCounterModel.findOneAndUpdate(
    { namespace: params.namespace, leafFolderId: params.leafFolderId },
    { $inc: { nextSeq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
    .lean()
    .exec();
  const nextSeq = Number((updated as any)?.nextSeq ?? 1);
  const allocated = Math.max(1, nextSeq - 1);
  return okResult(200, "OK", { seq: allocated });
}

async function generateSku(params: {
  namespace: string;
  leafFolderId: mongoose.Types.ObjectId;
}): Promise<ServiceResult<{ sku: string }>> {
  const pathRes = await getFolderPathCodes({ namespace: params.namespace, leafFolderId: params.leafFolderId });
  if (!pathRes.success) return pathRes;
  const prefix = pathRes.data.code3s.filter(Boolean).join("-");
  if (!prefix) return failResult(400, "Folder path is empty");
  const seqRes = await allocateLeafSequence(params);
  if (!seqRes.success) return seqRes;
  const suffix = String(seqRes.data.seq).padStart(4, "0");
  return okResult(200, "OK", { sku: `${prefix}-${suffix}` });
}

export async function listProducts(input?: {
  q?: string;
  folderId?: string;
  folderIds?: string[];
}): Promise<ServiceResult<{ items: ProductOut[] }>> {
  const q = String(input?.q ?? "").trim();
  const filter: Record<string, unknown> = {};
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { sku: { $regex: q, $options: "i" } },
    ];
  }
  if (input?.folderId != null) {
    const raw = String(input.folderId ?? "").trim();
    if (raw && mongoose.isValidObjectId(raw)) {
      filter.folderId = new mongoose.Types.ObjectId(raw);
    }
  }
  if (Array.isArray(input?.folderIds) && input.folderIds.length > 0) {
    const ids = input.folderIds
      .map((x) => String(x ?? "").trim())
      .filter((x) => mongoose.isValidObjectId(x))
      .map((x) => new mongoose.Types.ObjectId(x));
    if (ids.length > 0) {
      filter.folderId = { $in: ids };
    }
  }
  const rows = await ProductModel.find(filter).sort({ updatedAt: -1 }).lean().exec();
  return okResult(200, "OK", { items: rows.map((r) => toProductOut(r)) });
}

export async function createProduct(dto: {
  name: string;
  folderId: string;
  unit?: string;
}): Promise<ServiceResult<{ item: ProductOut }>> {
  const name = String(dto.name ?? "").trim();
  const folderIdRaw = String(dto.folderId ?? "").trim();
  if (!name) return failResult(400, "name is required");
  if (!folderIdRaw || !mongoose.isValidObjectId(folderIdRaw)) return failResult(400, "folderId is required");

  const leafFolderId = new mongoose.Types.ObjectId(folderIdRaw);
  const skuRes = await generateSku({ namespace: "product", leafFolderId });
  if (!skuRes.success) return skuRes;

  try {
    const created = await ProductModel.create({
      name,
      folderId: leafFolderId,
      sku: skuRes.data.sku,
      unit: String(dto.unit ?? "").trim(),
      skuHistory: [],
    });
    return okResult(201, "Created", { item: toProductOut(created) });
  } catch (err: unknown) {
    const msg = String((err as Error).message ?? "");
    if (msg.includes("E11000") || msg.includes("duplicate key")) {
      return failResult(409, "SKU already exists");
    }
    return failResult(500, "Could not create product");
  }
}

export async function patchProduct(
  productId: string | undefined,
  dto: { name?: string; folderId?: string; unit?: string },
): Promise<ServiceResult<{ item: ProductOut }>> {
  if (!productId || !mongoose.isValidObjectId(productId)) return failResult(400, "Invalid product id");
  const existing = await ProductModel.findById(productId).lean().exec();
  if (!existing) return failResult(404, "Product not found");

  const $set: Record<string, unknown> = {};
  const $push: Record<string, unknown> = {};

  if (dto.name !== undefined) {
    const name = String(dto.name ?? "").trim();
    if (!name) return failResult(400, "name is required");
    $set.name = name;
  }

  if (dto.unit !== undefined) {
    $set.unit = String(dto.unit ?? "").trim();
  }

  if (dto.folderId !== undefined) {
    const folderIdRaw = String(dto.folderId ?? "").trim();
    if (!folderIdRaw || !mongoose.isValidObjectId(folderIdRaw)) return failResult(400, "Invalid folderId");
    const leafFolderId = new mongoose.Types.ObjectId(folderIdRaw);
    const skuRes = await generateSku({ namespace: "product", leafFolderId });
    if (!skuRes.success) return skuRes;
    $set.folderId = leafFolderId;
    $set.sku = skuRes.data.sku;
    $push.skuHistory = String(existing.sku ?? "");
  }

  if (Object.keys($set).length === 0 && Object.keys($push).length === 0) {
    return failResult(400, "Provide at least one field to update");
  }

  const update: Record<string, unknown> = { $set };
  if ($push.skuHistory) {
    update.$push = { skuHistory: $push.skuHistory };
  }

  try {
    const updated = await ProductModel.findByIdAndUpdate(productId, update, { new: true })
      .lean()
      .exec();
    if (!updated) return failResult(404, "Product not found");
    return okResult(200, "OK", { item: toProductOut(updated) });
  } catch (err: unknown) {
    const msg = String((err as Error).message ?? "");
    if (msg.includes("E11000") || msg.includes("duplicate key")) {
      return failResult(409, "SKU already exists");
    }
    return failResult(500, "Could not update product");
  }
}

export async function deleteProduct(dto: MongoIdParamDto): Promise<ServiceResult<{}>> {
  const id = dto.id;
  if (!id || !mongoose.isValidObjectId(id)) return failResult(400, "Invalid product id");
  const deleted = await ProductModel.findByIdAndDelete(id).lean().exec();
  if (!deleted) return failResult(404, "Product not found");
  return okResult(200, "Deleted", {});
}

