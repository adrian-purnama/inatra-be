import mongoose from "mongoose";

const opportunityHeaderSchema = new mongoose.Schema({
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
  },
  marketSegmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MarketSegment",
    required: true,
  },
  leadQualificationId : {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Status",
    required: true,
  },
  customer:{
    customerName : {type:String},
    // external org id can be deleted this is for archival purpose
    customerId : {type: mongoose.Schema.Types.ObjectId, ref: "ExternalOrg"},
  },
  endUser:{
    endUserName : {type:String},
    endUserId : {type: mongoose.Schema.Types.ObjectId, ref: "ExternalOrg"},
  },
  contact : {
    contactName : {type:String},
    contactDetails : {
      type: [String],
      default: [],
    },
  },
  notes : {
    type: String,
  },
  location : {
    provinceId : {type: mongoose.Schema.Types.ObjectId, ref: "Location"},
    regencyId : {type: mongoose.Schema.Types.ObjectId, ref: "Location"},
    districtId : {type: mongoose.Schema.Types.ObjectId, ref: "Location"},
  },
  propability : {
    type: Number,
    default: 0,
  },
  /** Document-level tax rate % applied to line subtotal */
  taxRate: {
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
  grandTotal: {
    type: Number,
    default: 0,
    min: 0,
  },
  estimateCloseDate : {
    type: Date,
    required: false,
    default: null,
  },
  actualCloseDate : {
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
  }

});

opportunityHeaderSchema.path("availableTo").default(() => []);
opportunityHeaderSchema.path("attachmentAssetIds").default(() => []);
opportunityHeaderSchema.index({ availableTo: 1 });
opportunityHeaderSchema.index({ attachmentAssetIds: 1 });

export type OpportunityAttrs = mongoose.InferSchemaType<typeof opportunityHeaderSchema>;

export const OpportunityModel: mongoose.Model<OpportunityAttrs> =
  (mongoose.models.Opportunity as mongoose.Model<OpportunityAttrs> | undefined) ??
  mongoose.model<OpportunityAttrs>("Opportunity", opportunityHeaderSchema);