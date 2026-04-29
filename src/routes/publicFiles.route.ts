import express, { Router } from "express";
import * as publicFilesController from "../controllers/publicFiles.controller.js";

export const publicFilesRouter = Router();
publicFilesRouter.use(express.json({ limit: "1mb" }));

/** Embed-safe when the SPA is on another origin (e.g. Vite :5173 vs API :4000). */
publicFilesRouter.use((_req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});

/** Access is enforced in controller: public file bypasses auth, private file checks JWT user in availableTo. */
publicFilesRouter.get("/:fileId", publicFilesController.servePublicFile);
publicFilesRouter.post("/resolve", publicFilesController.resolvePublicFiles);
