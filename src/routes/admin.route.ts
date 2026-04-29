import { Router } from "express";
import * as adminController from "../controllers/admin.controller.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { adminLogoUpload } from "../lib/upload/adminLogoUpload.js";

export const adminRouter = Router();

adminRouter.use(requirePermission);

// singleton app settings (name, logo URL, openRegister / openLogin)
adminRouter.get("/app", adminController.getApp);
adminRouter.post("/app/logo", adminLogoUpload, adminController.uploadAppLogo);
adminRouter.patch("/app", adminController.patchApp);

// basic route info
adminRouter.get("/rbac/routes", adminController.getDiscoveredRoutes);
adminRouter.get("/rbac/problems", adminController.getRbacProblems);
adminRouter.delete(
  "/rbac/problems/orphan-permissions",
  adminController.deleteAllOrphanPermissions,
);

//crud for permission
adminRouter.get("/rbac/permissions", adminController.listPermissions);
adminRouter.get("/rbac/permissions/:id", adminController.getPermission);
adminRouter.post("/rbac/permissions", adminController.createPermission);
adminRouter.patch("/rbac/permissions/:id", adminController.patchPermission);
adminRouter.delete("/rbac/permissions/:id", adminController.deletePermission);

//crud for role
adminRouter.get("/rbac/roles", adminController.listRoles);
adminRouter.get("/rbac/roles/:id", adminController.getRole);
adminRouter.post("/rbac/roles", adminController.createRole);
adminRouter.patch("/rbac/roles/:id", adminController.patchRole);
adminRouter.delete("/rbac/roles/:id", adminController.deleteRole);

// users
adminRouter.get("/users", adminController.listUsers);
adminRouter.patch("/users/:id", adminController.patchUser);

