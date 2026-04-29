import mongoose from "mongoose";

const lineOfBusinessSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  { timestamps: true },
);

export type LineOfBusinessAttrs = mongoose.InferSchemaType<typeof lineOfBusinessSchema>;

export const LineOfBusinessModel: mongoose.Model<LineOfBusinessAttrs> =
  (mongoose.models.LineOfBusiness as mongoose.Model<LineOfBusinessAttrs> | undefined) ??
  mongoose.model<LineOfBusinessAttrs>("LineOfBusiness", lineOfBusinessSchema);