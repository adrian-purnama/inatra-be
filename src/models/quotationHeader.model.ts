import mongoose from "mongoose";

const quotationHeaderSchema = new mongoose.Schema(
  {
    opportunityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Opportunity",
      required: true,
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    quotationNo: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    revisionNo: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    statusId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Status",
      default: null,
      index: true,
    },
    currency: {
      type: String,
      default: "IDR",
      trim: true,
    },
    validUntil: {
      type: Date,
      default: null,
    },
    customer: {
      customerName: { type: String, default: "", trim: true },
      customerId: { type: mongoose.Schema.Types.ObjectId, ref: "ExternalOrg", default: null },
    },
    endUser: {
      endUserName: { type: String, default: "", trim: true },
      endUserId: { type: mongoose.Schema.Types.ObjectId, ref: "ExternalOrg", default: null },
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    termsAndConditions: {
      type: String,
      default: "",
      trim: true,
    },
    grandTotal: {
      type: Number,
      default: 0,
      min: 0,
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

quotationHeaderSchema.path("availableTo").default(() => []);
quotationHeaderSchema.index({ quotationNo: 1, revisionNo: 1 }, { unique: true });
quotationHeaderSchema.index({ availableTo: 1 });

export type QuotationHeaderAttrs = mongoose.InferSchemaType<typeof quotationHeaderSchema>;

export const QuotationHeaderModel: mongoose.Model<QuotationHeaderAttrs> =
  (mongoose.models.QuotationHeader as mongoose.Model<QuotationHeaderAttrs> | undefined) ??
  mongoose.model<QuotationHeaderAttrs>("QuotationHeader", quotationHeaderSchema);
