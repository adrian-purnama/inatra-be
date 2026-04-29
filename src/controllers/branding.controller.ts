import type { Request, Response } from "express";
import { sendServiceResult } from "../lib/serviceResponse.js";
import * as brandingService from "../services/branding.service.js";

export async function getBranding(_req: Request, res: Response) {
  const result = await brandingService.getBranding();
  sendServiceResult(res, result);
}
