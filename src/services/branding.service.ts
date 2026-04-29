import type { ServiceResult } from "../lib/serviceResponse.js";
import { failResult, okResult } from "../lib/serviceResponse.js";
import { AppModel } from "../models/app.model.js";

export type BrandingPayload = {
  appName: string;
  appLogo: string;
  openRegister: boolean;
  openLogin: boolean;
};

export async function getBranding(): Promise<ServiceResult<BrandingPayload>> {
  const app = await AppModel.findOne()
    .select("appName appLogo openRegister openLogin")
    .lean()
    .exec();

  if (app == null) {
    return failResult(503, "App configuration not ready");
  }

  return okResult(200, "OK", {
    appName: app.appName,
    appLogo: app.appLogo,
    openRegister: Boolean(app.openRegister),
    openLogin: Boolean(app.openLogin),
  });
}
