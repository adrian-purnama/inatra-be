import type { Request, Response } from "express";
import { sendServiceResult } from "../lib/serviceResponse.js";
import * as appInfoService from "../services/appInfo.service.js";

export async function getAppInfo(_req: Request, res: Response) {
  const result = await appInfoService.getAppInfo();
  sendServiceResult(res, result);
}

