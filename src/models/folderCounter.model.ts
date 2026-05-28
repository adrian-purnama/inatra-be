import mongoose from "mongoose";

const folderCounterSchema = new mongoose.Schema(
  {
    namespace: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    leafFolderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FolderNode",
      required: true,
      index: true,
    },
    /** Next sequence number to allocate (starts at 1). */
    nextSeq: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
  },
  { timestamps: true },
);

folderCounterSchema.index({ namespace: 1, leafFolderId: 1 }, { unique: true });

export type FolderCounterAttrs = mongoose.InferSchemaType<typeof folderCounterSchema>;

export const FolderCounterModel: mongoose.Model<FolderCounterAttrs> =
  (mongoose.models.FolderCounter as mongoose.Model<FolderCounterAttrs> | undefined) ??
  mongoose.model<FolderCounterAttrs>("FolderCounter", folderCounterSchema);

