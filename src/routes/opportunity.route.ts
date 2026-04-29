import { Router } from "express";
import * as opportunityController from "../controllers/opportunity.controller.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { opportunityAttachmentUpload } from "../lib/upload/opportunityAttachmentUpload.js";

export const opportunityRouter = Router();

opportunityRouter.use(requirePermission);

opportunityRouter.get("/status", opportunityController.listOpportunityStatuses);
opportunityRouter.get("/headers", opportunityController.listOpportunityHeaders);
opportunityRouter.get("/details", opportunityController.listOpportunityDetails);

opportunityRouter.get("/", opportunityController.listOpportunities);
opportunityRouter.get("/:id", opportunityController.getOpportunity);
opportunityRouter.post("/", opportunityController.createOpportunity);
opportunityRouter.post(
  "/:id/attachments/upload",
  opportunityAttachmentUpload,
  opportunityController.uploadOpportunityAttachment,
);
opportunityRouter.post("/:id/attachments/link", opportunityController.linkOpportunityAttachment);
opportunityRouter.post("/:id/attachments/share", opportunityController.shareOpportunityAttachment);
opportunityRouter.delete(
  "/:id/attachments/:assetFileId",
  opportunityController.removeOpportunityAttachment,
);
opportunityRouter.patch("/:id", opportunityController.patchOpportunity);
opportunityRouter.delete("/:id", opportunityController.deleteOpportunity);
