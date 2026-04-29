import { Readable } from "node:stream";
import mongoose from "mongoose";
import type { ClientSession, ObjectId } from "mongodb";
import jwt from "jsonwebtoken";
import { env } from "../env.js";
import {
  getPublicAssetGridFSBucket,
  PublicAssetModel,
} from "../models/publicAsset.model.js";

export const MAX_PUBLIC_ASSET_BYTES = 10 * 1024 * 1024;

export type UploadPublicAssetInput = {
  buffer: Buffer;
  /** Stored on GridFS; used to infer MIME/extension when missing */
  filename?: string;
  /** e.g. `image/png`; inferred from `filename` when omitted */
  contentType?: string;
  /** Public files are accessible without auth checks. */
  isPublic?: boolean;
  /** User ACL for non-public files. */
  availableTo?: string[];
  /** Optional uploader/owner user id. */
  createdBy?: string;
};

export type UploadPublicAssetResult = {
  /** Absolute URL clients can use in `<img src>` etc. */
  url: string;
  fileId: string;
  size: number;
  contentType: string;
  extension: string;
  isPublic: boolean;
  availableTo: string[];
  referenceCount: number;
  createdBy: string | null;
};

export type UpdatePublicAssetMode = "global" | "single-use";
type TxOptions = { session?: ClientSession };

const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  bmp: "image/bmp",
  avif: "image/avif",
};

function extensionFromFilename(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0) return "";
  return name.slice(i + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function guessContentType(filename: string | undefined, explicit?: string): string {
  if (explicit?.trim()) return explicit.trim().toLowerCase();
  const ext = extensionFromFilename(filename ?? "");
  return EXT_TO_MIME[ext] ?? "application/octet-stream";
}

/**
 * Public base URL for this API (no trailing slash). From `BE_LINK` in `.env` (`process.env.BE_LINK`).
 */
export function getPublicApiBaseUrl(): string {
  const fromEnv = env.beLink.replace(/\/$/, "").trim();
  if (!fromEnv) {
    throw new Error(
      "BE_LINK must be set in .env (public API base URL, no trailing slash; e.g. http://localhost:4000)",
    );
  }
  return fromEnv;
}

/** Path segment only — `/public-files/:id` */
export const PUBLIC_FILES_PATH_PREFIX = "/public-files" as const;
const DEFAULT_FILE_ACCESS_TOKEN_TTL_SEC = 300;

/**
 * If `url` was produced by {@link buildPublicAssetFileUrl}, returns the GridFS file id for replace/delete.
 */
export function publicFileIdFromUrl(url: string | undefined | null): string | null {
  if (url == null || typeof url !== "string") return null;
  const m = url.trim().match(/\/public-files\/([a-f\d]{24})\b/i);
  return m?.[1] ?? null;
}

/**
 * Full URL to serve a file uploaded via {@link uploadPublicAssetBuffer}.
 */
export function buildPublicAssetFileUrl(fileId: string): string {
  const id = String(fileId).trim();
  return `${getPublicApiBaseUrl()}${PUBLIC_FILES_PATH_PREFIX}/${id}`;
}

export function buildPublicAssetFileUrlWithAccessToken(
  fileId: string,
  accessToken: string,
): string {
  const id = String(fileId).trim();
  return `${getPublicApiBaseUrl()}${PUBLIC_FILES_PATH_PREFIX}/${id}?access=${encodeURIComponent(accessToken)}`;
}

export function createPublicFileAccessToken(input: {
  fileId: string;
  userId?: string | null;
  ttlSec?: number;
}): { token: string; expiresAt: string } {
  if (!env.jwtSecret) {
    throw new Error("JWT_SECRET is not configured");
  }
  if (!mongoose.isValidObjectId(input.fileId)) {
    throw new Error("Invalid file id");
  }
  const ttlSec = Math.max(10, Number(input.ttlSec ?? DEFAULT_FILE_ACCESS_TOKEN_TTL_SEC) || DEFAULT_FILE_ACCESS_TOKEN_TTL_SEC);
  const token = jwt.sign(
    {
      typ: "public_file_access",
      fileId: String(input.fileId),
      ...(input.userId ? { sub: String(input.userId) } : {}),
    },
    env.jwtSecret,
    { expiresIn: ttlSec },
  );
  const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();
  return { token, expiresAt };
}

export function verifyPublicFileAccessToken(
  token: string | undefined | null,
): { fileId: string; userId?: string } | null {
  if (!token || !env.jwtSecret) return null;
  try {
    const payload = jwt.verify(String(token), env.jwtSecret) as jwt.JwtPayload;
    if (payload.typ !== "public_file_access") return null;
    if (typeof payload.fileId !== "string" || !mongoose.isValidObjectId(payload.fileId)) {
      return null;
    }
    return {
      fileId: payload.fileId,
      ...(typeof payload.sub === "string" && payload.sub ? { userId: payload.sub } : {}),
    };
  } catch {
    return null;
  }
}

function normalizeObjectId(value: string | undefined): mongoose.Types.ObjectId | null {
  if (!value || !mongoose.isValidObjectId(value)) return null;
  return new mongoose.Types.ObjectId(value);
}

function normalizeAvailableTo(values: string[] | undefined): mongoose.Types.ObjectId[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values)]
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

