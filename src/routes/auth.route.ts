import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { requirePermission } from "../middleware/requirePermission.js";

export const authRouter = Router();
authRouter.use(requirePermission);


authRouter.post("/send-otp", authController.sendOtp);
authRouter.post("/register", authController.register);
authRouter.post("/login" ,authController.login);

authRouter.get(
  "/me",
  authController.me,
);
authRouter.get(
  "/validate",
  authController.me,
);
