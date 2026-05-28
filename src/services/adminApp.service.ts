import type { ServiceResult } from "../lib/serviceResponse.js";
import { failResult, okResult } from "../lib/serviceResponse.js";
import mongoose from "mongoose";
import type { PatchAppDto } from "../dto/patchApp.dto.js";
import {
  publicFileIdFromUrl,
  replacePublicAsset,
  updatePublicAssetFile,
} from "../lib/publicAssetFiles.js";
import { AppModel } from "../models/app.model.js";

export type AppSettingsOut = {
  id: string;
  appName: string;
  appLogo: string;
  openRegister: boolean;
  openLogin: boolean;
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

function toOut(doc: {
  _id: unknown;
  appName: string;
  appLogo: string;
  openRegister: boolean;
  openLogin: boolean;
  personSuffix?: string[] | null;
  companyInformation?: {
    companyName?: string | null;
    companyAddress?: string | null;
    companyPhone?: string | null;
    companyEmail?: string | null;
    companyWebsite?: string | null;
  } | null;
  quotationInformation?: {
    termsOfPayment?: string[] | null;
    termsOfDelivery?: string[] | null;
    termsOfWarranty?: string[] | null;
  } | null;
}): AppSettingsOut {
  return {
    id: String(doc._id),
    appName: doc.appName,
    appLogo: doc.appLogo,
    openRegister: Boolean(doc.openRegister),
    openLogin: Boolean(doc.openLogin),
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
  };
}

function normalizeStringArray(input: string[] | undefined): string[] | undefined {
  if (input === undefined) return undefined;
  const out = input
    .map((v) => String(v ?? "").trim())
    .filter((v) => v.length > 0);
  return out;
}

export async function fetchAppSettings(): Promise<ServiceResult<AppSettingsOut>> {
  const doc = await AppModel.findOne()
    .select(
      [
        "appName",
        "appLogo",
        "openRegister",
        "openLogin",
        "personSuffix",
        "companyInformation",
        "quotationInformation",
      ].join(" "),
    )
    .lean()
    .exec();
  if (doc == null) {
    return failResult(503, "App configuration not ready");
  }
  return okResult(200, "OK", toOut(doc));
}

export async function patchAppSettings(
  dto: PatchAppDto,
): Promise<ServiceResult<AppSettingsOut>> {
  const $set: Record<string, unknown> = {};
  if (dto.appName !== undefined) $set.appName = dto.appName.trim();
  if (dto.appLogo !== undefined) $set.appLogo = dto.appLogo.trim();
  if (dto.openRegister !== undefined) $set.openRegister = dto.openRegister;
  if (dto.openLogin !== undefined) $set.openLogin = dto.openLogin;
  if (dto.personSuffix !== undefined) $set.personSuffix = normalizeStringArray(dto.personSuffix) ?? [];

  if (dto.companyInformation !== undefined) {
    const ci = dto.companyInformation;
    if (ci.companyName !== undefined) $set["companyInformation.companyName"] = ci.companyName.trim();
    if (ci.companyAddress !== undefined)
      $set["companyInformation.companyAddress"] = ci.companyAddress.trim();
    if (ci.companyPhone !== undefined) $set["companyInformation.companyPhone"] = ci.companyPhone.trim();
    if (ci.companyEmail !== undefined) $set["companyInformation.companyEmail"] = ci.companyEmail.trim();
    if (ci.companyWebsite !== undefined)
      $set["companyInformation.companyWebsite"] = ci.companyWebsite.trim();
  }

  if (dto.quotationInformation !== undefined) {
    const qi = dto.quotationInformation;
    if (qi.termsOfPayment !== undefined)
      $set["quotationInformation.termsOfPayment"] = normalizeStringArray(qi.termsOfPayment) ?? [];
    if (qi.termsOfDelivery !== undefined)
      $set["quotationInformation.termsOfDelivery"] = normalizeStringArray(qi.termsOfDelivery) ?? [];
    if (qi.termsOfWarranty !== undefined)
      $set["quotationInformation.termsOfWarranty"] = normalizeStringArray(qi.termsOfWarranty) ?? [];
  }

  if (Object.keys($set).length === 0) {
    return failResult(
      400,
      "Provide at least one setting field to update",
    );
  }

  await AppModel.updateOne({} as any, { $set }, { runValidators: true }).exec();
  const updated = await AppModel.findOne()
    .select(
      [
        "appName",
        "appLogo",
        "openRegister",
        "openLogin",
        "personSuffix",
        "companyInformation",
        "quotationInformation",
      ].join(" "),
    )
    .lean()
    .exec();

  if (updated == null) {
    return failResult(503, "App configuration not ready");
  }

  return okResult(200, "OK", toOut(updated));
}

/**
 * Upload a new logo to GridFS, remove previous file if it was served from `/public-files/:id`,
 * and set `appLogo` to the new public URL.
 */
export async function uploadAppLogoImage(file: {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}): Promise<ServiceResult<AppSettingsOut>> {
  if (!file.buffer?.length) {
    return failResult(400, "Empty file");
  }
  const allowedMimeTypes = new Set(["image/jpeg", "image/png"]);
  if (!allowedMimeTypes.has(String(file.mimetype).toLowerCase())) {
    return failResult(400, "Only JPG, JPEG, and PNG files are allowed");
  }

  const app = await AppModel.findOne().lean().exec();
  if (app == null) {
    return failResult(503, "App configuration not ready");
  }

  const updated = await (async () => {
    const session = await mongoose.startSession();
    try {
      let result: {
        _id: unknown;
        appName: string;
        appLogo: string;
        openRegister: boolean;
        openLogin: boolean;
        personSuffix?: string[] | null;
        companyInformation?: unknown;
        quotationInformation?: unknown;
      } | null = null;
      await session.withTransaction(async () => {
        const currentApp = await AppModel.findOne().session(session).lean().exec();
        if (currentApp == null) {
          throw new Error("App configuration not ready");
        }
        const previousId = publicFileIdFromUrl(currentApp.appLogo);
        const uploaded = previousId
          ? (
              await updatePublicAssetFile(
                previousId,
                "single-use",
                {
                  buffer: file.buffer,
                  filename: file.originalname,
                  contentType: file.mimetype,
                  isPublic: true,
                },
                { session },
              )
            ).asset
          : await replacePublicAsset(
              previousId,
              {
                buffer: file.buffer,
                filename: file.originalname,
                contentType: file.mimetype,
                isPublic: true,
              },
              { session },
            );
        await AppModel.updateOne(
          {} as any,
          { $set: { appLogo: uploaded.url } },
          { runValidators: true, session },
        ).exec();
        result = await AppModel.findOne()
          .session(session)
          .select(
            [
              "appName",
              "appLogo",
              "openRegister",
              "openLogin",
              "personSuffix",
              "companyInformation",
              "quotationInformation",
            ].join(" "),
          )
          .lean()
          .exec();
      });
      return result;
    } finally {
      await session.endSession();
    }
  })();

  if (updated == null) {
    return failResult(503, "App configuration not ready");
  }

  return okResult(200, "OK", toOut(updated));
}
