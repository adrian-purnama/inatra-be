import { AppModel, type IApp } from "../models/app.model.js";
import { PermissionModel } from "../models/permission.model.js";
import { logger } from "./logger.js";
import { normalizeHttpMethod } from "./listHttpRoutes.js";

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
  });
  logger.info(
    { appName: created.appName, id: String(created._id) },
    "Default app config created",
  );
}

/** Unauthenticated auth endpoints — `requirePermission` treats `all_guest` as public. */
const GUEST_AUTH: { path: string; method: string }[] = [
  { path: "/auth/send-otp", method: "POST" },
  { path: "/auth/register", method: "POST" },
  { path: "/auth/login", method: "POST" },
];

/** Session validation — any valid JWT (`all_user`), no role permission required. */
const ALL_USER_AUTH: { path: string; method: string }[] = [
  { path: "/auth/me", method: "GET" },
  { path: "/auth/validate", method: "GET" },
];

/**
 * After `ensureRbacPermissionRows`, bumps auth-related rows from seeded `auto` to the right
 * `source` so guests can register/login and any logged-in user can hit `/me`.
 * Does not overwrite `custom` rows.
 */
export async function ensureAuthRoutePermissionSources(): Promise<void> {
  let guest = 0;
  for (const { path, method } of GUEST_AUTH) {
    const m = normalizeHttpMethod(method);
    const res = await PermissionModel.updateMany(
      { path, method: m, source: "auto" },
      { $set: { source: "all_guest" } },
    ).exec();
    guest += res.modifiedCount ?? 0;
  }

  let allUser = 0;
  for (const { path, method } of ALL_USER_AUTH) {
    const m = normalizeHttpMethod(method);
    const res = await PermissionModel.updateMany(
      { path, method: m, source: "auto" },
      { $set: { source: "all_user" } },
    ).exec();
    allUser += res.modifiedCount ?? 0;
  }

  logger.info(
    { guestUpgraded: guest, allUserUpgraded: allUser },
    "Auth route permission sources ensured (auto → all_guest / all_user)",
  );
}
