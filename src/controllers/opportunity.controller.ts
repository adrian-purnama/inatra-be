import type { Request, Response } from "express";
import { failResult, sendServiceResult } from "../lib/serviceResponse.js";
import { validateOrThrow } from "../lib/errors.js";
import { CreateOpportunityDto } from "../dto/createOpportunity.dto.js";
import { PatchOpportunityDto } from "../dto/patchOpportunity.dto.js";
import { MongoIdParamDto } from "../dto/mongoIdParam.dto.js";
import {
  LinkOpportunityAttachmentDto,
  ShareOpportunityAttachmentDto,
} from "../dto/opportunityAttachment.dto.js";
import * as opportunityService from "../services/opportunity.service.js";
import * as statusService from "../services/status.service.js";
import { STATUS_CATEGORIES } from "../models/status.model.js";

function paramId(req: Request, key: string): string | undefined {
  const raw = req.params[key];
  return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
}

export async function listOpportunityStatuses(_req: Request, res: Response) {
  const result = await statusService.listStatuses(STATUS_CATEGORIES.OPPORTUNITY_CATEGORY, false);
  sendServiceResult(res, result);
}

export async function listOpportunities(req: Request, res: Response) {
  const qPage = req.query["page"];
  const qLimit = req.query["limit"];
  const qOnlyMine = req.query["onlyMine"];
  const qCustomerId = req.query["customerId"];
  const qEndUserId = req.query["endUserId"];
  const qLeadQualificationId = req.query["leadQualificationId"];

  const page = Math.max(
    1,
    parseInt(
      typeof qPage === "string"
        ? qPage
        : Array.isArray(qPage) && typeof qPage[0] === "string"
          ? qPage[0]
          : "1",
      10,
    ) || 1,
  );
  const limit = Math.min(
    100,
    Math.max(
      1,
      parseInt(
        typeof qLimit === "string"
          ? qLimit
          : Array.isArray(qLimit) && typeof qLimit[0] === "string"
            ? qLimit[0]
            : "20",
        10,
      ) || 20,
    ),
  );
  const onlyMine =
    qOnlyMine === "1" ||
    qOnlyMine === "true" ||
    (Array.isArray(qOnlyMine) &&
      (qOnlyMine.includes("1") || qOnlyMine.includes("true")));
  const customerId =
    typeof qCustomerId === "string"
      ? qCustomerId
      : Array.isArray(qCustomerId) && typeof qCustomerId[0] === "string"
        ? qCustomerId[0]
        : undefined;
  const endUserId =
    typeof qEndUserId === "string"
      ? qEndUserId
      : Array.isArray(qEndUserId) && typeof qEndUserId[0] === "string"
        ? qEndUserId[0]
        : undefined;
  const leadQualificationId =
    typeof qLeadQualificationId === "string"
      ? qLeadQualificationId
      : Array.isArray(qLeadQualificationId) && typeof qLeadQualificationId[0] === "string"
        ? qLeadQualificationId[0]
        : undefined;

  const query: {
    page: number;
    limit: number;
    onlyMine: boolean;
    customerId?: string;
    endUserId?: string;
    leadQualificationId?: string;
  } = {
    page,
    limit,
    onlyMine,
  };
  if (customerId !== undefined) query.customerId = customerId;
  if (endUserId !== undefined) query.endUserId = endUserId;
  if (leadQualificationId !== undefined) query.leadQualificationId = leadQualificationId;

  const result = await opportunityService.listOpportunities(req.auth?.sub, query);
  sendServiceResult(res, result);
}

export async function getOpportunity(req: Request, res: Response) {
  const result = await opportunityService.getOpportunityById(
    req.auth?.sub,
    paramId(req, "id"),
  );
  sendServiceResult(res, result);
}

export async function listOpportunityHeaders(req: Request, res: Response) {
  const result = await opportunityService.listOpportunityHeaders(req.auth?.sub);
  sendServiceResult(res, result);
}

export async function listOpportunityDetails(req: Request, res: Response) {
  const qIds = req.query["ids"];
  const idsRaw =
    typeof qIds === "string"
      ? qIds
      : Array.isArray(qIds) && typeof qIds[0] === "string"
        ? qIds[0]
        : "";
  const ids = idsRaw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const result = await opportunityService.listOpportunityDetails(req.auth?.sub, ids);
  sendServiceResult(res, result);
}

export async function createOpportunity(req: Request, res: Response) {
  const dto = Object.assign(new CreateOpportunityDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await opportunityService.createOpportunity(req.auth?.sub, dto);
  sendServiceResult(res, result);
}

export async function patchOpportunity(req: Request, res: Response) {
  const dto = Object.assign(new PatchOpportunityDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await opportunityService.patchOpportunity(req.auth?.sub, paramId(req, "id"), dto);
  sendServiceResult(res, result);
}

export async function deleteOpportunity(req: Request, res: Response) {
  const dto = Object.assign(new MongoIdParamDto(), { id: paramId(req, "id") ?? "" });
  await validateOrThrow(dto);
  const result = await opportunityService.deleteOpportunity(req.auth?.sub, dto);
  sendServiceResult(res, result);
}

export async function uploadOpportunityAttachment(req: Request, res: Response) {
  const f = req.file;
  if (f == null) {
    sendServiceResult(res, failResult(400, 'Missing file (multipart field name: "file")'));
    return;
  }
  const result = await opportunityService.uploadOpportunityAttachment(
    req.auth?.sub,
    paramId(req, "id"),
    f,
  );
  sendServiceResult(res, result);
}

export async function linkOpportunityAttachment(req: Request, res: Response) {
  const dto = Object.assign(new LinkOpportunityAttachmentDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await opportunityService.linkOpportunityAttachment(
    req.auth?.sub,
    paramId(req, "id"),
    dto,
  );
  sendServiceResult(res, result);
}

export async function shareOpportunityAttachment(req: Request, res: Response) {
  const dto = Object.assign(new ShareOpportunityAttachmentDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await opportunityService.shareOpportunityAttachment(
    req.auth?.sub,
    paramId(req, "id"),
    dto,
  );
  sendServiceResult(res, result);
}

export async function removeOpportunityAttachment(req: Request, res: Response) {
  const result = await opportunityService.removeOpportunityAttachment(
    req.auth?.sub,
    paramId(req, "id"),
    paramId(req, "assetFileId"),
  );
  sendServiceResult(res, result);
}
