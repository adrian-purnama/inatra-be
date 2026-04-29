import type { Request, Response } from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { env } from "../env.js";
import {
  getPublicAssetGridFSBucket,
  PUBLIC_ASSET_GRIDFS_BUCKET_NAME,
  PublicAssetModel,
} from "../models/publicAsset.model.js";
import { logger } from "../lib/logger.js";
import {
  buildPublicAssetFileUrlWithAccessToken,
  createPublicFileAccessToken,
  verifyPublicFileAccessToken,
} from "../lib/publicAssetFiles.js";

/**
 * Stream a GridFS file saved via `uploadPublicAssetBuffer` (`GET /public-files/:fileId`).
 */
export async function servePublicFile(req: Request, res: Response): Promise<void> {
  logger.debug(
    {
      userId: req.auth?.sub ?? null,
      fileId: req.params["fileId"],
      hasBearer:
        typeof req.headers.authorization === "string" &&
        req.headers.authorization.startsWith("Bearer "),
      hasAccessQuery: typeof req.query["access"] === "string",
    },
    "Serving public file",
  );
  const raw = req.params["fileId"];
  const fileId =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  if (!fileId || !mongoose.isValidObjectId(fileId)) {
    res.status(400).json({ success: false, message: "Invalid file id" });
    return;
  }

  const oid = new mongoose.Types.ObjectId(fileId);
  const db = mongoose.connection.db;
  if (db == null) {
    res.status(503).json({ success: false, message: "Database unavailable" });
    return;
  }

  const [meta, gridFile] = await Promise.all([
    PublicAssetModel.findOne({ fileId: oid } as any).lean().exec(),
    db
      .collection(`${PUBLIC_ASSET_GRIDFS_BUCKET_NAME}.files`)
      .findOne<{
        contentType?: string;
        metadata?: { contentType?: string };
      }>({ _id: oid }),
  ]);
  if (meta == null && gridFile == null) {
    res.status(404).json({ success: false, message: "File not found" });
    return;
  }

  const isPublic = Boolean(meta?.isPublic);
  const accessQuery = req.query["access"];
  const accessToken =
    typeof accessQuery === "string"
      ? accessQuery
      : Array.isArray(accessQuery) && typeof accessQuery[0] === "string"
        ? accessQuery[0]
        : null;
  const accessTokenPayload = verifyPublicFileAccessToken(accessToken);
  logger.debug(
    {
      fileId,
      isPublic,
      hasAccessToken: Boolean(accessToken),
      accessTokenValidForFile: Boolean(
        accessTokenPayload && accessTokenPayload.fileId === fileId,
      ),
      accessTokenUserId: accessTokenPayload?.userId ?? null,
    },
    "Public file access mode check",
  );
  if (!isPublic) {
    if (accessTokenPayload && accessTokenPayload.fileId === fileId) {
      const acl = (meta?.availableTo ?? []).map(String);
      const tokenUserId = accessTokenPayload.userId;
      logger.debug(
        {
          fileId,
          mode: "signed-token",
          tokenUserId: tokenUserId ?? null,
          aclCount: acl.length,
          aclIncludesUser: Boolean(tokenUserId && acl.includes(tokenUserId)),
        },
        "Private file ACL check via signed token",
      );
      if (tokenUserId && acl.includes(tokenUserId)) {
        logger.debug(
          { fileId, userId: tokenUserId },
          "Serving private file with signed access token",
        );
      } else {
        res.status(403).json({ success: false, message: "Forbidden" });
        return;
      }
    } else {
    const hdr = req.headers.authorization;
    const token =
      typeof hdr === "string" && hdr.startsWith("Bearer ")
        ? hdr.slice(7).trim()
        : null;
    if (!token || !env.jwtSecret) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }
    let userId = "";
    try {
      const payload = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
      if (typeof payload.sub !== "string" || !payload.sub) {
        res.status(401).json({ success: false, message: "Invalid token" });
        return;
      }
      userId = payload.sub;
    } catch {
      res.status(401).json({ success: false, message: "Invalid or expired token" });
      return;
    }
    const acl = (meta?.availableTo ?? []).map(String);
    logger.debug(
      {
        fileId,
        mode: "bearer",
        userId,
        aclCount: acl.length,
        aclIncludesUser: acl.includes(userId),
      },
      "Private file ACL check via bearer token",
    );
    if (!acl.includes(userId)) {
      res.status(403).json({ success: false, message: "Forbidden" });
      return;
    }
    }
  }

  const contentType =
    meta?.contentType ??
    gridFile?.metadata?.contentType ??
    gridFile?.contentType ??
    "application/octet-stream";

  const bucket = getPublicAssetGridFSBucket();
  const downloadStream = bucket.openDownloadStream(oid);

  downloadStream.on("error", () => {
    if (!res.headersSent) {
      res.status(404).json({ success: false, message: "File not found" });
    }
  });

  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=86400");

  downloadStream.pipe(res);
}

