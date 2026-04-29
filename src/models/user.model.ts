import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { 
      type: String, 
      required: true, 
      select: false 
    },
    isSuperAdmin: {
      type: Boolean,
      required: true,
      default: false,
    },
    isAdmin: {
      type: Boolean,
      required: true,
      default: false,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
    roleIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Role",
      default: [],
    },

    verified: {
      email: {
        isEmailVerified: {
          type: Boolean,
          required: true, 
          default: false,
        },

        verifedAt: {
          type: Date,
          required: true,
          default: null,
        },
      },
    },
  },
  { timestamps: true },
);

export type UserAttrs = mongoose.InferSchemaType<typeof userSchema>;

/** Single `Model` type so `findById` / `findOne` are not inferred as an incompatible union. */
export const UserModel: mongoose.Model<UserAttrs> =
  (mongoose.models.User as mongoose.Model<UserAttrs> | undefined) ??
  mongoose.model<UserAttrs>("User", userSchema);
