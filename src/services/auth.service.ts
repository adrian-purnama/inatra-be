import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import type { LoginDto } from "../dto/login.dto.js";
import type { SendOtpDto } from "../dto/sendOtp.dto.js";
import { RegisterDto } from "../dto/register.dto.js";
import { env } from "../env.js";
import { sendOtpEmail, sendWelcomeAfterRegisterEmail } from "../lib/mail.js";
import { logger } from "../lib/logger.js";
import type { ServiceResult } from "../lib/serviceResponse.js";
import { failResult, okResult } from "../lib/serviceResponse.js";
import { createOtp, verifyAndConsumeOtp } from "../lib/otp.js";
import { UserModel } from "../models/user.model.js";
import { getEffectivePermissionKeys } from "../lib/rbac.js";
import { AppModel } from "../models/app.model.js";
import { RoleModel } from "../models/role.model.js";

const SALT_ROUNDS = 12;
const JWT_EXPIRES = "7d";

async function getAppAccessFlags(): Promise<{
  openRegister: boolean;
  openLogin: boolean;
} | null> {
  return AppModel.findOne()
    .select("openRegister openLogin")
    .lean()
    .exec();
}

export async function sendOtp(dto: SendOtpDto): Promise<ServiceResult> {
  const e = dto.email?.trim() ?? "";
  const u = dto.userId?.trim() ?? "";

  if (e && u) {
    return failResult(400, "Send only email or userId, not both");
  }
  if (!e && !u) {
    return failResult(400, "Provide email or userId");
  }

  if (e) {
    const appCfg = await getAppAccessFlags();
    if (appCfg == null || !appCfg.openRegister) {
      return failResult(
        403,
        "Registration is closed. Contact an administrator.",
      );
    }
    const emailLower = e.toLowerCase();
    const alreadyUser = await UserModel.exists({ email: emailLower }).exec();
    if (alreadyUser) {
      return failResult(
        409,
        "This email is already registered. Log in instead.",
      );
    }
  }

  let otpCode: string;
  let expiresAt: Date;
  let toEmail: string;

  if (e) {
    toEmail = e.toLowerCase();
    ({ code: otpCode, expiresAt } = await createOtp({ email: e }));
  } else {
    if (!mongoose.isValidObjectId(u)) {
      return failResult(400, "Invalid user id");
    }
    const user = await UserModel.findOne()
      .where("_id")
      .equals(new mongoose.Types.ObjectId(u))
      .select("email")
      .lean()
      .exec();
    if (user == null || !user.email) {
      return failResult(404, "User not found or has no email");
    }
    toEmail = user.email;
    ({ code: otpCode, expiresAt } = await createOtp({ userId: u }));
  }

  if (env.nodeEnv !== "production") {
    logger.info({ otp: otpCode }, "DEV: OTP (also sent via Brevo when configured)");
  }

  try {
    await sendOtpEmail(toEmail, otpCode, expiresAt);
  } catch (err: unknown) {
    logger.error({ err }, "Failed to send OTP email");
    if (env.nodeEnv === "production") {
      return failResult(503, "Could not send verification email");
    }
  }

  return okResult(200, "OTP sent", {
    expiresAt: expiresAt.toISOString(),
  });
}

export async function register(dto: RegisterDto,): Promise<ServiceResult<{ id: string; email: string }>> {
  const appCfg = await getAppAccessFlags();
  if (appCfg == null || !appCfg.openRegister) {
    return failResult(
      403,
      "Registration is closed. Contact an administrator.",
    );
  }

  const emailCleaned = dto.email.trim().toLowerCase();

  const taken = await UserModel.exists({ email: emailCleaned }).exec();
  if (taken) {
    return failResult(409, "Email already registered. Log in instead.");
  }

  const otpOk = await verifyAndConsumeOtp({
    email: emailCleaned,
    code: dto.otp,
  });
  if (!otpOk) {
    return failResult(400, "Invalid or expired OTP");
  }

  const isFirstUser = (await UserModel.countDocuments().exec()) === 0;

  const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

  const defaultRoleDocs = await RoleModel.find({ applyOnRegisterUser: true })
    .select("_id")
    .lean()
    .exec();
  const roleIdsOnRegister = defaultRoleDocs.map((r) => r._id);

  const user = await UserModel.create({
    email: emailCleaned,
    passwordHash,
    isSuperAdmin: isFirstUser,
    isAdmin: isFirstUser,
    isActive: true,
    roleIds: roleIdsOnRegister,
    verified: {
      email: {
        isEmailVerified: true,
        verifedAt: Date.now(),
      },
    },
  });


  if (user == null) {
    return failResult(500, "Failed to create user");
  }

  try {
    const toName = user.email.split("@")[0]?.trim();
    await sendWelcomeAfterRegisterEmail(
      user.email,
      toName ? { toName, appName: "INATRA" } : { appName: "INATRA" },
    );
  } catch (err: unknown) {
    logger.error({ err, userId: String(user._id) }, "Failed to send welcome email");
  }

  return okResult(201, "User created successfully", { id: String(user._id), email: user.email });
}

export async function login(dto: LoginDto): Promise<ServiceResult<{ token: string }>> {
  if (!env.jwtSecret) {
    return failResult(503, "Authentication not configured");
  }


  const email = dto.email.trim().toLowerCase();
  const user = await UserModel.findOne()
    .where("email")
    .equals(email)
    .select("+passwordHash")
    .exec();

  const appCfg = await getAppAccessFlags();
  const loginOpen = appCfg?.openLogin === true;
  const superAdminBypass = user?.isSuperAdmin === true;
  if (!loginOpen && !superAdminBypass) {
    if (user == null) {
      return failResult(401, "Invalid email or password");
    }
    return failResult(403, "Login is disabled. Contact an administrator.");
  }

  if (user == null) {
    return failResult(401, "Invalid email or password");
  }

  const match = await bcrypt.compare(dto.password, user.passwordHash);
  if (!match) {
    return failResult(401, "Invalid email or password");
  }

  const token = jwt.sign(
    { sub: String(user._id), email: user.email },
    env.jwtSecret,
    { expiresIn: JWT_EXPIRES },
  );

  return okResult(200, "Logged in", { token });
}

/** Current user for a valid JWT `sub` — use after `requireAuth`. */
export async function getMe(userId: string): Promise<
  ServiceResult<{
    id: string;
    email: string;
    isSuperAdmin: boolean;
    isAdmin: boolean;
    permissionKeys: string[];
  }>
> {
  if (!mongoose.isValidObjectId(userId)) {
    return failResult(401, "Invalid session");
  }

  const user = await UserModel.findOne()
    .where("_id")
    .equals(new mongoose.Types.ObjectId(userId))
    .select("email isSuperAdmin isAdmin isActive")
    .lean()
    .exec();

  if (user == null) {
    return failResult(401, "User not found");
  }
  if (!user.isActive) {
    return failResult(403, "Account disabled");
  }

  const permissionKeys = [...new Set(await getEffectivePermissionKeys(userId))];

  return okResult(200, "OK", {
    id: String(user._id),
    email: user.email,
    isSuperAdmin: Boolean(user.isSuperAdmin),
    isAdmin: Boolean(user.isAdmin),
    permissionKeys,
  });
}
