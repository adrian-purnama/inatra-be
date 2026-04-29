import "reflect-metadata";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./env.js";
import { logger, slimPinoHttpOpts } from "./lib/logger.js";
import mongoose from "mongoose";
import { authRouter } from "./routes/auth.route.js";
import { brandingRouter } from "./routes/branding.route.js";
import { adminRouter } from "./routes/admin.route.js";
import { opportunityRouter } from "./routes/opportunity.route.js";
import { dataEntryRouter } from "./routes/dataEntry.route.js";
import { locationRouter } from "./routes/location.route.js";
import { publicFilesRouter } from "./routes/publicFiles.route.js";
import { errorHandler } from "./middleware/errorHandler.js";
import {
  ensureAppConfig,
  ensureAuthRoutePermissionSources,
} from "./lib/ensureAppConfig.js";
import { ensureRbacPermissionRows } from "./lib/ensureRbacPermissionRows.js";
import { setRbacHttpMounts } from "./lib/listHttpRoutes.js";

const app = express();

/**
 * Express defaults to weak ETags on `res.json`. Browsers send `If-None-Match` on reload; when the
 * body matches, Express answers **304** and drops the body. Middleware and handlers still ran —
 * only the final `send` step changes status. For JSON APIs we turn this off so clients always get
 * a normal 200 + body and logs match “real” responses.
 */
app.set("etag", false);

/** Include `/admin` in RBAC route coverage (cannot be wired inside `listHttpRoutes` — circular import). */
setRbacHttpMounts([
  { prefix: "/auth", router: authRouter },
  { prefix: "/branding", router: brandingRouter },
  { prefix: "/admin", router: adminRouter },
  { prefix: "/opportunity", router: opportunityRouter },
  { prefix: "/data-entry", router: dataEntryRouter },
  { prefix: "/location", router: locationRouter },
  { prefix: "/public-files", router: publicFilesRouter },
]);
const port = env.port;

if (env.nodeEnv === "production") {
  app.set("trust proxy", 1);
}

app.use(
  cors({
    origin: env.feLink ? env.feLink : true,
    credentials: Boolean(env.feLink),
  }),
);
app.use(pinoHttp({ logger, ...slimPinoHttpOpts }));
/**
 * Public file streams must be mounted **before** `helmet()`. Otherwise Helmet adds
 * `Cross-Origin-Resource-Policy: same-origin` (and related headers) and the browser blocks
 * `<img src="http://api:4000/public-files/…">` from the SPA on another origin (e.g. Vite :5173).
 * `FE_LINK` / CORS does not fix that — CORP is on the **file** response, not fetch preflight.
 */
app.use("/public-files", publicFilesRouter);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use("/auth", authRouter);
app.use("/branding", brandingRouter);
app.use("/admin", adminRouter);
app.use("/opportunity", opportunityRouter);
app.use("/data-entry", dataEntryRouter);
app.use("/location", locationRouter);
app.use(errorHandler);

logger.info("Starting server");
mongoose
  .connect(env.mongodbUri, {
    dbName: "app",
  })
  .then(async () => {
    logger.info("MongoDB connected");
    await ensureAppConfig();
    await ensureRbacPermissionRows();
    await ensureAuthRoutePermissionSources();

    app.listen(port, () => {
      logger.info({ port }, "HTTP server listening");
    });
  })
  .catch((err: unknown) => {
    logger.error({ err }, "MongoDB connection failed");
    process.exit(1);
  });

process.on("unhandledRejection", (reason: unknown) => {
  logger.error({ err: reason }, "unhandledRejection");
});


process.on("uncaughtException", (err: Error) => {
  logger.error({ err }, "uncaughtException");
  process.exit(1);
});

