import { Router } from "express";
import * as brandingController from "../controllers/branding.controller.js";

export const brandingRouter = Router();

brandingRouter.get("/", brandingController.getBranding);
