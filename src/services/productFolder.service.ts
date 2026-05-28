import mongoose from "mongoose";
import { failResult, okResult, type ServiceResult } from "../lib/serviceResponse.js";
import { FolderNodeModel } from "../models/folderNode.model.js";
import { ProductModel } from "../models/product.model.js";
import * as folderNodeService from "./folderNode.service.js";
import { FolderCounterModel } from "../models/folderCounter.model.js";

export async function deleteProductFolder(folderId: string | undefined): Promise<ServiceResult<{}>> {
  if (!folderId || !mongoose.isValidObjectId(folderId)) {
    return failResult(400, "Invalid folder id");
  }
  const id = new mongoose.Types.ObjectId(folderId);

  const row = await FolderNodeModel.findById(id).select("namespace").lean().exec();
  if (!row) return failResult(404, "Folder not found");
  if (String((row as any).namespace ?? "") !== "product") {
    return failResult(400, "Folder namespace mismatch");
  }

  const productCount = await ProductModel.countDocuments({ folderId: id }).exec();
  if (productCount > 0) return failResult(400, "Folder has products");

  // Generic service enforces child-folder constraint.
  return folderNodeService.deleteFolderNode(folderId);
}

type RenameSkuChange = {
  productId: string;
  productName: string;
  folderId: string;
  oldSku: string;
  newSku: string;
};

function parseSkuSuffix(oldSku: string): string | null {
  const m = /-(\d{4})$/.exec(String(oldSku ?? "").trim().toUpperCase());
  return m?.[1] ?? null;
}

async function computeLeafPrefixes(params: {
  namespace: string;
  leafFolderIds: string[];
  overrideCode3ById?: Record<string, string>;
}): Promise<Map<string, string>> {
  const rows = await FolderNodeModel.find({ namespace: params.namespace })
    .select("_id parentId code3")
    .lean()
    .exec();
  const byId = new Map<string, { parentId: string | null; code3: string }>();
  for (const r of rows as any[]) {
    byId.set(String(r._id), {
      parentId: r.parentId ? String(r.parentId) : null,
      code3: String(r.code3 ?? "").toUpperCase(),
    });
  }
  const out = new Map<string, string>();
  for (const leafId of params.leafFolderIds) {
    const seen = new Set<string>();
    const parts: string[] = [];
    let cur: string | null = leafId;
    for (let depth = 0; depth < 64 && cur; depth++) {
      if (seen.has(cur)) break;
      seen.add(cur);
      const row = byId.get(cur);
      if (!row) break;
      const code3 = params.overrideCode3ById?.[cur] ?? row.code3;
      parts.push(String(code3 || "").toUpperCase());
      cur = row.parentId;
    }
    out.set(leafId, parts.reverse().filter(Boolean).join("-"));
  }
  return out;
}

