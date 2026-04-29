import mongoose from "mongoose";

const vendorSchema = new mongoose.Schema(
  {
    vendorName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    vendorCategoryIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Status" }],
      default: [],
      index: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    address: {
      type: String,
      default: "",
      trim: true,
    },
    location: {
      countryId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", default: null },
      provinceId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", default: null },
      regencyId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", default: null },
      districtId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", default: null },
    },
    contactPerson: {
      type: String,
      default: "",
      trim: true,
    },
    contactNumber: {
      type: String,
      default: "",
      trim: true,
    },
    email: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    isSubcon: {
      type: Boolean,
      required: true,
      default: false,
      index: true,
    },
    coverageArea: {
      type: String,
      default: "",
      trim: true,
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

vendorSchema.index({ vendorName: 1 });

export type VendorAttrs = mongoose.InferSchemaType<typeof vendorSchema>;

export const VendorModel: mongoose.Model<VendorAttrs> =
  (mongoose.models.Vendor as mongoose.Model<VendorAttrs> | undefined) ??
  mongoose.model<VendorAttrs>("Vendor", vendorSchema);
