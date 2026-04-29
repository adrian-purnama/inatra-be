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
};

function toOut(doc: {
  _id: unknown;
  appName: string;
  appLogo: string;
  openRegister: boolean;
  openLogin: boolean;
}): AppSettingsOut {
  return {
    id: String(doc._id),
    appName: doc.appName,
    appLogo: doc.appLogo,
    openRegister: Boolean(doc.openRegister),
    openLogin: Boolean(doc.openLogin),
  };
}

export async function fetchAppSettings(): Promise<ServiceResult<AppSettingsOut>> {
  const doc = await AppModel.findOne().lean().exec();
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

  if (Object.keys($set).length === 0) {
    return failResult(
      400,
      "Provide at least one of: appName, appLogo, openRegister, openLogin",
    );
  }

  await AppModel.updateOne({} as any, { $set }, { runValidators: true }).exec();
  const updated = await AppModel.findOne().lean().exec();

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
        result = await AppModel.findOne().session(session).lean().exec();
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