async function withMongoTx<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let out: T | undefined;
    await session.withTransaction(async () => {
      out = await fn(session);
    });
    return out as T;
  } finally {
    await session.endSession();
  }
}

async function runWithOptionalSession<T>(
  options: TxOptions | undefined,
  fn: (session: ClientSession) => Promise<T>,
): Promise<T> {
  if (options?.session != null) {
    return fn(options.session);
  }
  return withMongoTx(fn);
}

async function uploadBufferToGridFs(
  input: UploadPublicAssetInput,
  session?: ClientSession,
): Promise<{
  fileId: ObjectId;
  size: number;
  contentType: string;
  extension: string;
  filename: string;
}> {
  const buffer = input.buffer;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("Empty file");
  }
  if (buffer.length > MAX_PUBLIC_ASSET_BYTES) {
    throw new Error("File too large (max 10 MiB)");
  }
  const size = buffer.length;
  const filename = input.filename?.trim() || `asset-${Date.now()}`;
  const contentType = guessContentType(input.filename, input.contentType);
  const extension = extensionFromFilename(filename);

  const bucket = getPublicAssetGridFSBucket();

  const fileId = await new Promise<ObjectId>((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, {
      metadata: { contentType },
      ...(session ? { session } : {}),
    });
    uploadStream.on("error", reject);
    uploadStream.on("finish", () => {
      resolve(uploadStream.id as ObjectId);
    });
    Readable.from(buffer).pipe(uploadStream);
  });

  return { fileId, size, contentType, extension, filename };
}

function toResult(doc: {
  fileId: ObjectId;
  size: number;
  contentType: string;
  extension: string;
  isPublic: boolean;
  availableTo?: ObjectId[];
  createdBy?: ObjectId | null;
  referenceCount: number;
}): UploadPublicAssetResult {
  const id = String(doc.fileId);
  return {
    url: buildPublicAssetFileUrl(id),
    fileId: id,
    size: doc.size,
    contentType: doc.contentType,
    extension: doc.extension,
    isPublic: Boolean(doc.isPublic),
    availableTo: (doc.availableTo ?? []).map(String),
    referenceCount: Number(doc.referenceCount ?? 0),
    createdBy: doc.createdBy ? String(doc.createdBy) : null,
  };
}

/**
 * Upload bytes to GridFS + create metadata with initial referenceCount.
 */
