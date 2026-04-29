import mongoose from "mongoose";

const LOCATION_LEVELS = ["country", "province", "regency", "district"] as const;
export type LocationLevel = (typeof LOCATION_LEVELS)[number];

const locationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    level: {
      type: String,
      enum: LOCATION_LEVELS,
      required: true,
      index: true,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
      index: true,
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

locationSchema.index({ level: 1, parentId: 1, name: 1 }, { unique: true });
locationSchema.index({ level: 1, parentId: 1, isActive: 1 });

export type LocationAttrs = mongoose.InferSchemaType<typeof locationSchema>;

export const LocationModel: mongoose.Model<LocationAttrs> =
  (mongoose.models.Location as mongoose.Model<LocationAttrs> | undefined) ??
  mongoose.model<LocationAttrs>("Location", locationSchema);
