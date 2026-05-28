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
  discount: {
    type: Number,
    default: 0,
    min: 0,
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    default: null,
    index: true,
  },
  /** SKU snapshot (copied from Product when productId is set) */
  sku: {
    type: String,
    default: "",
    trim: true,
  },
  /** Unit of measure — from product when SKU-linked; manual for free-text lines */
  unit: {
    type: String,
    default: "",
    trim: true,
  },
}, { timestamps: true });

export type OpportunityDetailAttrs = mongoose.InferSchemaType<typeof opportunityDetailSchema>;

export const OpportunityDetailModel: mongoose.Model<OpportunityDetailAttrs> =
  (mongoose.models.OpportunityDetail as mongoose.Model<OpportunityDetailAttrs> | undefined) ??
  mongoose.model<OpportunityDetailAttrs>("OpportunityDetail", opportunityDetailSchema);