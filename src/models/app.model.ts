import mongoose from "mongoose";

const appSchema = new mongoose.Schema({
  appName: {
    type: String,
    required: true,
  },
  appLogo: {
    type: String,
    required: true,
    default: "https://placehold.co/600x400",
  },
  openRegister: {
    type: Boolean,
    required: true,
    default: true,
  },
  openLogin: {
    type: Boolean,
    required: true,
    default: true,
  },
  personSuffix: {
    type: [String],
    default: [],
  },
  companyInformation: {
    companyName: {
      type: String,
      required: true,
      default: "",
    },
    companyAddress: {
      type: String,
      required: true,
      default: "",
    },
    companyPhone: {
      type: String,
      required: true,
      default: "",
    },
    companyEmail: {
      type: String,
      required: true,
      default: "",
    },
    companyWebsite: {
      type: String,
      required: true,
      default: "",
    }
  },

  quotationInformation: {
    termsOfPayment: { type: [String], default: [] },
    termsOfDelivery: { type: [String], default: [] },
    termsOfWarranty: { type: [String], default: [] },
  }
});

/** Mongoose document type — use this for `create` / `find` results, not `AppDto`. */
export type IApp = mongoose.HydratedDocument<
  mongoose.InferSchemaType<typeof appSchema>
>;

export const AppModel =
  mongoose.models.App ?? mongoose.model("App", appSchema);