export async function createPublicAsset(
  input: UploadPublicAssetInput,
  options?: TxOptions,
): Promise<UploadPublicAssetResult> {
  return runWithOptionalSession(options, async (session) => {
    const uploaded = await uploadBufferToGridFs(input, session);
    const createdBy = normalizeObjectId(input.createdBy);
    const availableTo = normalizeAvailableTo(input.availableTo);
    const isPublic = Boolean(input.isPublic);
    try {
      const createdDocs = await PublicAssetModel.create(
        [
          {
            fileId: uploaded.fileId,
            size: uploaded.size,
            contentType: uploaded.contentType,
            extension: uploaded.extension,
            filename: uploaded.filename,
            isPublic,
            availableTo,
            createdBy,
            referenceCount: 1,
          },
        ],
        { session },
      );
      const doc = Array.isArray(createdDocs) ? createdDocs[0] : null;
      if (!doc) throw new Error("Failed to create asset metadata");
      return toResult({
        fileId: doc.fileId,
        size: doc.size,
        contentType: doc.contentType,
        extension: doc.extension,
        isPublic: doc.isPublic,
        availableTo: doc.availableTo,
        createdBy: doc.createdBy ?? null,
        referenceCount: doc.referenceCount,
      });
    } catch (err) {
      try {
        await getPublicAssetGridFSBucket().delete(uploaded.fileId);
      } catch {
        /* ignore cleanup failures */
      }
      throw err;
    }
  });
}

/**
 * Backward-compatible alias for create operation.
 */
export async function uploadPublicAssetBuffer(
  input: UploadPublicAssetInput,
  options?: TxOptions,
): Promise<UploadPublicAssetResult> {
  return createPublicAsset(input, options);
}

export async function linkPublicAssetReference(
  fileId: string,
  options?: TxOptions,
): Promise<UploadPublicAssetResult | null> {
  if (!mongoose.isValidObjectId(fileId)) return null;
  return runWithOptionalSession(options, async (session) => {
    const oid = new mongoose.Types.ObjectId(fileId);
    await PublicAssetModel.updateOne(
      { fileId: oid } as any,
      { $inc: { referenceCount: 1 } },
      { session },
    ).exec();
    const updated = await PublicAssetModel.findOne({ fileId: oid } as any)
      .session(session)
      .lean()
      .exec();
    if (!updated) return null;
    return toResult({
      fileId: updated.fileId,
      size: updated.size,
      contentType: updated.contentType,
      extension: updated.extension,
      isPublic: updated.isPublic,
      availableTo: updated.availableTo,
      createdBy: updated.createdBy ?? null,
      referenceCount: updated.referenceCount,
    });
  });
}

async function cleanupAssetIfZeroInTx(
  oid: mongoose.Types.ObjectId,
  session: ClientSession,
): Promise<void> {
  const bucket = getPublicAssetGridFSBucket();
  try {
    await bucket.delete(oid);
  } catch {
    /* ignore if already missing */
  }
  await PublicAssetModel.deleteOne({ fileId: oid } as any, { session }).exec();
}

export async function unlinkPublicAssetReference(
  fileId: string,
  options?: TxOptions,
): Promise<{ deleted: boolean; referenceCount: number } | null> {
  if (!mongoose.isValidObjectId(fileId)) return null;
  return runWithOptionalSession(options, async (session) => {
    const oid = new mongoose.Types.ObjectId(fileId);
    await PublicAssetModel.updateOne(
      { fileId: oid, referenceCount: { $gt: 0 } } as any,
      { $inc: { referenceCount: -1 } },
      { session },
    ).exec();
    const updated = await PublicAssetModel.findOne({ fileId: oid } as any)
      .session(session)
      .lean()
      .exec();
    if (!updated) return null;
    const count = Number(updated.referenceCount ?? 0);
    if (count <= 0) {
      await cleanupAssetIfZeroInTx(oid, session);
      return { deleted: true, referenceCount: 0 };
    }
    return { deleted: false, referenceCount: count };
  });
}

/**
 * Remove one reference from asset; delete file+metadata if count reaches zero.
 */
