import { AppModel, type IApp } from "../models/app.model.js";
import { PermissionModel } from "../models/permission.model.js";
import { logger } from "./logger.js";
import {
  ALL_USER_AUTH_ROUTES,
  GUEST_AUTH_ROUTES,
} from "./authPublicRoutes.js";
import {
  autoPermissionDescription,
  normalizeHttpMethod,
  suggestPermissionName,
} from "./listHttpRoutes.js";

/** Ensures a single app config document exists (creates defaults on first run). */
export async function ensureAppConfig(): Promise<void> {
  const existing = await AppModel.findOne().exec();
  if (existing) {
    logger.info(
      { appName: existing.appName, id: String(existing._id) },
      "App config loaded",
    );
    return;
  }

  logger.info("No app config found; creating default");
  // `AppDto` is for API validation; `create` returns a Mongoose `AppDocument`.
  const created: IApp = await AppModel.create({
    appName: "Default App",
    appLogo: "https://placehold.co/600x400",
    openRegister: true,
    openLogin: true,
    personSuffix: [],
    companyInformation: {
      companyName: "",
      companyAddress: "",
      companyPhone: "",
      companyEmail: "",
      companyWebsite: "",
    },
    quotationInformation: {
      termsOfPayment: [],
      termsOfDelivery: [],
      termsOfWarranty: [],
    },
  });
  logger.info(
    { appName: created.appName, id: String(created._id) },
    "Default app config created",
  );
}

/**
 * After `ensureRbacPermissionRows`, ensures auth bootstrap routes are public in the DB
 * (`all_guest` / `all_user`) so RBAC admin UI matches runtime behavior.
 */
export async function ensureAuthRoutePermissionSources(): Promise<void> {
  let guestCreated = 0;
  let guestUpgraded = 0;
  for (const { path, method } of GUEST_AUTH_ROUTES) {
    const m = normalizeHttpMethod(method);
    const exists = await PermissionModel.exists({ path, method: m }).exec();
    if (!exists) {
      await PermissionModel.create({
        name: suggestPermissionName(path, method),
        description: autoPermissionDescription(path, method),
        path,
        method: m,
        source: "all_guest",
      });
      guestCreated += 1;
      continue;
    }
    const res = await PermissionModel.updateMany(
      { path, method: m },
      { $set: { source: "all_guest" } },
    ).exec();
    guestUpgraded += res.modifiedCount ?? 0;
  }

  let allUserCreated = 0;
  let allUserUpgraded = 0;
  for (const { path, method } of ALL_USER_AUTH_ROUTES) {
    const m = normalizeHttpMethod(method);
    const exists = await PermissionModel.exists({ path, method: m }).exec();
    if (!exists) {
      await PermissionModel.create({
        name: suggestPermissionName(path, method),
        description: autoPermissionDescription(path, method),
        path,
        method: m,
        source: "all_user",
      });
      allUserCreated += 1;
      continue;
    }
    const res = await PermissionModel.updateMany(
      { path, method: m },
      { $set: { source: "all_user" } },
    ).exec();
    allUserUpgraded += res.modifiedCount ?? 0;
  }

  logger.info(
    {
      guestCreated,
      guestUpgraded,
      allUserCreated,
      allUserUpgraded,
    },
    "Auth route permission sources ensured (all_guest / all_user)",
  );
}