async function allocateLeafSeq(namespace: string, leafFolderId: mongoose.Types.ObjectId): Promise<number> {
  const updated = await FolderCounterModel.findOneAndUpdate(
    { namespace, leafFolderId },
    { $inc: { nextSeq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
    .lean()
    .exec();
  const nextSeq = Number((updated as any)?.nextSeq ?? 1);
  return Math.max(1, nextSeq - 1);
}

async function collectSubtreeLeafIds(rootId: string): Promise<string[]> {
  const rows = await FolderNodeModel.find({ namespace: "product" }).select("_id parentId").lean().exec();
  const childrenByParent = new Map<string | null, string[]>();
  for (const r of rows as any[]) {
    const pid = r.parentId ? String(r.parentId) : null;
    const list = childrenByParent.get(pid) ?? [];
    list.push(String(r._id));
    childrenByParent.set(pid, list);
  }
  const inSubtree = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur || inSubtree.has(cur)) continue;
    inSubtree.add(cur);
    const kids = childrenByParent.get(cur) ?? [];
    for (const k of kids) stack.push(k);
  }
  const leafIds: string[] = [];
  for (const id of inSubtree) {
    const kids = childrenByParent.get(id) ?? [];
    if (kids.length === 0) leafIds.push(id);
  }
  return leafIds;
}

export async function previewRenameProductFolder(input: {
  folderId: string | undefined;
  newName: string;
}): Promise<ServiceResult<{ oldName: string; newName: string; oldCode3: string; newCode3: string; changes: RenameSkuChange[]; truncated: boolean; total: number }>> {
  const folderId = String(input.folderId ?? "").trim();
  if (!folderId || !mongoose.isValidObjectId(folderId)) return failResult(400, "Invalid folder id");
  const newName = String(input.newName ?? "").trim();
  if (!newName) return failResult(400, "name is required");

  const row = await FolderNodeModel.findById(folderId).select("namespace parentId name code3").lean().exec();
  if (!row) return failResult(404, "Folder not found");
  if (String((row as any).namespace ?? "") !== "product") return failResult(400, "Folder namespace mismatch");

  const parentId = (row as any).parentId ? new mongoose.Types.ObjectId(String((row as any).parentId)) : null;
  const newCode3 = await folderNodeService.generateUniqueCode3({
    namespace: "product",
    parentId,
    name: newName,
    excludeId: new mongoose.Types.ObjectId(folderId),
  });

  const leafIds = await collectSubtreeLeafIds(folderId);
  const oldPrefixes = await computeLeafPrefixes({ namespace: "product", leafFolderIds: leafIds });
  const newPrefixes = await computeLeafPrefixes({
    namespace: "product",
    leafFolderIds: leafIds,
    overrideCode3ById: { [folderId]: String(newCode3).toUpperCase() },
  });

  const products = await ProductModel.find({ folderId: { $in: leafIds.map((x) => new mongoose.Types.ObjectId(x)) } })
    .select("_id name folderId sku")
    .lean()
    .exec();

  const changesAll: RenameSkuChange[] = [];
  for (const p of products as any[]) {
    const fid = p.folderId ? String(p.folderId) : "";
    const suffix = parseSkuSuffix(String(p.sku ?? "")) ?? "0000";
    const prefix = newPrefixes.get(fid) ?? "";
    const nextSku = prefix ? `${prefix}-${suffix}` : String(p.sku ?? "");
    changesAll.push({
      productId: String(p._id),
      productName: String(p.name ?? ""),
      folderId: fid,
      oldSku: String(p.sku ?? ""),
      newSku: nextSku,
    });
  }

  const LIMIT = 200;
  const truncated = changesAll.length > LIMIT;
  const changes = truncated ? changesAll.slice(0, LIMIT) : changesAll;

  return okResult(200, "OK", {
    oldName: String((row as any).name ?? ""),
    newName,
    oldCode3: String((row as any).code3 ?? "").toUpperCase(),
    newCode3: String(newCode3).toUpperCase(),
    changes,
    truncated,
    total: changesAll.length,
  });
}

export async function applyRenameProductFolder(input: {
  folderId: string | undefined;
  newName: string;
}): Promise<ServiceResult<{ updatedFolderId: string; updatedProducts: number }>> {
  const folderId = String(input.folderId ?? "").trim();
  if (!folderId || !mongoose.isValidObjectId(folderId)) return failResult(400, "Invalid folder id");
  const newName = String(input.newName ?? "").trim();
  if (!newName) return failResult(400, "name is required");

  const row = await FolderNodeModel.findById(folderId).select("namespace parentId name code3").lean().exec();
  if (!row) return failResult(404, "Folder not found");
  if (String((row as any).namespace ?? "") !== "product") return failResult(400, "Folder namespace mismatch");

  const parentId = (row as any).parentId ? new mongoose.Types.ObjectId(String((row as any).parentId)) : null;
  const newCode3 = await folderNodeService.generateUniqueCode3({
    namespace: "product",
    parentId,
    name: newName,
    excludeId: new mongoose.Types.ObjectId(folderId),
  });

  const leafIds = await collectSubtreeLeafIds(folderId);
  const newPrefixes = await computeLeafPrefixes({
    namespace: "product",
    leafFolderIds: leafIds,
    overrideCode3ById: { [folderId]: String(newCode3).toUpperCase() },
  });

  const products = await ProductModel.find({ folderId: { $in: leafIds.map((x) => new mongoose.Types.ObjectId(x)) } })
    .select("_id name folderId sku")
    .lean()
    .exec();

  const updates: Array<{ id: string; oldSku: string; nextSku: string }> = [];
  for (const p of products as any[]) {
    const fid = p.folderId ? String(p.folderId) : "";
    const suffix = parseSkuSuffix(String(p.sku ?? "")) ?? null;
    const prefix = newPrefixes.get(fid) ?? "";
    let nextSku = prefix && suffix ? `${prefix}-${suffix}` : "";
    if (!nextSku) {
      // fallback: allocate a new sequence for that leaf folder
      const seq = await allocateLeafSeq("product", new mongoose.Types.ObjectId(fid));
      nextSku = `${prefix}-${String(seq).padStart(4, "0")}`;
    }
    updates.push({ id: String(p._id), oldSku: String(p.sku ?? ""), nextSku });
  }

  // Resolve collisions with existing SKUs (very rare but must be safe).
  const desired = updates.map((u) => u.nextSku);
  const conflicts = await ProductModel.find({ sku: { $in: desired } })
    .select("_id sku")
    .lean()
    .exec();
  const conflictSkus = new Set((conflicts as any[]).map((c) => String(c.sku ?? "").toUpperCase()));

  for (const u of updates) {
    if (!conflictSkus.has(String(u.nextSku).toUpperCase())) continue;
    const prod = products.find((p: any) => String(p._id) === u.id);
    const fid = prod?.folderId ? String(prod.folderId) : "";
    if (!fid) continue;
    const prefix = newPrefixes.get(fid) ?? "";
    const seq = await allocateLeafSeq("product", new mongoose.Types.ObjectId(fid));
    u.nextSku = `${prefix}-${String(seq).padStart(4, "0")}`;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await FolderNodeModel.updateOne(
        { _id: new mongoose.Types.ObjectId(folderId) },
        { $set: { name: newName, code3: String(newCode3).toUpperCase() } },
        { session },
      ).exec();

      if (updates.length > 0) {
        await ProductModel.bulkWrite(
          updates.map((u) => ({
            updateOne: {
              filter: { _id: new mongoose.Types.ObjectId(u.id) },
              update: { $set: { sku: u.nextSku }, $push: { skuHistory: u.oldSku } },
            },
          })),
          { session },
        );
      }
    });
    return okResult(200, "OK", { updatedFolderId: folderId, updatedProducts: updates.length });
  } catch {
    return failResult(500, "Could not rename folder");
  } finally {
    await session.endSession();
  }
}

export async function deleteFolderWithNamespaceGuard(input: {
  namespace: string;
  folderId: string | undefined;
}): Promise<ServiceResult<{}>> {
  const namespace = String(input.namespace ?? "").trim();
  if (!namespace) return failResult(400, "namespace is required");
  if (!input.folderId || !mongoose.isValidObjectId(input.folderId)) {
    return failResult(400, "Invalid folder id");
  }
  const id = new mongoose.Types.ObjectId(input.folderId);
  const row = await FolderNodeModel.findById(id).select("namespace").lean().exec();
  if (!row) return failResult(404, "Folder not found");
  if (String((row as any).namespace ?? "") !== namespace) {
    return failResult(400, "Folder namespace mismatch");
  }
  return folderNodeService.deleteFolderNode(input.folderId);
}

