import mongoose from "mongoose";

const PERMISSION_SOURCES = ["auto", "custom", "all_user", "all_guest"] as const;
export type PermissionSource = (typeof PERMISSION_SOURCES)[number];

/** Catalog of permission keys; roles reference by id. Multiple rows may share the same path+method. */
const permissionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    description: { type: String, default: "" },
    path: { type: String, required: true },
    method: { type: String, required: true },
    /** `auto` = seeded/suggested; `custom` = user-defined; `all_user` = any authenticated user; `all_guest` = public. */
    source: {
      type: String,
      enum: PERMISSION_SOURCES,
      required: true,
      default: "custom",
      index: true,
    },
  },
  { timestamps: true },
);

permissionSchema.index({ path: 1, method: 1, name: 1 }, { unique: true });

export type PermissionAttrs = mongoose.InferSchemaType<typeof permissionSchema>;

export const PermissionModel: mongoose.Model<PermissionAttrs> =
  (mongoose.models.Permission as mongoose.Model<PermissionAttrs> | undefined) ??
  mongoose.model<PermissionAttrs>("Permission", permissionSchema);
