import { Router } from "express";
import * as appInfoController from "../controllers/appInfo.controller.js";

export const appInfoRouter = Router();

appInfoRouter.get("/info", appInfoController.getAppInfo);

