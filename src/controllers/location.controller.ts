import type { Request, Response } from "express";
import { sendServiceResult } from "../lib/serviceResponse.js";
import { validateOrThrow } from "../lib/errors.js";
import { CreateLocationDto } from "../dto/createLocation.dto.js";
import { PatchLocationDto } from "../dto/patchLocation.dto.js";
import { MongoIdParamDto } from "../dto/mongoIdParam.dto.js";
import * as locationService from "../services/location.service.js";

function paramId(req: Request, key: string): string | undefined {
  const raw = req.params[key];
  return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
}

export async function listLocations(req: Request, res: Response) {
  const qLevel = req.query["level"];
  const qParentId = req.query["parentId"];
  const qIncludeInactive = req.query["includeInactive"];
  const level =
    typeof qLevel === "string"
      ? qLevel
      : Array.isArray(qLevel) && typeof qLevel[0] === "string"
        ? qLevel[0]
        : undefined;
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

  const query: { level?: string; parentId?: string; includeInactive?: boolean } = {
    includeInactive,
  };
  if (level !== undefined) query.level = level;
  if (parentId !== undefined) query.parentId = parentId;
  const result = await locationService.listLocations(query);
  sendServiceResult(res, result);
}

export async function getLocationChoices(req: Request, res: Response) {
  const qCountryId = req.query["countryId"];
  const qProvinceId = req.query["provinceId"];
  const qRegencyId = req.query["regencyId"];
  const qIncludeInactive = req.query["includeInactive"];
  const countryId =
    typeof qCountryId === "string"
      ? qCountryId
      : Array.isArray(qCountryId) && typeof qCountryId[0] === "string"
        ? qCountryId[0]
        : undefined;
  const provinceId =
    typeof qProvinceId === "string"
      ? qProvinceId
      : Array.isArray(qProvinceId) && typeof qProvinceId[0] === "string"
        ? qProvinceId[0]
        : undefined;
  const regencyId =
    typeof qRegencyId === "string"
      ? qRegencyId
      : Array.isArray(qRegencyId) && typeof qRegencyId[0] === "string"
        ? qRegencyId[0]
        : undefined;
  const includeInactive =
    qIncludeInactive === "1" ||
    qIncludeInactive === "true" ||
    (Array.isArray(qIncludeInactive) &&
      (qIncludeInactive.includes("1") || qIncludeInactive.includes("true")));
  const query: {
    countryId?: string;
    provinceId?: string;
    regencyId?: string;
    includeInactive?: boolean;
  } = {
    includeInactive,
  };
  if (countryId !== undefined) query.countryId = countryId;
  if (provinceId !== undefined) query.provinceId = provinceId;
  if (regencyId !== undefined) query.regencyId = regencyId;
  const result = await locationService.getLocationChoices(query);
  sendServiceResult(res, result);
}

export async function createLocation(req: Request, res: Response) {
  const dto = Object.assign(new CreateLocationDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await locationService.createLocation(dto);
  sendServiceResult(res, result);
}

export async function patchLocation(req: Request, res: Response) {
  const dto = Object.assign(new PatchLocationDto(), req.body ?? {});
  await validateOrThrow(dto);
  const result = await locationService.patchLocation(paramId(req, "id"), dto);
  sendServiceResult(res, result);
}

export async function deleteLocation(req: Request, res: Response) {
  const dto = Object.assign(new MongoIdParamDto(), { id: paramId(req, "id") ?? "" });
  await validateOrThrow(dto);
  const result = await locationService.deleteLocation(dto);
  sendServiceResult(res, result);
}

export async function syncLocations(_req: Request, res: Response) {
  const result = await locationService.syncLocationsFromWilayahId();
  sendServiceResult(res, result);
}