export async function deletePublicAsset(fileId: string): Promise<void> {
  const result = await unlinkPublicAssetReference(fileId);
  if (result == null && mongoose.isValidObjectId(fileId)) {
    // Fallback for legacy metadata without reference tracking.
    const oid = new mongoose.Types.ObjectId(fileId);
    const bucket = getPublicAssetGridFSBucket();
    try {
      await bucket.delete(oid);
    } catch {
      /* ignore */
    }
    await PublicAssetModel.deleteOne({ fileId: oid } as any).exec();
  }
}

export async function updatePublicAssetFile(
  fileId: string,
  mode: UpdatePublicAssetMode,
  input: UploadPublicAssetInput,
  options?: TxOptions,
): Promise<{ asset: UploadPublicAssetResult; forked: boolean }> {
  if (!mongoose.isValidObjectId(fileId)) {
    throw new Error("Invalid file id");
  }

  return runWithOptionalSession(options, async (session) => {
    const oid = new mongoose.Types.ObjectId(fileId);
    const existing = await PublicAssetModel.findOne({ fileId: oid } as any)
      .session(session)
      .lean()
      .exec();
    if (!existing) {
      throw new Error("Asset not found");
    }

    const uploaded = await uploadBufferToGridFs(input, session);
    const bucket = getPublicAssetGridFSBucket();
    const nextIsPublic =
      input.isPublic === undefined ? Boolean(existing.isPublic) : Boolean(input.isPublic);
    const nextAvailableTo =
      input.availableTo === undefined
        ? (existing.availableTo ?? [])
        : normalizeAvailableTo(input.availableTo);
    const nextCreatedBy =
      input.createdBy === undefined
        ? (existing.createdBy ?? null)
        : normalizeObjectId(input.createdBy);

    if (mode === "global" || Number(existing.referenceCount ?? 0) <= 1) {
      await PublicAssetModel.updateOne(
        { fileId: oid } as any,
        {
          $set: {
            fileId: uploaded.fileId,
            size: uploaded.size,
            contentType: uploaded.contentType,
            extension: uploaded.extension,
            filename: uploaded.filename,
            isPublic: nextIsPublic,
            availableTo: nextAvailableTo,
            createdBy: nextCreatedBy,
          },
        },
        { session, runValidators: true },
      ).exec();

      try {
        await bucket.delete(oid);
      } catch {
        /* ignore old missing bytes */
      }

      return {
        asset: toResult({
          fileId: uploaded.fileId,
          size: uploaded.size,
          contentType: uploaded.contentType,
          extension: uploaded.extension,
          isPublic: nextIsPublic,
          availableTo: nextAvailableTo as ObjectId[],
          createdBy: nextCreatedBy,
          referenceCount: Number(existing.referenceCount ?? 1),
        }),
        forked: false,
      };
    }

    await PublicAssetModel.updateOne(
      { fileId: oid, referenceCount: { $gt: 0 } } as any,
      { $inc: { referenceCount: -1 } },
      { session },
    ).exec();
    const forkedDocs = await PublicAssetModel.create(
      [
        {
          fileId: uploaded.fileId,
          size: uploaded.size,
          contentType: uploaded.contentType,
          extension: uploaded.extension,
          filename: uploaded.filename,
          isPublic: nextIsPublic,
          availableTo: nextAvailableTo,
          createdBy: nextCreatedBy,
          referenceCount: 1,
        },
      ],
      { session },
    );
    const forkedDoc = Array.isArray(forkedDocs) ? forkedDocs[0] : null;
    if (!forkedDoc) throw new Error("Failed to create forked asset");
    return {
      asset: toResult({
        fileId: forkedDoc.fileId,
        size: forkedDoc.size,
        contentType: forkedDoc.contentType,
        extension: forkedDoc.extension,
        isPublic: forkedDoc.isPublic,
        availableTo: forkedDoc.availableTo,
        createdBy: forkedDoc.createdBy ?? null,
        referenceCount: forkedDoc.referenceCount,
      }),
      forked: true,
    };
  });
}

/**
 * Replace semantic wrapper (single-use by default): unlink old one reference then create new.
 */
