import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    folderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FolderNode",
      default: null,
      index: true,
    },
    sku: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
      unique: true,
    },
    /** Default unit of measure (e.g. pcs, set) — copied to opportunity/quotation lines */
    unit: {
      type: String,
      default: "",
      trim: true,
    },
    skuHistory: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true },
);

productSchema.index({ folderId: 1, name: 1 });

export type ProductAttrs = mongoose.InferSchemaType<typeof productSchema>;

export const ProductModel: mongoose.Model<ProductAttrs> =
  (mongoose.models.Product as mongoose.Model<ProductAttrs> | undefined) ??
  mongoose.model<ProductAttrs>("Product", productSchema);

