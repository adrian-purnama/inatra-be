import mongoose from "mongoose";

const folderNodeSchema = new mongoose.Schema(
  {
    namespace: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FolderNode",
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    /** 3-letter code segment used for SKU generation */
    code3: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
  },
  { timestamps: true },
);

folderNodeSchema.index({ namespace: 1, parentId: 1, name: 1 }, { unique: true });
folderNodeSchema.index({ namespace: 1, parentId: 1, isActive: 1 });
folderNodeSchema.index({ namespace: 1, parentId: 1, code3: 1 }, { unique: true });

export type FolderNodeAttrs = mongoose.InferSchemaType<typeof folderNodeSchema>;

export const FolderNodeModel: mongoose.Model<FolderNodeAttrs> =
  (mongoose.models.FolderNode as mongoose.Model<FolderNodeAttrs> | undefined) ??
  mongoose.model<FolderNodeAttrs>("FolderNode", folderNodeSchema);

