import { logger } from "./logger.js";
import {
  autoPermissionDescription,
  flattenDiscoveredRoutes,
  suggestPermissionName,
} from "./listHttpRoutes.js";
import { PermissionModel } from "../models/permission.model.js";

/**
 * Ensures each discovered route has at least one permission row: if none exist for that
 * path+method, inserts one **auto** row (name + description generated).
 */
export async function ensureRbacPermissionRows(): Promise<void> {
  const flat = flattenDiscoveredRoutes();
  if (flat.length === 0) {
    logger.warn("ensureRbacPermissionRows: no routes discovered — skip");
    return;
  }

  let inserted = 0;
  for (const { path, method } of flat) {
    const exists = await PermissionModel.exists({ path, method }).exec();
    if (exists) {
      continue;
    }
    const name = suggestPermissionName(path, method);
    const description = autoPermissionDescription(path, method);
    try {
      await PermissionModel.create({
        name,
        description,
        path,
        method,
        source: "auto",
      });
      inserted += 1;
    } catch (err: unknown) {
      if (String((err as Error)?.message ?? "").includes("E11000")) {
        continue;
      }
      throw err;
    }
  }

  logger.info(
    { routes: flat.length, inserted },
    "RBAC permission rows ensured for discovered routes",
  );
}
