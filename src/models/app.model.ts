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
});

/** Mongoose document type — use this for `create` / `find` results, not `AppDto`. */
export type IApp = mongoose.HydratedDocument<
  mongoose.InferSchemaType<typeof appSchema>
>;

export const AppModel =
  mongoose.models.App ?? mongoose.model("App", appSchema);