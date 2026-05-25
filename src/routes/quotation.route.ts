import { Router } from "express";
import * as quotationController from "../controllers/quotation.controller.js";
import { requirePermission } from "../middleware/requirePermission.js";

export const quotationRouter = Router();

quotationRouter.use(requirePermission);

quotationRouter.get("/approvers", quotationController.listQuotationApprovers);
quotationRouter.get("/", quotationController.listQuotations);
quotationRouter.get("/:id/pdf", quotationController.exportQuotationPdf);
quotationRouter.get("/:id", quotationController.getQuotation);
quotationRouter.post("/", quotationController.createQuotation);
quotationRouter.post(
  "/from-opportunity/:opportunityId",
  quotationController.createDraftFromOpportunity,
);
quotationRouter.post("/:id/submit", quotationController.submitQuotation);
quotationRouter.post("/:id/approve", quotationController.approveQuotation);
quotationRouter.post("/:id/reject", quotationController.rejectQuotation);
quotationRouter.post("/:id/revise", quotationController.reviseQuotation);
quotationRouter.patch("/:id", quotationController.patchQuotation);
quotationRouter.delete("/:id", quotationController.deleteQuotation);
