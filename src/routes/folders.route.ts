import { Router } from "express";
import { requirePermission } from "../middleware/requirePermission.js";
import * as foldersController from "../controllers/folders.controller.js";

export const foldersRouter = Router();

foldersRouter.use(requirePermission);

foldersRouter.get("/:namespace", foldersController.listFolders);
foldersRouter.post("/:namespace", foldersController.createFolder);
foldersRouter.patch("/:namespace/:id", foldersController.patchFolder);
foldersRouter.post("/:namespace/:id/rename-preview", foldersController.previewRenameFolder);
foldersRouter.post("/:namespace/:id/rename-apply", foldersController.applyRenameFolder);
foldersRouter.delete("/:namespace/:id", foldersController.deleteFolder);

