import mongoose from "mongoose";

const marketSegmentSchema = new mongoose.Schema(
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

export type MarketSegmentAttrs = mongoose.InferSchemaType<typeof marketSegmentSchema>;

export const MarketSegmentModel: mongoose.Model<MarketSegmentAttrs> =
  (mongoose.models.MarketSegment as mongoose.Model<MarketSegmentAttrs> | undefined) ??
  mongoose.model<MarketSegmentAttrs>("MarketSegment", marketSegmentSchema);
