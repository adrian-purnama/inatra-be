import type { Request, Response } from "express";
import { sendServiceResult } from "../lib/serviceResponse.js";
import { validateOrThrow } from "../lib/errors.js";
import { CreateLineOfBusinessDto } from "../dto/createLineOfBusiness.dto.js";
import { CreateMarketSegmentDto } from "../dto/createMarketSegment.dto.js";
import { CreateExternalOrgDto } from "../dto/createExternalOrg.dto.js";
import { MongoIdParamDto } from "../dto/mongoIdParam.dto.js";
import { PatchLineOfBusinessDto } from "../dto/patchLineOfBusiness.dto.js";
import { PatchMarketSegmentDto } from "../dto/patchMarketSegment.dto.js";
import { PatchExternalOrgDto } from "../dto/patchExternalOrg.dto.js";
import { CreateStatusDto } from "../dto/createStatus.dto.js";
import { PatchStatusDto } from "../dto/patchStatus.dto.js";
import { CreateVendorDto } from "../dto/createVendor.dto.js";
import { PatchVendorDto } from "../dto/patchVendor.dto.js";
import * as lineOfBusinessService from "../services/lineOfBusiness.service.js";
import * as marketSegmentService from "../services/marketSegment.service.js";
import * as externalOrgService from "../services/externalOrg.service.js";
import * as statusService from "../services/status.service.js";
import * as vendorService from "../services/vendor.service.js";

function paramId(req: Request, key: string): string | undefined {
  const raw = req.params[key];
  return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
}

export async function listLineOfBusiness(_req: Request, res: Response) {
  const result = await lineOfBusinessService.listLineOfBusiness();
  sendServiceResult(res, result);
}

export async function createLineOfBusiness(req: Request, res: Response) {
  const dto = Object.assign(new CreateLineOfBusinessDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await lineOfBusinessService.createLineOfBusiness(dto);
  sendServiceResult(res, result);
}

export async function patchLineOfBusiness(req: Request, res: Response) {
  const dto = Object.assign(new PatchLineOfBusinessDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await lineOfBusinessService.patchLineOfBusiness(paramId(req, "id"), dto);
  sendServiceResult(res, result);
}

export async function deleteLineOfBusiness(req: Request, res: Response) {
  const dto = Object.assign(new MongoIdParamDto(), { id: paramId(req, "id") ?? "" });
  await validateOrThrow(dto);
  const result = await lineOfBusinessService.deleteLineOfBusiness(dto);
  sendServiceResult(res, result);
}

export async function listMarketSegments(_req: Request, res: Response) {
  const result = await marketSegmentService.listMarketSegments();
  sendServiceResult(res, result);
}

export async function createMarketSegment(req: Request, res: Response) {
  const dto = Object.assign(new CreateMarketSegmentDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await marketSegmentService.createMarketSegment(dto);
  sendServiceResult(res, result);
}

export async function patchMarketSegment(req: Request, res: Response) {
  const dto = Object.assign(new PatchMarketSegmentDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await marketSegmentService.patchMarketSegment(paramId(req, "id"), dto);
  sendServiceResult(res, result);
}

export async function deleteMarketSegment(req: Request, res: Response) {
  const dto = Object.assign(new MongoIdParamDto(), { id: paramId(req, "id") ?? "" });
  await validateOrThrow(dto);
  const result = await marketSegmentService.deleteMarketSegment(dto);
  sendServiceResult(res, result);
}

export async function listExternalOrgs(_req: Request, res: Response) {
  const result = await externalOrgService.listExternalOrgs();
  sendServiceResult(res, result);
}

export async function createExternalOrg(req: Request, res: Response) {
  const dto = Object.assign(new CreateExternalOrgDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await externalOrgService.createExternalOrg(dto);
  sendServiceResult(res, result);
}

export async function patchExternalOrg(req: Request, res: Response) {
  const dto = Object.assign(new PatchExternalOrgDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await externalOrgService.patchExternalOrg(paramId(req, "id"), dto);
  sendServiceResult(res, result);
}

export async function deleteExternalOrg(req: Request, res: Response) {
  const dto = Object.assign(new MongoIdParamDto(), { id: paramId(req, "id") ?? "" });
  await validateOrThrow(dto);
  const result = await externalOrgService.deleteExternalOrg(dto);
  sendServiceResult(res, result);
}

export async function listVendors(_req: Request, res: Response) {
  const result = await vendorService.listVendors();
  sendServiceResult(res, result);
}

export async function createVendor(req: Request, res: Response) {
  const dto = Object.assign(new CreateVendorDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await vendorService.createVendor(dto);
  sendServiceResult(res, result);
}

export async function patchVendor(req: Request, res: Response) {
  const dto = Object.assign(new PatchVendorDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await vendorService.patchVendor(paramId(req, "id"), dto);
  sendServiceResult(res, result);
}

export async function deleteVendor(req: Request, res: Response) {
  const dto = Object.assign(new MongoIdParamDto(), { id: paramId(req, "id") ?? "" });
  await validateOrThrow(dto);
  const result = await vendorService.deleteVendor(dto);
  sendServiceResult(res, result);
}

export async function listStatuses(req: Request, res: Response) {
  const qCategory = req.query["category"];
  const qIncludeInactive = req.query["includeInactive"];
  const category =
    typeof qCategory === "string"
      ? qCategory
      : Array.isArray(qCategory) && typeof qCategory[0] === "string"
        ? qCategory[0]
        : undefined;
  const includeInactive =
    qIncludeInactive === "1" ||
    qIncludeInactive === "true" ||
    (Array.isArray(qIncludeInactive) &&
      (qIncludeInactive.includes("1") || qIncludeInactive.includes("true")));
  const result = await statusService.listStatuses(category, includeInactive);
  sendServiceResult(res, result);
}

export async function importVendorCsv(req: Request, res: Response) {
  const file = req.file;
  if (!file?.buffer) {
    sendServiceResult(res, {
      success: false,
      code: 400,
      message: "CSV file is required",
      data: {},
    });
    return;
  }
  let rows: ReturnType<typeof vendorService.parseVendorCsvBuffer>;
  try {
    rows = vendorService.parseVendorCsvBuffer(file.buffer);
  } catch {
    sendServiceResult(res, {
      success: false,
      code: 400,
      message: "Could not parse CSV file",
      data: {},
    });
    return;
  }
  const result = await vendorService.importVendors(rows ?? []);
  sendServiceResult(res, result);
}

export async function getListVendorCategory(_req: Request, res: Response) {
  const result = await statusService.getListVendorCategory();
  sendServiceResult(res, result);
}

export async function listStatusCategories(_req: Request, res: Response) {
  const result = await statusService.listStatusCategories();
  sendServiceResult(res, result);
}

export async function createStatus(req: Request, res: Response) {
  const dto = Object.assign(new CreateStatusDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await statusService.createStatus(dto);
  sendServiceResult(res, result);
}

export async function patchStatus(req: Request, res: Response) {
  const dto = Object.assign(new PatchStatusDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await statusService.patchStatus(paramId(req, "id"), dto);
  sendServiceResult(res, result);
}

export async function deleteStatus(req: Request, res: Response) {
  const dto = Object.assign(new MongoIdParamDto(), { id: paramId(req, "id") ?? "" });
  await validateOrThrow(dto);
  const result = await statusService.deleteStatus(dto);
  sendServiceResult(res, result);
}
