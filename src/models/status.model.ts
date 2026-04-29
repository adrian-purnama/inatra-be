import mongoose from "mongoose";

export const STATUS_CATEGORIES = {
  VENDOR_CATEGORY: "vendor_category",
  OPPORTUNITY_CATEGORY: "opportunity",
} as const;

const statusSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    color: {
      type: String,
      default: "#6b7280",
      trim: true,
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

statusSchema.index({ category: 1, name: 1 }, { unique: true });

export type StatusAttrs = mongoose.InferSchemaType<typeof statusSchema>;

export const StatusModel: mongoose.Model<StatusAttrs> =
  (mongoose.models.Status as mongoose.Model<StatusAttrs> | undefined) ??
  mongoose.model<StatusAttrs>("Status", statusSchema);
