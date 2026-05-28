import mongoose from "mongoose";
import { failResult, okResult, type ServiceResult } from "../lib/serviceResponse.js";
import { FolderNodeModel } from "../models/folderNode.model.js";

export type FolderNodeOut = {
  id: string;
  namespace: string;
  parentId: string | null;
  name: string;
  code3: string;
  isActive: boolean;
  createdAt: Date | undefined;
  updatedAt: Date | undefined;
};

function toFolderNodeOut(row: any): FolderNodeOut {
  return {
    id: String(row._id),
    namespace: String(row.namespace ?? ""),
    parentId: row.parentId ? String(row.parentId) : null,
    name: String(row.name ?? ""),
    code3: String(row.code3 ?? ""),
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeNamespace(input: string): string {
  return String(input ?? "").trim();
}

function normalizeName(input: string): string {
  return String(input ?? "").trim();
}

function baseCode3FromName(name: string): string {
  const letters = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/[0-9]/g, "");
  const base = letters.slice(0, 3);
  return (base + "XXX").slice(0, 3);
}

export async function generateUniqueCode3(params: {
  namespace: string;
  parentId: mongoose.Types.ObjectId | null;
  name: string;
  excludeId?: mongoose.Types.ObjectId | null;
}): Promise<string> {
  const base = baseCode3FromName(params.name);
  const siblings = await FolderNodeModel.find({
    namespace: params.namespace,
    parentId: params.parentId,
    ...(params.excludeId ? { _id: { $ne: params.excludeId } } : {}),
  })
    .select("code3")
    .lean()
    .exec();
  const used = new Set((siblings ?? []).map((r: any) => String(r.code3 ?? "").toUpperCase()));
  if (!used.has(base)) return base;

  const lettersOnly = params.name
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  for (let i = 0; i < lettersOnly.length; i++) {
    for (let j = i + 1; j < lettersOnly.length; j++) {
      for (let k = j + 1; k < lettersOnly.length; k++) {
        const candidate = `${lettersOnly[i]}${lettersOnly[j]}${lettersOnly[k]}`;
        if (!used.has(candidate)) return candidate;
      }
    }
  }

  // Deterministic fallback: cycle last char A-Z based on number of siblings.
  for (let t = 0; t < 26; t++) {
    const candidate = `${base.slice(0, 2)}${String.fromCharCode(65 + t)}`;
    if (!used.has(candidate)) return candidate;
  }

  // Last resort (should be unreachable with realistic sibling counts).
  return base;
}

async function validateParent(params: {
  namespace: string;
  parentIdRaw: string | null;
}): Promise<ServiceResult<{ parentId: mongoose.Types.ObjectId | null }>> {
  const namespace = normalizeNamespace(params.namespace);
  if (!namespace) return failResult(400, "namespace is required");

  const parentIdRaw = params.parentIdRaw?.trim() || null;
  if (!parentIdRaw) return okResult(200, "OK", { parentId: null });
  if (!mongoose.isValidObjectId(parentIdRaw)) return failResult(400, "Invalid parentId");
  const parentId = new mongoose.Types.ObjectId(parentIdRaw);
  const parent = await FolderNodeModel.findById(parentId).select("namespace").lean().exec();
  if (!parent) return failResult(400, "Selected parent does not exist");
  if (String((parent as any).namespace ?? "") !== namespace) {
    return failResult(400, "Parent namespace mismatch");
  }
  return okResult(200, "OK", { parentId });
}

export async function listFolderNodes(input: {
  namespace?: string;
  parentId?: string | null | undefined;
  includeInactive?: boolean;
}): Promise<ServiceResult<{ items: FolderNodeOut[] }>> {
  const namespace = normalizeNamespace(input.namespace ?? "");
  if (!namespace) return failResult(400, "namespace is required");

  const filter: Record<string, unknown> = { namespace };

  // If parentId is provided, filter by it. If omitted, return all nodes in namespace.
  if (input.parentId !== undefined) {
    const parentIdRaw = input.parentId?.trim() || null;
    if (parentIdRaw && !mongoose.isValidObjectId(parentIdRaw)) {
      return failResult(400, "Invalid parentId");
    }
    filter.parentId = parentIdRaw ? new mongoose.Types.ObjectId(parentIdRaw) : null;
  }
  if (!input.includeInactive) {
    filter.isActive = true;
  }
  const rows = await FolderNodeModel.find(filter).sort({ name: 1 }).lean().exec();
  return okResult(200, "OK", { items: rows.map((r) => toFolderNodeOut(r)) });
}

export async function createFolderNode(dto: {
  namespace: string;
  parentId?: string | null;
  name: string;
  isActive?: boolean;
}): Promise<ServiceResult<{ item: FolderNodeOut }>> {
  const namespace = normalizeNamespace(dto.namespace);
  const name = normalizeName(dto.name);
  if (!namespace) return failResult(400, "namespace is required");
  if (!name) return failResult(400, "name is required");

  const parentRes = await validateParent({ namespace, parentIdRaw: dto.parentId ?? null });
  if (!parentRes.success) return parentRes;

  const code3 = await generateUniqueCode3({ namespace, parentId: parentRes.data.parentId, name });
  try {
    const created = await FolderNodeModel.create({
      namespace,
      parentId: parentRes.data.parentId,
      name,
      code3,
      isActive: dto.isActive ?? true,
    });
    return okResult(201, "Created", { item: toFolderNodeOut(created) });
  } catch (err: unknown) {
    const msg = String((err as Error).message ?? "");
    if (msg.includes("E11000") || msg.includes("duplicate key")) {
      return failResult(409, "Folder already exists under this parent");
    }
    return failResult(500, "Could not create folder");
  }
}

export async function patchFolderNode(
  folderNodeId: string | undefined,
  dto: { name?: string; isActive?: boolean },
): Promise<ServiceResult<{ item: FolderNodeOut }>> {
  if (!folderNodeId || !mongoose.isValidObjectId(folderNodeId)) {
    return failResult(400, "Invalid folder id");
  }
  const $set: Record<string, unknown> = {};
  if (dto.name !== undefined) $set.name = normalizeName(dto.name);
  if (dto.isActive !== undefined) $set.isActive = dto.isActive;
  if (Object.keys($set).length === 0) {
    return failResult(400, "Provide at least one field to update");
  }
  const updated = await FolderNodeModel.findByIdAndUpdate(
    folderNodeId,
    { $set },
    { new: true },
  )
    .lean()
    .exec();
  if (!updated) return failResult(404, "Folder not found");
  return okResult(200, "OK", { item: toFolderNodeOut(updated) });
}

export async function deleteFolderNode(folderNodeId: string | undefined): Promise<ServiceResult<{}>> {
  if (!folderNodeId || !mongoose.isValidObjectId(folderNodeId)) {
    return failResult(400, "Invalid folder id");
  }
  const id = new mongoose.Types.ObjectId(folderNodeId);
  const row = await FolderNodeModel.findById(id).select("_id").lean().exec();
  if (!row) return failResult(404, "Folder not found");

  const childrenCount = await FolderNodeModel.countDocuments({ parentId: id }).exec();
  if (childrenCount > 0) return failResult(400, "Folder has child folders");

  await FolderNodeModel.deleteOne({ _id: id }).exec();
  return okResult(200, "Deleted", {});
}

