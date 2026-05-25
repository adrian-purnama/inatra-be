import mongoose from "mongoose";

/**
 * Line items: same core as opportunity detail (description, quantity, price)
 * plus optional quotation fields (sort order, unit, SKU, line discount/tax hints).
 */
const quotationDetailSchema = new mongoose.Schema(
  {
    quotationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QuotationHeader",
      required: true,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      min: 0,
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
    unit: {
      type: String,
      default: "",
      trim: true,
    },
    sku: {
      type: String,
      default: "",
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    /** Line discount (amount), same currency as header */
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    /** Optional line tax rate % or fixed amount — store as needed; default 0 */
    taxRate: {
      type: Number,
      default: 0,
      min: 0,
    },
    lineNotes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true },
);

quotationDetailSchema.index({ quotationId: 1, sortOrder: 1 });

export type QuotationDetailAttrs = mongoose.InferSchemaType<typeof quotationDetailSchema>;

export const QuotationDetailModel: mongoose.Model<QuotationDetailAttrs> =
  (mongoose.models.QuotationDetail as mongoose.Model<QuotationDetailAttrs> | undefined) ??
  mongoose.model<QuotationDetailAttrs>("QuotationDetail", quotationDetailSchema);
