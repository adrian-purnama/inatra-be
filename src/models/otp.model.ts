import mongoose from "mongoose";

const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: false,
      lowercase: true,
      trim: true,
      sparse: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      sparse: true,
    },
    /** Plain OTP (not hashed — ensure DB access is restricted). */
    code: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

/** Auto-remove documents once `expiresAt` is in the past (background job ~60s). */
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type OtpDocument = mongoose.HydratedDocument<
  mongoose.InferSchemaType<typeof otpSchema>
>;

export const OtpModel =
  mongoose.models.Otp ?? mongoose.model("Otp", otpSchema);
