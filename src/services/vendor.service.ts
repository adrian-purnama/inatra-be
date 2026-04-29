import mongoose from "mongoose";
import { parse } from "csv-parse/sync";
import type { CreateVendorDto } from "../dto/createVendor.dto.js";
import type { MongoIdParamDto } from "../dto/mongoIdParam.dto.js";
import type { PatchVendorDto } from "../dto/patchVendor.dto.js";
import { failResult, okResult, type ServiceResult } from "../lib/serviceResponse.js";
import { STATUS_CATEGORIES, StatusModel } from "../models/status.model.js";
import { VendorModel } from "../models/vendor.model.js";

let vendorIndexesEnsured = false;

type VendorOut = {
  id: string;
  vendorName: string;
  vendorCategoryIds: string[];
  vendorCategoryNames: string[];
  description: string;
  address: string;
  location: {
    countryId: string | null;
    provinceId: string | null;
    regencyId: string | null;
    districtId: string | null;
  };
  contactPerson: string;
  contactNumber: string;
  email: string;
  isSubcon: boolean;
  coverageArea: string;
  isActive: boolean;
  createdAt: Date | undefined;
  updatedAt: Date | undefined;
};

type ImportVendorRow = {
  vendorName: string;
  vendorCategoryNames: string[];
  description: string;
  address: string;
  contactPerson: string;
  contactNumber: string;
  email: string;
  isSubcon: boolean;
  coverageArea: string;
};

