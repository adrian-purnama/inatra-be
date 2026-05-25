import mongoose from "mongoose";

/** UI / validation helper — not stored on documents */
export const CURRENCY_LIST = [
  { label: "Indonesian Rupiah", code: "IDR", symbol: "Rp." },
  { label: "United States Dollar", code: "USD", symbol: "$" },
] as const;

/**
 * Quotation lifecycle — separate from `leadQualificationId` (opportunity/sales qualification).
 * Use Status collection only if you need admin-editable labels/colors; this enum fixes the workflow.
 */
export const QUOTATION_STATUS_VALUES = [
  "draft",
  "pending_approved",
  "rejected",
  "open",
  "close",
  "loss",
] as const;

export type QuotationStatus = (typeof QUOTATION_STATUS_VALUES)[number];

/**
 * Quotation header = opportunity-style commercial context (LOB, segment, customer, location, …)
 * plus quotation-specific fields (number, revision, totals, tax, validity, terms).
 */
const quotationHeaderSchema = new mongoose.Schema(
  {
    /** Source opportunity this quote extends */
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
    availableTo: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],

    lineOfBusinessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LineOfBusiness",
      required: true,
      index: true,
    },
    marketSegmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MarketSegment",
      required: true,
      index: true,
    },

    customer: {
      customerName: { type: String },
      customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ExternalOrg",
      },
    },
    endUser: {
      endUserName: { type: String },
      endUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ExternalOrg",
      },
    },
    contact: {
      contactName: { type: String },
      contactDetails: {
        type: [String],
        default: [],
      },
    },
    notes: {
      type: String,
    },
    location: {
      provinceId: { type: mongoose.Schema.Types.ObjectId, ref: "Location" },
      regencyId: { type: mongoose.Schema.Types.ObjectId, ref: "Location" },
      districtId: { type: mongoose.Schema.Types.ObjectId, ref: "Location" },
    },
    propability: {
      type: Number,
      default: 0,
    },
    estimateCloseDate: {
      type: Date,
      required: false,
      default: null,
    },
    actualCloseDate: {
      type: Date,
      required: false,
      default: null,
    },
    attachmentAssetIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PublicAsset",
        required: true,
      },
    ],
    attachmentsUpdatedAt: {
      type: Date,
      required: false,
      default: null,
    },

    quotationNo: {
      type: String,
      required: true,
      trim: true,
    },
    revisionNo: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    /** Document workflow — not the same as opportunity lead qualification (`leadQualificationId`) */
    quotationStatus: {
      type: String,
      enum: [...QUOTATION_STATUS_VALUES],
      default: "draft",
      index: true,
    },
    rejectReason: {
      type: String,
      default: "",
      trim: true,
    },
    approver : {
      approverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      approvedAt: {
        type: Date,
        default: null,
      },
    },
    currency: {
      type: String,
      default: "IDR",
      trim: true,
    },
    taxRate: {
      type: Number,
      default: 0,
      min: 0,
    },
    /** Optional: document-level discount before tax (amount in same currency) */
    discountTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    subTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    validUntil: {
      type: Date,
      default: null,
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
quotationHeaderSchema.path("attachmentAssetIds").default(() => []);

quotationHeaderSchema.index({ quotationNo: 1, revisionNo: 1 }, { unique: true });
quotationHeaderSchema.index({ availableTo: 1 });
quotationHeaderSchema.index({ attachmentAssetIds: 1 });

export type QuotationHeaderAttrs = mongoose.InferSchemaType<typeof quotationHeaderSchema>;

export const QuotationHeaderModel: mongoose.Model<QuotationHeaderAttrs> =
  (mongoose.models.QuotationHeader as mongoose.Model<QuotationHeaderAttrs> | undefined) ??
  mongoose.model<QuotationHeaderAttrs>("QuotationHeader", quotationHeaderSchema);
