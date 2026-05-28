import { Router } from "express";
import * as dataEntryController from "../controllers/dataEntry.controller.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { vendorCsvUpload } from "../lib/vendorCsvUpload.js";

export const dataEntryRouter = Router();

dataEntryRouter.use(requirePermission);

dataEntryRouter.get(
  "/line-of-business",
  dataEntryController.listLineOfBusiness,
);
dataEntryRouter.post(
  "/line-of-business",
  dataEntryController.createLineOfBusiness,
);
dataEntryRouter.patch(
  "/line-of-business/:id",
  dataEntryController.patchLineOfBusiness,
);
dataEntryRouter.delete(
  "/line-of-business/:id",
  dataEntryController.deleteLineOfBusiness,
);

dataEntryRouter.get(
  "/market-segment",
  dataEntryController.listMarketSegments,
);
dataEntryRouter.post(
  "/market-segment",
  dataEntryController.createMarketSegment,
);
dataEntryRouter.patch(
  "/market-segment/:id",
  dataEntryController.patchMarketSegment,
);
dataEntryRouter.delete(
  "/market-segment/:id",
  dataEntryController.deleteMarketSegment,
);

dataEntryRouter.get("/external-org", dataEntryController.listExternalOrgs);
dataEntryRouter.post(
  "/external-org",
  dataEntryController.createExternalOrg,
);
dataEntryRouter.patch(
  "/external-org/:id",
  dataEntryController.patchExternalOrg,
);
dataEntryRouter.delete(
  "/external-org/:id",
  dataEntryController.deleteExternalOrg,
);

dataEntryRouter.get("/vendor", dataEntryController.listVendors);
dataEntryRouter.post("/vendor", dataEntryController.createVendor);
dataEntryRouter.post("/vendor/import", vendorCsvUpload, dataEntryController.importVendorCsv);
dataEntryRouter.patch("/vendor/:id", dataEntryController.patchVendor);
dataEntryRouter.delete("/vendor/:id", dataEntryController.deleteVendor);

dataEntryRouter.get("/status", dataEntryController.listStatuses);
dataEntryRouter.get("/status/category", dataEntryController.listStatusCategories);
dataEntryRouter.get("/vendor-category", dataEntryController.getListVendorCategory);
dataEntryRouter.post("/status", dataEntryController.createStatus);
dataEntryRouter.patch("/status/:id", dataEntryController.patchStatus);
dataEntryRouter.delete("/status/:id", dataEntryController.deleteStatus);

dataEntryRouter.get("/product", dataEntryController.listProducts);
dataEntryRouter.post("/product", dataEntryController.createProduct);
dataEntryRouter.patch("/product/:id", dataEntryController.patchProduct);
dataEntryRouter.delete("/product/:id", dataEntryController.deleteProduct);