export async function replacePublicAsset(
  previousFileId: string | null | undefined,
  input: UploadPublicAssetInput,
  options?: TxOptions,
): Promise<UploadPublicAssetResult> {
  const previous = previousFileId ? String(previousFileId).trim() : "";
  if (previous) {
    await unlinkPublicAssetReference(previous, options);
  }
  return createPublicAsset(input, options);
}

/** Convenience upload for globally public files. */
export async function uploadPublicAssetPublic(
  input: Omit<UploadPublicAssetInput, "isPublic">,
  options?: TxOptions,
): Promise<UploadPublicAssetResult> {
  return createPublicAsset({ ...input, isPublic: true }, options);
}

/** Convenience upload for ACL-protected files. */
export async function uploadPublicAssetSecure(
  input: Omit<UploadPublicAssetInput, "isPublic"> & { availableTo: string[] },
  options?: TxOptions,
): Promise<UploadPublicAssetResult> {
  return createPublicAsset({ ...input, isPublic: false }, options);
}

/** Update access policy (public/private + ACL users) without reuploading file bytes. */
export async function updatePublicAssetAccess(
  fileId: string,
  input: { isPublic?: boolean; availableTo?: string[] },
  options?: TxOptions,
): Promise<{ fileId: string; isPublic: boolean; availableTo: string[] } | null> {
  if (!mongoose.isValidObjectId(fileId)) return null;
  return runWithOptionalSession(options, async (session) => {
    const oid = new mongoose.Types.ObjectId(fileId);
    const $set: Record<string, unknown> = {};
    if (input.isPublic !== undefined) $set.isPublic = input.isPublic;
    if (input.availableTo !== undefined) {
      $set.availableTo = [...new Set(input.availableTo)]
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(id));
    }
    await PublicAssetModel.updateOne(
      { fileId: oid } as any,
      { $set },
      { runValidators: true, session },
    ).exec();
    const updated = await PublicAssetModel.findOne({ fileId: oid } as any)
      .session(session)
      .lean()
      .exec();
    if (!updated) return null;
    return {
      fileId,
      isPublic: Boolean(updated.isPublic),
      availableTo: (updated.availableTo ?? []).map(String),
    };
  });
}

/** Add users to ACL list for a non-public file. */
export async function addPublicAssetAvailableTo(
  fileId: string,
  userIds: string[],
  options?: TxOptions,
): Promise<{ fileId: string; availableTo: string[] } | null> {
  if (!mongoose.isValidObjectId(fileId)) return null;
  return runWithOptionalSession(options, async (session) => {
    const oid = new mongoose.Types.ObjectId(fileId);
    const add = [...new Set(userIds)]
      .filter((id) => mongoose.isValidObjectId(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    await PublicAssetModel.updateOne(
      { fileId: oid } as any,
      { $addToSet: { availableTo: { $each: add } } },
      { session },
    ).exec();
    const updated = await PublicAssetModel.findOne({ fileId: oid } as any)
      .session(session)
      .lean()
      .exec();
    if (!updated) return null;
    return { fileId, availableTo: (updated.availableTo ?? []).map(String) };
  });
}

/** Remove users from ACL list for a non-public file. */
export async function removePublicAssetAvailableTo(
  fileId: string,
  userIds: string[],
  options?: TxOptions,
): Promise<{ fileId: string; availableTo: string[] } | null> {
  if (!mongoose.isValidObjectId(fileId)) return null;
  return runWithOptionalSession(options, async (session) => {
    const oid = new mongoose.Types.ObjectId(fileId);
    const del = [...new Set(userIds)]
      .filter((id) => mongoose.isValidObjectId(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    await PublicAssetModel.updateOne(
      { fileId: oid } as any,
      { $pull: { availableTo: { $in: del } } },
      { session },
    ).exec();
    const updated = await PublicAssetModel.findOne({ fileId: oid } as any)
      .session(session)
      .lean()
      .exec();
    if (!updated) return null;
    return { fileId, availableTo: (updated.availableTo ?? []).map(String) };
  });
}
