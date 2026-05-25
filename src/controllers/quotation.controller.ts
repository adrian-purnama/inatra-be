import type { Request, Response } from "express";
import { validateOrThrow } from "../lib/errors.js";
import { sendServiceResult } from "../lib/serviceResponse.js";
import { CreateQuotationDto } from "../dto/createQuotation.dto.js";
import { PatchQuotationDto } from "../dto/patchQuotation.dto.js";
import { ApproveQuotationDto } from "../dto/approveQuotation.dto.js";
import { RejectQuotationDto } from "../dto/rejectQuotation.dto.js";
import { ReviseQuotationDto } from "../dto/reviseQuotation.dto.js";
import { MongoIdParamDto } from "../dto/mongoIdParam.dto.js";
import * as quotationService from "../services/quotation.service.js";
import * as quotationPdfService from "../services/quotationPdf.service.js";

function paramId(req: Request, key: string): string | undefined {
  const raw = req.params[key];
  return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
}

export async function listQuotationApprovers(_req: Request, res: Response) {
  const result = await quotationService.listQuotationApproverCandidates();
  sendServiceResult(res, result);
}

export async function listQuotations(req: Request, res: Response) {
  const qPage = req.query["page"];
  const qLimit = req.query["limit"];
  const qOnlyMine = req.query["onlyMine"];
  const qOpportunityId = req.query["opportunityId"];
  const qQuotationStatus = req.query["quotationStatus"];
  const qCustomerId = req.query["customerId"];
  const qEndUserId = req.query["endUserId"];
  const page = Math.max(
    1,
    parseInt(
      typeof qPage === "string" ? qPage : Array.isArray(qPage) ? String(qPage[0] ?? "1") : "1",
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
          : Array.isArray(qLimit)
            ? String(qLimit[0] ?? "20")
            : "20",
        10,
      ) || 20,
    ),
  );
  const onlyMine =
    qOnlyMine === "1" ||
    qOnlyMine === "true" ||
    (Array.isArray(qOnlyMine) && (qOnlyMine.includes("1") || qOnlyMine.includes("true")));
  const opportunityId =
    typeof qOpportunityId === "string"
      ? qOpportunityId
      : Array.isArray(qOpportunityId) && typeof qOpportunityId[0] === "string"
        ? qOpportunityId[0]
        : undefined;
  const quotationStatus =
    typeof qQuotationStatus === "string"
      ? qQuotationStatus
      : Array.isArray(qQuotationStatus) && typeof qQuotationStatus[0] === "string"
        ? qQuotationStatus[0]
        : undefined;
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

  const query: {
    page: number;
    limit: number;
    onlyMine: boolean;
    opportunityId?: string;
    quotationStatus?: string;
    customerId?: string;
    endUserId?: string;
  } = { page, limit, onlyMine };
  if (opportunityId !== undefined) query.opportunityId = opportunityId;
  if (quotationStatus !== undefined) query.quotationStatus = quotationStatus;
  if (customerId !== undefined) query.customerId = customerId;
  if (endUserId !== undefined) query.endUserId = endUserId;
  const result = await quotationService.listQuotations(req.auth?.sub, query);
  sendServiceResult(res, result);
}

export async function getQuotation(req: Request, res: Response) {
  const result = await quotationService.getQuotationById(paramId(req, "id"));
  sendServiceResult(res, result);
}

export async function exportQuotationPdf(req: Request, res: Response) {
  const result = await quotationPdfService.exportQuotationPdf(
    req.auth?.sub,
    paramId(req, "id"),
  );
  if (!result.success || result.data == null) {
    sendServiceResult(res, result);
    return;
  }
  const { buffer, filename } = result.data;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(buffer);
}

export async function createQuotation(req: Request, res: Response) {
  const dto = Object.assign(new CreateQuotationDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await quotationService.createQuotation(req.auth?.sub, dto);
  sendServiceResult(res, result);
}

export async function createDraftFromOpportunity(req: Request, res: Response) {
  const result = await quotationService.createDraftQuotationFromOpportunity(
    req.auth?.sub,
    paramId(req, "opportunityId"),
  );
  sendServiceResult(res, result);
}

export async function patchQuotation(req: Request, res: Response) {
  const dto = Object.assign(new PatchQuotationDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await quotationService.patchQuotation(req.auth?.sub, paramId(req, "id"), dto);
  sendServiceResult(res, result);
}

export async function submitQuotation(req: Request, res: Response) {
  const dto = Object.assign(new ReviseQuotationDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await quotationService.submitQuotation(
    req.auth?.sub,
    paramId(req, "id"),
    dto.approverId,
  );
  sendServiceResult(res, result);
}

export async function approveQuotation(req: Request, res: Response) {
  const dto = Object.assign(new ApproveQuotationDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await quotationService.approveQuotation(req.auth?.sub, paramId(req, "id"));
  sendServiceResult(res, result);
}

export async function rejectQuotation(req: Request, res: Response) {
  const dto = Object.assign(new RejectQuotationDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await quotationService.rejectQuotation(req.auth?.sub, paramId(req, "id"), dto);
  sendServiceResult(res, result);
}

export async function reviseQuotation(req: Request, res: Response) {
  const dto = Object.assign(new ReviseQuotationDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await quotationService.reviseQuotation(req.auth?.sub, paramId(req, "id"), dto);
  sendServiceResult(res, result);
}

export async function deleteQuotation(req: Request, res: Response) {
  const dto = Object.assign(new MongoIdParamDto(), { id: paramId(req, "id") ?? "" });
  await validateOrThrow(dto);
  const result = await quotationService.deleteQuotation(req.auth?.sub, dto);
  sendServiceResult(res, result);
}
