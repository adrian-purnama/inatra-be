import mongoose from "mongoose";

const externalOrgSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
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

export type ExternalOrgAttrs = mongoose.InferSchemaType<typeof externalOrgSchema>;

export const ExternalOrgModel: mongoose.Model<ExternalOrgAttrs> =
  (mongoose.models.ExternalOrg as mongoose.Model<ExternalOrgAttrs> | undefined) ??
  mongoose.model<ExternalOrgAttrs>("ExternalOrg", externalOrgSchema);