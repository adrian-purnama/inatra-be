import type { Request, Response } from "express";
import { sendServiceResult } from "../lib/serviceResponse.js";
import { validateOrThrow } from "../lib/errors.js";
import { PatchFolderNodeDto } from "../dto/patchFolderNode.dto.js";
import * as folderNodeService from "../services/folderNode.service.js";
import * as productFolderService from "../services/productFolder.service.js";
import * as productService from "../services/product.service.js";

function param(req: Request, key: string): string {
  const raw = req.params[key];
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return typeof raw[0] === "string" ? raw[0] : "";
  return "";
}

export async function listFolders(req: Request, res: Response) {
  const namespace = param(req, "namespace");
  const qParentId = req.query["parentId"];
  const qIncludeInactive = req.query["includeInactive"];
  const qIncludeItems = req.query["includeItems"];
  const parentId =
    typeof qParentId === "string"
      ? qParentId
      : Array.isArray(qParentId) && typeof qParentId[0] === "string"
        ? qParentId[0]
        : undefined;
  const includeInactive =
    qIncludeInactive === "1" ||
    qIncludeInactive === "true" ||
    (Array.isArray(qIncludeInactive) &&
      (qIncludeInactive.includes("1") || qIncludeInactive.includes("true")));
  const includeItems =
    qIncludeItems === "1" ||
    qIncludeItems === "true" ||
    (Array.isArray(qIncludeItems) && (qIncludeItems.includes("1") || qIncludeItems.includes("true")));

  const folderRes = await folderNodeService.listFolderNodes({ namespace, parentId, includeInactive });
  if (!folderRes.success) {
    sendServiceResult(res, folderRes);
    return;
  }

  if (!includeItems) {
    sendServiceResult(res, folderRes);
    return;
  }

  if (namespace === "product") {
    const folderIds = (folderRes.data.items ?? []).map((x) => String((x as any).id ?? "")).filter(Boolean);
    const prodRes = await productService.listProducts({ folderIds });
    if (!prodRes.success) {
      sendServiceResult(res, prodRes);
      return;
    }
    const byFolderId: Record<string, Array<{ id: string; name: string; sku: string; unit: string }>> = {};
    for (const p of prodRes.data.items ?? []) {
      const fid = String((p as any).folderId ?? "");
      if (!fid) continue;
      (byFolderId[fid] ??= []).push({
        id: String((p as any).id),
        name: String((p as any).name),
        sku: String((p as any).sku),
        unit: String((p as any).unit ?? ""),
      });
    }
    sendServiceResult(res, {
      success: true,
      code: 200,
      message: "OK",
      data: { items: folderRes.data.items, leafItems: byFolderId },
    });
    return;
  }

  // Other namespaces: return folders only for now. Future domains can add their own leaf item adapters.
  sendServiceResult(res, folderRes);
}

export async function createFolder(req: Request, res: Response) {
  const namespace = param(req, "namespace");
  const name = String(req.body?.name ?? "");
  const parentId = req.body?.parentId ?? null;
  const isActive = req.body?.isActive;

  // Reuse DTO validation by mapping to existing create service signature.
  const result = await folderNodeService.createFolderNode({
    namespace,
    parentId,
    name,
    isActive,
  });
  sendServiceResult(res, result);
}

export async function patchFolder(req: Request, res: Response) {
  const dto = Object.assign(new PatchFolderNodeDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await folderNodeService.patchFolderNode(param(req, "id"), dto);
  sendServiceResult(res, result);
}

export async function deleteFolder(req: Request, res: Response) {
  const namespace = param(req, "namespace");
  const id = param(req, "id");

  const result =
    namespace === "product"
      ? await productFolderService.deleteProductFolder(id)
      : await productFolderService.deleteFolderWithNamespaceGuard({ namespace, folderId: id });
  sendServiceResult(res, result);
}

export async function previewRenameFolder(req: Request, res: Response) {
  const namespace = param(req, "namespace");
  const id = param(req, "id");
  const name = String(req.body?.name ?? "");
  if (namespace !== "product") {
    sendServiceResult(res, { success: false, code: 400, message: "Rename preview not implemented for this namespace", data: {} });
    return;
  }
  const result = await productFolderService.previewRenameProductFolder({ folderId: id, newName: name });
  sendServiceResult(res, result);
}

export async function applyRenameFolder(req: Request, res: Response) {
  const namespace = param(req, "namespace");
  const id = param(req, "id");
  const name = String(req.body?.name ?? "");
  if (namespace !== "product") {
    sendServiceResult(res, { success: false, code: 400, message: "Rename apply not implemented for this namespace", data: {} });
    return;
  }
  const result = await productFolderService.applyRenameProductFolder({ folderId: id, newName: name });
  sendServiceResult(res, result);
}

