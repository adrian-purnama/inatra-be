import mongoose from "mongoose";
import type { GridFSBucket } from "mongodb";

/**
 * GridFS bucket name → collections `publicAssets.files` and `publicAssets.chunks`.
 * Use {@link getPublicAssetGridFSBucket} for uploads/downloads; binary bytes live in GridFS only.
 */
export const PUBLIC_ASSET_GRIDFS_BUCKET_NAME = "publicAssets" as const;

let gridfsBucket: GridFSBucket | null = null;

/**
 * Lazy singleton for the public-asset GridFS bucket (requires an active Mongoose connection).
 */
export function getPublicAssetGridFSBucket(): GridFSBucket {
  const db = mongoose.connection.db;
  if (db == null) {
    throw new Error("MongoDB is not connected");
  }
  if (gridfsBucket == null) {
    gridfsBucket = new mongoose.mongo.GridFSBucket(db, {
      bucketName: PUBLIC_ASSET_GRIDFS_BUCKET_NAME,
    });
  }
  return gridfsBucket;
}

/**
 * Basic metadata for a GridFS file (all publicly accessible images/assets).
 * Flow: upload via bucket → `fileId` = id from GridFS → insert one `PublicAsset` row.
 */
const publicAssetSchema = new mongoose.Schema(
  {
    /** `_id` of the document in `publicAssets.files` */
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
    },
    /** Stored size in bytes (same as GridFS `length` when saved) */
    size: {
      type: Number,
      required: true,
      min: 0,
    },
    /** MIME type, e.g. `image/png`, `image/jpeg`, `image/webp` */
    contentType: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    /** Short format hint: `png`, `jpeg`, `webp`, `gif`, … */
    extension: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    /** Original or display filename (optional) */
    filename: { type: String, default: "" },
    /** Public files can be accessed by everyone without ACL checks. */
    isPublic: {
      type: Boolean,
      required: true,
      default: false,
      index: true,
    },
    /** User-level ACL for non-public files. */
    availableTo: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    /** Creator/owner of uploaded file metadata (optional). */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    /**
     * Active reference count across modules.
     * New upload starts at 1, and is decremented/incremented by usage lifecycle operations.
     */
    referenceCount: {
      type: Number,
      required: true,
      default: 1,
      min: 0,
      index: true,
    },
  },
  { timestamps: true },
);

publicAssetSchema.path("availableTo").default(() => []);
publicAssetSchema.index({ availableTo: 1 });

export const PublicAssetModel =
  mongoose.models.PublicAsset ??
  mongoose.model("PublicAsset", publicAssetSchema);
