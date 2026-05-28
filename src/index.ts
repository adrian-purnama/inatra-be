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
import { quotationRouter } from "./routes/quotation.route.js";
import { appInfoRouter } from "./routes/appInfo.route.js";
import { folderNodeRouter } from "./routes/folderNode.route.js";
import { foldersRouter } from "./routes/folders.route.js";
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
  { prefix: "/app", router: appInfoRouter },
  { prefix: "/opportunity", router: opportunityRouter },
  { prefix: "/data-entry", router: dataEntryRouter },
  { prefix: "/folder-node", router: folderNodeRouter },
  { prefix: "/folders", router: foldersRouter },
  { prefix: "/location", router: locationRouter },
  { prefix: "/quotation", router: quotationRouter },
  { prefix: "/public-files", router: publicFilesRouter },
]);
const port = env.port;

if (env.nodeEnv === "production") {
  app.set("trust proxy", 1);
}

const normalizeOrigin = (s: string) => s.trim().replace(/\/+$/, "");
const allowedOrigins = String(env.feLink ?? "")
  .trim()
  .split(",")
  .map(normalizeOrigin)
  .filter(Boolean);

logger.info(
  {
    nodeEnv: env.nodeEnv,
    feLinkRaw: env.feLink || "",
    allowedOrigins,
  },
  "CORS config",
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Non-browser clients (curl/postman) may not send Origin → allow.
      if (!origin) return callback(null, true);

      // Support comma-separated allowlist (e.g. "https://a.com,https://b.com")
      if (allowedOrigins.length === 0) return callback(null, true);

      const incoming = normalizeOrigin(origin);
      const ok = allowedOrigins.includes(incoming);
      if (!ok) {
        // Only log blocks to avoid noisy logs.
        logger.warn({ origin: incoming, allowedOrigins }, "CORS blocked origin");
      }
      return callback(null, ok);
    },
    credentials: true,
  }),
);

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    status: "ok",
    nodeEnv: env.nodeEnv,
    ts: new Date().toISOString(),
  });
});
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
app.use("/app", appInfoRouter);
app.use("/opportunity", opportunityRouter);
app.use("/data-entry", dataEntryRouter);
app.use("/folder-node", folderNodeRouter);
app.use("/folders", foldersRouter);
app.use("/location", locationRouter);
app.use("/quotation", quotationRouter);
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

