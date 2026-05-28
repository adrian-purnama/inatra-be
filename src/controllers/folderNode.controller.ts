import type { Request, Response } from "express";
import { sendServiceResult } from "../lib/serviceResponse.js";
import { validateOrThrow } from "../lib/errors.js";
import { CreateFolderNodeDto } from "../dto/createFolderNode.dto.js";
import { PatchFolderNodeDto } from "../dto/patchFolderNode.dto.js";
import { MongoIdParamDto } from "../dto/mongoIdParam.dto.js";
import * as folderNodeService from "../services/folderNode.service.js";

function paramId(req: Request, key: string): string | undefined {
  const raw = req.params[key];
  return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
}

export async function listFolderNodes(req: Request, res: Response) {
  const qNamespace = req.query["namespace"];
  const qParentId = req.query["parentId"];
  const qIncludeInactive = req.query["includeInactive"];
  const namespace =
    typeof qNamespace === "string"
      ? qNamespace
      : Array.isArray(qNamespace) && typeof qNamespace[0] === "string"
        ? qNamespace[0]
        : "";
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

  const result = await folderNodeService.listFolderNodes({
    namespace,
    parentId,
    includeInactive,
  });
  sendServiceResult(res, result);
}

export async function createFolderNode(req: Request, res: Response) {
  const dto = Object.assign(new CreateFolderNodeDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await folderNodeService.createFolderNode(dto);
  sendServiceResult(res, result);
}

export async function patchFolderNode(req: Request, res: Response) {
  const dto = Object.assign(new PatchFolderNodeDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await folderNodeService.patchFolderNode(paramId(req, "id"), dto);
  sendServiceResult(res, result);
}

export async function deleteFolderNode(req: Request, res: Response) {
  const dto = Object.assign(new MongoIdParamDto(), { id: paramId(req, "id") ?? "" });
  await validateOrThrow(dto);
  const result = await folderNodeService.deleteFolderNode(dto.id);
  sendServiceResult(res, result);
}

