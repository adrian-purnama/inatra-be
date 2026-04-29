import mongoose from "mongoose";

const opportunityDetailSchema = new mongoose.Schema({
  opportunityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Opportunity",
    required: true,
    index: true,
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 0,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
}, { timestamps: true });

export type OpportunityDetailAttrs = mongoose.InferSchemaType<typeof opportunityDetailSchema>;

export const OpportunityDetailModel: mongoose.Model<OpportunityDetailAttrs> =
  (mongoose.models.OpportunityDetail as mongoose.Model<OpportunityDetailAttrs> | undefined) ??
  mongoose.model<OpportunityDetailAttrs>("OpportunityDetail", opportunityDetailSchema);