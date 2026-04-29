import mongoose from "mongoose";

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: { type: String, default: "" },
    permissionIds: {
      type: [String],
      default: [],
    },
    roleIds: {
      type: [String],
      default: [],
    },
    /** When true, this role is assigned to every newly registered user (see `auth.service` register). */
    applyOnRegisterUser: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

export const RoleModel =
  mongoose.models.Role ?? mongoose.model("Role", roleSchema);
