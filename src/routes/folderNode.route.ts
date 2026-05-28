import { Router } from "express";
import * as folderNodeController from "../controllers/folderNode.controller.js";
import { requirePermission } from "../middleware/requirePermission.js";

export const folderNodeRouter = Router();

folderNodeRouter.use(requirePermission);

folderNodeRouter.get("/", folderNodeController.listFolderNodes);
folderNodeRouter.post("/", folderNodeController.createFolderNode);
folderNodeRouter.patch("/:id", folderNodeController.patchFolderNode);
folderNodeRouter.delete("/:id", folderNodeController.deleteFolderNode);