export async function resolvePublicFiles(req: Request, res: Response): Promise<void> {
  const bodyFileIds: unknown[] = Array.isArray(req.body?.fileIds) ? req.body.fileIds : [];
  const normalizedIds = bodyFileIds.map((x) => String(x).trim());
  const fileIds: string[] = [...new Set(normalizedIds)].filter((x) =>
    mongoose.isValidObjectId(x),
  );

  if (fileIds.length === 0) {
    res.status(200).json({ success: true, message: "OK", data: { items: [] } });
    return;
  }

  let authUserId = req.auth?.sub;
  if (!authUserId) {
    const hdr = req.headers.authorization;
    const bearer =
      typeof hdr === "string" && hdr.startsWith("Bearer ")
        ? hdr.slice(7).trim()
        : "";
    if (bearer && env.jwtSecret) {
      try {
        const payload = jwt.verify(bearer, env.jwtSecret) as jwt.JwtPayload;
        if (typeof payload.sub === "string" && payload.sub) {
          authUserId = payload.sub;
        }
      } catch {
        authUserId = undefined;
      }
    }
  }
  logger.debug({ authUserId: authUserId ?? null }, "Resolve auth user context");
  const docs = await PublicAssetModel.find({
    fileId: { $in: fileIds.map((x) => new mongoose.Types.ObjectId(x)) },
  } as any)
    .select("fileId filename extension contentType isPublic availableTo")
    .lean()
    .exec();
  logger.debug(
    { foundDocsCount: docs.length, foundFileIds: docs.map((d) => String(d.fileId)) },
    "Resolve metadata lookup result",
  );

  const byId = new Map<string, (typeof docs)[number]>(
    docs.map((d) => [String(d.fileId), d]),
  );
  const items = fileIds.flatMap((fileId) => {
    const doc = byId.get(fileId);
    if (!doc) {
      logger.debug({ fileId, reason: "metadata_missing" }, "Resolve item skipped");
      return [];
    }
    const isPublic = Boolean(doc.isPublic);
    const acl = (doc.availableTo ?? []).map(String);
    const allowed = isPublic || (authUserId ? acl.includes(authUserId) : false);

    if (!allowed) return [];
    const token = createPublicFileAccessToken(
      isPublic
        ? { fileId, userId: null }
        : authUserId
          ? { fileId, userId: authUserId }
          : { fileId },
    );
    return [
      {
        fileId,
        filename: String(doc.filename ?? ""),
        extension: String(doc.extension ?? ""),
        contentType: String(doc.contentType ?? "application/octet-stream"),
        url: buildPublicAssetFileUrlWithAccessToken(fileId, token.token),
        expiresAt: token.expiresAt,
      },
    ];
  });
  logger.debug(
    { returnedCount: items.length, returnedFileIds: items.map((x) => x.fileId) },
    "Resolve response items prepared",
  );

  res.status(200).json({ success: true, message: "OK", data: { items } });
}
