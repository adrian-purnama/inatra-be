import type { ServiceResult } from "../lib/serviceResponse.js";
import { failResult, okResult } from "../lib/serviceResponse.js";
import { AppModel } from "../models/app.model.js";

export type AppInfoOut = {
  personSuffix: string[];
  companyInformation: {
    companyName: string;
    companyAddress: string;
    companyPhone: string;
    companyEmail: string;
    companyWebsite: string;
  };
  quotationInformation: {
    termsOfPayment: string[];
    termsOfDelivery: string[];
    termsOfWarranty: string[];
  };
};

export async function getAppInfo(): Promise<ServiceResult<AppInfoOut>> {
  const doc = await AppModel.findOne()
    .select(["personSuffix", "companyInformation", "quotationInformation"].join(" "))
    .lean()
    .exec();
  if (doc == null) return failResult(503, "App configuration not ready");

  return okResult(200, "OK", {
    personSuffix: (doc.personSuffix ?? []).map(String),
    companyInformation: {
      companyName: String(doc.companyInformation?.companyName ?? ""),
      companyAddress: String(doc.companyInformation?.companyAddress ?? ""),
      companyPhone: String(doc.companyInformation?.companyPhone ?? ""),
      companyEmail: String(doc.companyInformation?.companyEmail ?? ""),
      companyWebsite: String(doc.companyInformation?.companyWebsite ?? ""),
    },
    quotationInformation: {
      termsOfPayment: (doc.quotationInformation?.termsOfPayment ?? []).map(String),
      termsOfDelivery: (doc.quotationInformation?.termsOfDelivery ?? []).map(String),
      termsOfWarranty: (doc.quotationInformation?.termsOfWarranty ?? []).map(String),
    },
  });
}

