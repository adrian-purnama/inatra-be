import crypto from "node:crypto";
import mongoose from "mongoose";
import { OtpModel } from "../models/otp.model.js";

const OTP_LENGTH = 6;
const OTP_TTL_MS = 10 * 60 * 1000;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** 6-digit numeric OTP (e.g. `"083914"`). */
export function generatePlainOtp(): string {
  const n = crypto.randomInt(0, 10 ** OTP_LENGTH);
  return n.toString().padStart(OTP_LENGTH, "0");
}

export type CreateOtpTarget =
  | { email: string; userId?: undefined }
  | { email?: undefined; userId: string };

/**
 * Stores a new OTP for **either** `email` **or** `userId` (not both).
 * Replaces any previous OTP for the same target.
 */
export async function createOtp(target: CreateOtpTarget,
): Promise<{ code: string; expiresAt: Date }> {
  const code = generatePlainOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  if ("email" in target && target.email !== undefined && target.email !== "") {
    const email = normalizeEmail(target.email);
    await OtpModel.deleteMany({ email });
    await OtpModel.create({
      email,
      code,
      expiresAt,
    });
    return { code, expiresAt };
  }

  if ("userId" in target && target.userId !== undefined && target.userId !== "") {
    const userId = new mongoose.Types.ObjectId(target.userId);
    await OtpModel.deleteMany({ userId });
    await OtpModel.create({
      userId,
      code,
      expiresAt,
    });
    return { code, expiresAt };
  }

  throw new Error("createOtp: provide email or userId");
}

export type VerifyOtpInput =
  | { email: string; code: string; userId?: undefined }
  | { email?: undefined; userId: string; code: string };

/**
 * Verifies plain OTP matches; on success **deletes** the row (one-time use).
 * Expired rows may already be removed by the TTL index; still checks `expiresAt` if present.
 */
export async function verifyAndConsumeOtp(input: VerifyOtpInput): Promise<boolean> {
  const code = input.code.trim();

  let filter: { email: string } | { userId: mongoose.Types.ObjectId };
  if (input.email !== undefined && String(input.email).trim() !== "") {
    filter = { email: normalizeEmail(input.email) };
  } else if (input.userId !== undefined && String(input.userId).trim() !== "") {
    filter = { userId: new mongoose.Types.ObjectId(input.userId) };
  } else {
    return false;
  }

  const doc = await OtpModel.findOne(filter).sort({ createdAt: -1 }).exec();
  if (doc == null) {
    return false;
  }

  if (doc.expiresAt.getTime() <= Date.now()) {
    await doc.deleteOne();
    return false;
  }

  if (doc.code !== code) {
    return false;
  }

  await doc.deleteOne();
  return true;
}
