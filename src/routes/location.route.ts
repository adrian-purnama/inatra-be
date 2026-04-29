import { Router } from "express";
import * as locationController from "../controllers/location.controller.js";
import { requirePermission } from "../middleware/requirePermission.js";

export const locationRouter = Router();

locationRouter.use(requirePermission);

locationRouter.get("/", locationController.listLocations);
locationRouter.get("/choices", locationController.getLocationChoices);
locationRouter.post("/", locationController.createLocation);
locationRouter.patch("/:id", locationController.patchLocation);
locationRouter.delete("/:id", locationController.deleteLocation);
locationRouter.post("/sync", locationController.syncLocations);