function isMongoDuplicateKeyError(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    const msg = String((err as Error).message ?? "");
    if (msg.includes("E11000") || msg.includes("duplicate key")) {
      return true;
    }
  }
  let cur: unknown = err;
  for (let d = 0; d < 5 && cur != null && typeof cur === "object"; d++) {
    const o = cur as { code?: number; errorResponse?: { code?: number } };
    if (o.code === 11000 || o.errorResponse?.code === 11000) {
      return true;
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

async function ensureVendorIndexes(): Promise<void> {
  if (vendorIndexesEnsured) return;
  try {
    await VendorModel.collection.dropIndex("vendorNameKey_1_vendorCategoryId_1");
  } catch {
    // ignore missing legacy index
  }
  try {
    await VendorModel.collection.dropIndex("vendorName_1_vendorCategoryId_1");
  } catch {
    // ignore missing legacy index
  }
  vendorIndexesEnsured = true;
}

function toVendorOut(row: {
  _id: unknown;
  vendorName: string;
  vendorCategoryIds?: unknown[];
  description?: string;
  address?: string;
  location?: {
    countryId?: unknown;
    provinceId?: unknown;
    regencyId?: unknown;
    districtId?: unknown;
  } | null;
  contactPerson?: string;
  contactNumber?: string;
  email?: string;
  isSubcon?: boolean;
  coverageArea?: string;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  vendorCategoryNames: string[];
}): VendorOut {
  return {
    id: String(row._id),
    vendorName: String(row.vendorName ?? ""),
    vendorCategoryIds: Array.isArray(row.vendorCategoryIds)
      ? row.vendorCategoryIds.filter(Boolean).map((x) => String(x))
      : [],
    vendorCategoryNames: row.vendorCategoryNames,
    description: String(row.description ?? ""),
    address: String(row.address ?? ""),
    location: {
      countryId: row.location?.countryId ? String(row.location.countryId) : null,
      provinceId: row.location?.provinceId ? String(row.location.provinceId) : null,
      regencyId: row.location?.regencyId ? String(row.location.regencyId) : null,
      districtId: row.location?.districtId ? String(row.location.districtId) : null,
    },
    contactPerson: String(row.contactPerson ?? ""),
    contactNumber: String(row.contactNumber ?? ""),
    email: String(row.email ?? ""),
    isSubcon: Boolean(row.isSubcon),
    coverageArea: String(row.coverageArea ?? ""),
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function ensureVendorCategory(rawName: string): Promise<{ id: string | null; name: string }> {
  const name = cleanText(rawName);
  if (!name) return { id: null, name: "" };

  const existing = await StatusModel.findOne({
    category: STATUS_CATEGORIES.VENDOR_CATEGORY,
    name,
  })
    .select("_id name")
    .lean()
    .exec();
  if (existing) return { id: String(existing._id), name: String(existing.name ?? name) };

  const created = await StatusModel.create({
    name,
    description: "",
    category: STATUS_CATEGORIES.VENDOR_CATEGORY,
    color: "#6b7280",
    isActive: true,
  });
  return { id: String(created._id), name: String(created.name ?? name) };
}

async function ensureVendorCategoryIdsByNames(rawNames: string[]): Promise<string[]> {
  const uniqueNames = [...new Set(rawNames.map((x) => cleanText(x)).filter(Boolean))];
  const ids: string[] = [];
  for (const name of uniqueNames) {
    const ensured = await ensureVendorCategory(name);
    if (ensured.id) ids.push(ensured.id);
  }
  return ids;
}

async function mapCategoryNames(ids: string[]): Promise<Map<string, string>> {
  const objectIds = ids
    .filter((x) => mongoose.isValidObjectId(x))
    .map((x) => new mongoose.Types.ObjectId(x));
  if (objectIds.length === 0) return new Map();
  const rows = await StatusModel.find({ _id: { $in: objectIds } }).select("_id name").lean().exec();
  return new Map(rows.map((r) => [String(r._id), String(r.name ?? "")]));
}

export async function listVendors(): Promise<ServiceResult<{ items: VendorOut[] }>> {
  const rows = await VendorModel.find().sort({ vendorName: 1 }).lean().exec();
  const allCategoryIds = [...new Set(rows.flatMap((r) => (r.vendorCategoryIds ?? []).map((x) => String(x))))];
  const namesById = await mapCategoryNames(allCategoryIds);
  return okResult(200, "OK", {
    items: rows.map((r) => {
      const ids = (r.vendorCategoryIds ?? []).map((x) => String(x));
      return toVendorOut({
        ...r,
        vendorCategoryNames: ids.map((id) => namesById.get(id) ?? "").filter(Boolean),
      });
    }),
  });
}

export async function createVendor(
  dto: CreateVendorDto,
): Promise<ServiceResult<{ item: VendorOut }>> {
  try {
    await ensureVendorIndexes();
    const categoryIds = (dto.vendorCategoryIds ?? []).filter((x) => mongoose.isValidObjectId(x));
    const created = await VendorModel.create({
      vendorName: cleanText(dto.vendorName),
      vendorCategoryIds: categoryIds.map((x) => new mongoose.Types.ObjectId(x)),
      description: cleanText(dto.description),
      address: cleanText(dto.address),
      location: {
        countryId: dto.countryId && mongoose.isValidObjectId(dto.countryId)
          ? new mongoose.Types.ObjectId(dto.countryId)
          : null,
        provinceId: dto.provinceId && mongoose.isValidObjectId(dto.provinceId)
          ? new mongoose.Types.ObjectId(dto.provinceId)
          : null,
        regencyId: dto.regencyId && mongoose.isValidObjectId(dto.regencyId)
          ? new mongoose.Types.ObjectId(dto.regencyId)
          : null,
        districtId: dto.districtId && mongoose.isValidObjectId(dto.districtId)
          ? new mongoose.Types.ObjectId(dto.districtId)
          : null,
      },
      contactPerson: cleanText(dto.contactPerson),
      contactNumber: cleanText(dto.contactNumber),
      email: cleanText(dto.email).toLowerCase(),
      isSubcon: dto.isSubcon ?? false,
      coverageArea: cleanText(dto.coverageArea),
      isActive: dto.isActive ?? true,
    });
    const namesById = await mapCategoryNames(categoryIds);
    return okResult(201, "Created", {
      item: toVendorOut({
        ...created.toObject(),
        vendorCategoryNames: categoryIds.map((id) => namesById.get(id) ?? "").filter(Boolean),
      }),
    });
  } catch (err) {
    if (isMongoDuplicateKeyError(err)) {
      return failResult(409, "Vendor already exists");
    }
    return failResult(500, "Could not create vendor");
  }
}

export async function patchVendor(
  vendorId: string | undefined,
  dto: PatchVendorDto,
): Promise<ServiceResult<{ item: VendorOut }>> {
  if (!vendorId || !mongoose.isValidObjectId(vendorId)) {
    return failResult(400, "Invalid vendor id");
  }

  const $set: Record<string, unknown> = {};
  if (dto.vendorName !== undefined) $set.vendorName = cleanText(dto.vendorName);
  if (dto.description !== undefined) $set.description = cleanText(dto.description);
  if (dto.address !== undefined) $set.address = cleanText(dto.address);
  if (
    dto.countryId !== undefined ||
    dto.provinceId !== undefined ||
    dto.regencyId !== undefined ||
    dto.districtId !== undefined
  ) {
    $set.location = {
      countryId:
        dto.countryId && mongoose.isValidObjectId(dto.countryId)
          ? new mongoose.Types.ObjectId(dto.countryId)
          : null,
      provinceId:
        dto.provinceId && mongoose.isValidObjectId(dto.provinceId)
          ? new mongoose.Types.ObjectId(dto.provinceId)
          : null,
      regencyId:
        dto.regencyId && mongoose.isValidObjectId(dto.regencyId)
          ? new mongoose.Types.ObjectId(dto.regencyId)
          : null,
      districtId:
        dto.districtId && mongoose.isValidObjectId(dto.districtId)
          ? new mongoose.Types.ObjectId(dto.districtId)
          : null,
    };
  }
  if (dto.contactPerson !== undefined) $set.contactPerson = cleanText(dto.contactPerson);
  if (dto.contactNumber !== undefined) $set.contactNumber = cleanText(dto.contactNumber);
  if (dto.email !== undefined) $set.email = cleanText(dto.email).toLowerCase();
  if (dto.isSubcon !== undefined) $set.isSubcon = dto.isSubcon;
  if (dto.coverageArea !== undefined) $set.coverageArea = cleanText(dto.coverageArea);
  if (dto.isActive !== undefined) $set.isActive = dto.isActive;
  if (dto.vendorCategoryIds !== undefined) {
    $set.vendorCategoryIds = dto.vendorCategoryIds
      .filter((x) => mongoose.isValidObjectId(x))
      .map((x) => new mongoose.Types.ObjectId(x));
  }

  if (Object.keys($set).length === 0) {
    return failResult(400, "Provide at least one field to update");
  }

  try {
    await ensureVendorIndexes();
    const updated = await VendorModel.findByIdAndUpdate(
      vendorId,
      { $set },
      { new: true, runValidators: true },
    )
      .lean()
      .exec();
    if (updated == null) return failResult(404, "Vendor not found");
    const ids = (updated.vendorCategoryIds ?? []).map((x) => String(x));
    const namesById = await mapCategoryNames(ids);
    return okResult(200, "Updated", {
      item: toVendorOut({
        ...updated,
        vendorCategoryNames: ids.map((id) => namesById.get(id) ?? "").filter(Boolean),
      }),
    });
  } catch (err) {
    if (isMongoDuplicateKeyError(err)) {
      return failResult(409, "Vendor already exists");
    }
    return failResult(500, "Could not update vendor");
  }
}

export async function deleteVendor(dto: MongoIdParamDto): Promise<ServiceResult<{ id: string }>> {
  const deleted = await VendorModel.findByIdAndDelete(dto.id).lean().exec();
  if (deleted == null) return failResult(404, "Vendor not found");
  return okResult(200, "Deleted", { id: dto.id });
}

export async function importVendors(
  rows: ImportVendorRow[],
): Promise<
  ServiceResult<{ created: number; updated: number; skipped: number; errors: number; total: number }>
> {
  await ensureVendorIndexes();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const vendorName = cleanText(row.vendorName);
      if (!vendorName) {
        skipped += 1;
        continue;
      }
      const categoryIds = await ensureVendorCategoryIdsByNames(row.vendorCategoryNames);
      const categoryObjectIds = categoryIds.map((x) => new mongoose.Types.ObjectId(x));
      const existing = await VendorModel.findOne({ vendorName }).select("_id").lean().exec();
      const payload = {
        vendorName,
        vendorCategoryIds: categoryObjectIds,
        description: cleanText(row.description),
        address: cleanText(row.address),
        contactPerson: cleanText(row.contactPerson),
        contactNumber: cleanText(row.contactNumber),
        email: cleanText(row.email).toLowerCase(),
        isSubcon: Boolean(row.isSubcon),
        coverageArea: cleanText(row.coverageArea),
        isActive: true,
        location: { provinceId: null, regencyId: null, districtId: null },
      };
      if (existing?._id) {
        await VendorModel.updateOne({ _id: existing._id }, { $set: payload }).exec();
        updated += 1;
      } else {
        await VendorModel.create(payload);
        created += 1;
      }
    } catch {
      errors += 1;
    }
  }

  return okResult(200, "Import completed", {
    created,
    updated,
    skipped,
    errors,
    total: rows.length,
  });
}

function parseBooleanLike(value: unknown): boolean {
  const v = cleanText(value).toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "y";
}

export function parseVendorCsvBuffer(buffer: Buffer): ImportVendorRow[] {
  const raw = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
    trim: true,
  }) as Record<string, unknown>[];

  return raw.map((r) => ({
    vendorName: cleanText(r["vendor_name"]),
    vendorCategoryNames: cleanText(r["vendor_category"])
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    description: cleanText(r["description"]),
    address: cleanText(r["address"]),
    city: cleanText(r["city"]),
    country: cleanText(r["country"]),
    contactPerson: cleanText(r["contact_person"]),
    contactNumber: cleanText(r["contact_number"]),
    email: cleanText(r["email"]),
    isSubcon: parseBooleanLike(r["is_subcon"]),
    coverageArea: cleanText(r["coverage_area"]),
  }));
}
