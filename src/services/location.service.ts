import mongoose from "mongoose";
import type { CreateLocationDto } from "../dto/createLocation.dto.js";
import type { MongoIdParamDto } from "../dto/mongoIdParam.dto.js";
import type { PatchLocationDto } from "../dto/patchLocation.dto.js";
import { logger } from "../lib/logger.js";
import { failResult, okResult, type ServiceResult } from "../lib/serviceResponse.js";
import { LocationModel, type LocationLevel } from "../models/location.model.js";

type LocationOut = {
  id: string;
  name: string;
  level: LocationLevel;
  parentId: string | null;
  isActive: boolean;
  createdAt: Date | undefined;
  updatedAt: Date | undefined;
};

const WILAYAH_BASE = "https://wilayah.id/api";
const LOCATION_LEVEL_ORDER: Record<LocationLevel, number> = {
  country: 0,
  province: 1,
  regency: 2,
  district: 3,
};
let ensureLocationSchemaPromise: Promise<void> | null = null;

function isMongoDuplicateKeyError(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    const msg = String((err as Error).message ?? "");
    if (msg.includes("E11000") || msg.includes("duplicate key")) return true;
  }
  const o = err as { code?: number; errorResponse?: { code?: number } };
  return o.code === 11000 || o.errorResponse?.code === 11000;
}

function toLocationOut(row: {
  _id: unknown;
  name: string;
  level: LocationLevel;
  parentId?: mongoose.Types.ObjectId | string | null;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}): LocationOut {
  return {
    id: String(row._id),
    name: row.name,
    level: row.level,
    parentId: row.parentId ? String(row.parentId) : null,
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function ensureLocationSchemaState(): Promise<void> {
  if (ensureLocationSchemaPromise == null) {
    ensureLocationSchemaPromise = (async () => {
      const collection = LocationModel.collection;
      const indexes = await collection.indexes();
      const indexNames = new Set(indexes.map((x) => x.name));
      const oldIndexNames = new Set([
        "level_1_code_1",
        "level_1_parentCode_1_name_1",
      ]);
      for (const indexName of oldIndexNames) {
        if (!indexNames.has(indexName)) continue;
        await collection.dropIndex(indexName);
      }

      const indonesiaId = await migrateLegacyHierarchyAndEnsureCountry();
      await deduplicateLocationsByHierarchy();

      const latestIndexes = await collection.indexes();
      const latestNames = new Set(latestIndexes.map((x) => x.name));
      if (!latestNames.has("level_1_parentId_1_name_1")) {
        await collection.createIndex(
          { level: 1, parentId: 1, name: 1 },
          { unique: true, name: "level_1_parentId_1_name_1" },
        );
      }
      if (!latestNames.has("level_1_parentId_1_isActive_1")) {
        await collection.createIndex(
          { level: 1, parentId: 1, isActive: 1 },
          { name: "level_1_parentId_1_isActive_1" },
        );
      }

      if (indonesiaId) {
        await LocationModel.updateMany(
          { level: "province", parentId: null },
          { $set: { parentId: indonesiaId } },
        ).exec();
      }
    })().catch((err) => {
      ensureLocationSchemaPromise = null;
      throw err;
    });
  }
  await ensureLocationSchemaPromise;
}

async function migrateLegacyHierarchyAndEnsureCountry(): Promise<mongoose.Types.ObjectId | null> {
  const collection = LocationModel.collection;
  const docs = (await collection
    .find(
      {},
      {
        projection: {
          _id: 1,
          level: 1,
          parentId: 1,
          code: 1,
          parentCode: 1,
          name: 1,
        },
      },
    )
    .toArray()) as Array<{
    _id: mongoose.Types.ObjectId;
    level?: LocationLevel;
    parentId?: mongoose.Types.ObjectId | null;
    code?: string;
    parentCode?: string | null;
    name?: string;
  }>;

  const byLevelCode = new Map<string, mongoose.Types.ObjectId>();
  for (const doc of docs) {
    if (!doc.level || !doc.code) continue;
    byLevelCode.set(`${doc.level}:${doc.code}`, doc._id);
  }

  const indonesia = (await LocationModel.findOne({
    level: "country",
    parentId: null,
    name: "Indonesia",
  })
    .select("_id")
    .lean()
    .exec()) as { _id: mongoose.Types.ObjectId } | null;
  let indonesiaId: mongoose.Types.ObjectId;
  if (!indonesia) {
    const created = await LocationModel.create({
      name: "Indonesia",
      level: "country",
      parentId: null,
      isActive: true,
    });
    indonesiaId = new mongoose.Types.ObjectId(String(created._id));
  } else {
    indonesiaId = new mongoose.Types.ObjectId(String(indonesia._id));
  }

  for (const doc of docs) {
    if (!doc.level) continue;
    let nextParentId: mongoose.Types.ObjectId | null = null;
    if (doc.level === "province") {
      nextParentId = indonesiaId;
    } else if (doc.level === "regency" && doc.parentCode) {
      nextParentId = byLevelCode.get(`province:${doc.parentCode}`) ?? null;
    } else if (doc.level === "district" && doc.parentCode) {
      nextParentId = byLevelCode.get(`regency:${doc.parentCode}`) ?? null;
    }
    if (
      (doc.parentId ? String(doc.parentId) : null) !==
      (nextParentId ? String(nextParentId) : null)
    ) {
      const duplicate = await LocationModel.findOne({
        _id: { $ne: doc._id },
        level: doc.level,
        parentId: nextParentId,
        name: doc.name ?? "",
      })
        .select("_id")
        .lean()
        .exec();
      if (duplicate) {
        // Keep earliest matching row, drop this duplicate legacy row to avoid unique collisions.
        await LocationModel.deleteOne({ _id: doc._id }).exec();
        continue;
      }
      await collection.updateOne(
        { _id: doc._id },
        {
          $set: { parentId: nextParentId },
          $unset: { code: "", parentCode: "", sourceUpdatedAt: "" },
        },
      );
    }
  }

  return indonesiaId;
}

async function deduplicateLocationsByHierarchy(): Promise<void> {
  const rows = (await LocationModel.find()
    .select("_id level parentId name createdAt")
    .sort({ createdAt: 1 })
    .lean()
    .exec()) as Array<{
    _id: mongoose.Types.ObjectId;
    level: LocationLevel;
    parentId?: mongoose.Types.ObjectId | null;
    name: string;
  }>;
  rows.sort((a, b) => LOCATION_LEVEL_ORDER[a.level] - LOCATION_LEVEL_ORDER[b.level]);
  const seen = new Set<string>();
  const duplicateIds: mongoose.Types.ObjectId[] = [];
  for (const row of rows) {
    const key = `${row.level}:${row.parentId ? String(row.parentId) : "null"}:${row.name}`;
    if (seen.has(key)) {
      duplicateIds.push(new mongoose.Types.ObjectId(String(row._id)));
    } else {
      seen.add(key);
    }
  }
  if (duplicateIds.length > 0) {
    await LocationModel.deleteMany({ _id: { $in: duplicateIds } }).exec();
  }
}

export async function listLocations(input: {
  level?: string;
  parentId?: string;
  includeInactive?: boolean;
}): Promise<ServiceResult<{ items: LocationOut[] }>> {
  await ensureLocationSchemaState();
  const filter: Record<string, unknown> = {};
  if (input.level && ["country", "province", "regency", "district"].includes(input.level)) {
    filter.level = input.level;
  }
  if (input.parentId && input.parentId.trim()) {
    if (!mongoose.isValidObjectId(input.parentId)) {
      return failResult(400, "parentId must be a mongodb id");
    }
    filter.parentId = new mongoose.Types.ObjectId(input.parentId.trim());
  }
  if (!input.includeInactive) {
    filter.isActive = true;
  }
  const rows = await LocationModel.find(filter)
    .sort({ level: 1, name: 1 })
    .lean()
    .exec();
  return okResult(200, "OK", { items: rows.map((r) => toLocationOut(r)) });
}

async function validateLocationHierarchy(
  input: {
  level: LocationLevel;
  parentId?: string | null;
  },
): Promise<ServiceResult<{ parentId: mongoose.Types.ObjectId | null }>> {
  const parentIdRaw = input.parentId?.trim() || null;

  if (input.level === "country") {
    return okResult(200, "OK", { parentId: null });
  }

  if (!parentIdRaw || !mongoose.isValidObjectId(parentIdRaw)) {
    return failResult(400, `${input.level} requires a valid parentId`);
  }

  const parentId = new mongoose.Types.ObjectId(parentIdRaw);
  const parent = await LocationModel.findById(parentId)
    .select("level")
    .lean()
    .exec();
  if (!parent) {
    return failResult(400, "Selected parent does not exist");
  }

  if (input.level === "province" && parent.level !== "country") {
    return failResult(400, "Province parent must be a country");
  }
  if (input.level === "regency" && parent.level !== "province") {
    return failResult(400, "Regency parent must be a province");
  }
  if (input.level === "district" && parent.level !== "regency") {
    return failResult(400, "District parent must be a regency");
  }

  return okResult(200, "OK", { parentId });
}

export async function createLocation(
  dto: CreateLocationDto,
): Promise<ServiceResult<{ item: LocationOut }>> {
  await ensureLocationSchemaState();
  const hierarchy = await validateLocationHierarchy({
    level: dto.level,
    parentId: dto.parentId ?? null,
  });
  if (!hierarchy.success) {
    return hierarchy;
  }
  try {
    const created = await LocationModel.create({
      name: dto.name.trim(),
      level: dto.level,
      parentId: hierarchy.data.parentId,
      isActive: dto.isActive ?? true,
    });
    return okResult(201, "Created", { item: toLocationOut(created) });
  } catch (err) {
    if (isMongoDuplicateKeyError(err)) {
      return failResult(409, "Location name already exists under this parent");
    }
    return failResult(500, "Could not create location");
  }
}

export async function patchLocation(
  locationId: string | undefined,
  dto: PatchLocationDto,
): Promise<ServiceResult<{ item: LocationOut }>> {
  await ensureLocationSchemaState();
  if (!locationId || !mongoose.isValidObjectId(locationId)) {
    return failResult(400, "Invalid location id");
  }
  const $set: Record<string, unknown> = {};
  if (dto.name !== undefined) $set.name = dto.name.trim();
  if (dto.level !== undefined) $set.level = dto.level;
  if (dto.isActive !== undefined) $set.isActive = dto.isActive;
  if (Object.keys($set).length === 0) {
    return failResult(400, "Provide at least one field to update");
  }

  const existing = await LocationModel.findById(locationId).select("level parentId").lean().exec();
  if (!existing) {
    return failResult(404, "Location not found");
  }
  const nextLevel = (dto.level ?? existing.level) as LocationLevel;
  const nextParentId = dto.parentId !== undefined ? dto.parentId : String(existing.parentId ?? "");
  const hierarchy = await validateLocationHierarchy({
    level: nextLevel,
    parentId: nextParentId,
  });
  if (!hierarchy.success) {
    return hierarchy;
  }
  $set.parentId = hierarchy.data.parentId;

  try {
    const updated = await LocationModel.findByIdAndUpdate(
      locationId,
      { $set },
      { new: true, runValidators: true },
    )
      .lean()
      .exec();
    if (updated == null) return failResult(404, "Location not found");
    return okResult(200, "Updated", { item: toLocationOut(updated) });
  } catch (err) {
    if (isMongoDuplicateKeyError(err)) {
      return failResult(409, "Location name already exists under this parent");
    }
    return failResult(500, "Could not update location");
  }
}

export async function deleteLocation(
  dto: MongoIdParamDto,
): Promise<ServiceResult<{ id: string }>> {
  await ensureLocationSchemaState();
  const deleted = await LocationModel.findByIdAndDelete(dto.id).lean().exec();
  if (deleted == null) return failResult(404, "Location not found");
  return okResult(200, "Deleted", { id: dto.id });
}

export async function getLocationChoices(input: {
  countryId?: string;
  provinceId?: string;
  regencyId?: string;
  includeInactive?: boolean;
}): Promise<
  ServiceResult<{
    countries: LocationOut[];
    provinces: LocationOut[];
    regencies: LocationOut[];
    districts: LocationOut[];
  }>
> {
  await ensureLocationSchemaState();
  const activeFilter = input.includeInactive ? {} : { isActive: true };
  const countryId = input.countryId?.trim() || "";
  const provinceId = input.provinceId?.trim() || "";
  const regencyId = input.regencyId?.trim() || "";

  if (countryId && !mongoose.isValidObjectId(countryId)) {
    return failResult(400, "countryId must be a mongodb id");
  }
  if (provinceId && !mongoose.isValidObjectId(provinceId)) {
    return failResult(400, "provinceId must be a mongodb id");
  }
  if (regencyId && !mongoose.isValidObjectId(regencyId)) {
    return failResult(400, "regencyId must be a mongodb id");
  }

  const countries = await LocationModel.find({ ...activeFilter, level: "country" })
    .sort({ name: 1 })
    .lean()
    .exec();

  const provincesFilter: Record<string, unknown> = { ...activeFilter, level: "province" };
  if (countryId) provincesFilter.parentId = new mongoose.Types.ObjectId(countryId);
  const provinces = await LocationModel.find(provincesFilter)
    .sort({ name: 1 })
    .lean()
    .exec();

  const regencies = provinceId
    ? await LocationModel.find({
        ...activeFilter,
        level: "regency",
        parentId: new mongoose.Types.ObjectId(provinceId),
      })
        .sort({ name: 1 })
        .lean()
        .exec()
    : [];

  const districts = regencyId
    ? await LocationModel.find({
        ...activeFilter,
        level: "district",
        parentId: new mongoose.Types.ObjectId(regencyId),
      })
        .sort({ name: 1 })
        .lean()
        .exec()
    : [];

  return okResult(200, "OK", {
    countries: countries.map((r) => toLocationOut(r)),
    provinces: provinces.map((r) => toLocationOut(r)),
    regencies: regencies.map((r) => toLocationOut(r)),
    districts: districts.map((r) => toLocationOut(r)),
  });
}

async function fetchWilayahRows(url: string): Promise<{ code: string; name: string }[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sync source error (${res.status})`);
  const json = (await res.json()) as { data?: Array<{ code?: string; name?: string }> };
  return (json.data ?? [])
    .filter((x) => typeof x.code === "string" && typeof x.name === "string")
    .map((x) => ({ code: String(x.code), name: String(x.name) }));
}

export async function syncLocationsFromWilayahId(): Promise<
  ServiceResult<{
    countries: number;
    provinces: number;
    regencies: number;
    districts: number;
    created: number;
    updated: number;
    skipped: number;
  }>
> {
  await ensureLocationSchemaState();
  logger.info("Location sync started");
  let created = 0;
  let updated = 0;
  let skipped = 0;

  const countryFilter = {
    level: "country" as const,
    parentId: null,
    name: "Indonesia",
  };
  const countryResult = await LocationModel.updateOne(
    countryFilter,
    {
      $set: { isActive: true },
      $setOnInsert: countryFilter,
    },
    { upsert: true },
  ).exec();
  if (countryResult.upsertedCount > 0) created += 1;
  else if (countryResult.modifiedCount > 0) updated += 1;
  else skipped += 1;
  const countryDoc = await LocationModel.findOne(countryFilter).select("_id").lean().exec();
  if (!countryDoc) {
    return failResult(500, "Could not ensure default country");
  }
  const indonesiaId = new mongoose.Types.ObjectId(String(countryDoc._id));

  const provinces = await fetchWilayahRows(`${WILAYAH_BASE}/provinces.json`);
  logger.info({ provinceCount: provinces.length }, "Fetched provinces from wilayah.id");
  let regenciesCount = 0;
  let districtsCount = 0;

  for (let i = 0; i < provinces.length; i += 1) {
    const p = provinces[i];
    if (!p) continue;
    logger.info(
      { progress: `${i + 1}/${provinces.length}`, province: p.name, provinceCode: p.code },
      "Syncing province",
    );
    const provinceFilter = {
      level: "province" as const,
      parentId: indonesiaId,
      name: p.name.trim(),
    };
    const provinceResult = await LocationModel.updateOne(
      provinceFilter,
      {
        $set: { isActive: true },
        $setOnInsert: provinceFilter,
      },
      { upsert: true },
    ).exec();
    if (provinceResult.upsertedCount > 0) created += 1;
    else if (provinceResult.modifiedCount > 0) updated += 1;
    else skipped += 1;
    const provinceDoc = await LocationModel.findOne(provinceFilter).select("_id").lean().exec();
    if (!provinceDoc) continue;
    const provinceId = new mongoose.Types.ObjectId(String(provinceDoc._id));

    const regencies = await fetchWilayahRows(`${WILAYAH_BASE}/regencies/${p.code}.json`);
    logger.info(
      { province: p.name, regencyCount: regencies.length },
      "Fetched regencies for province",
    );
    regenciesCount += regencies.length;
    for (const r of regencies) {
      const regencyFilter = {
        level: "regency" as const,
        parentId: provinceId,
        name: r.name.trim(),
      };
      const regencyResult = await LocationModel.updateOne(
        regencyFilter,
        {
          $set: { isActive: true },
          $setOnInsert: regencyFilter,
        },
        { upsert: true },
      ).exec();
      if (regencyResult.upsertedCount > 0) created += 1;
      else if (regencyResult.modifiedCount > 0) updated += 1;
      else skipped += 1;
      const regencyDoc = await LocationModel.findOne(regencyFilter).select("_id").lean().exec();
      if (!regencyDoc) continue;
      const regencyId = new mongoose.Types.ObjectId(String(regencyDoc._id));

      const districts = await fetchWilayahRows(`${WILAYAH_BASE}/districts/${r.code}.json`);
      logger.info(
        { province: p.name, regency: r.name, districtCount: districts.length },
        "Fetched districts for regency",
      );
      districtsCount += districts.length;
      for (const d of districts) {
        const districtFilter = {
          level: "district" as const,
          parentId: regencyId,
          name: d.name.trim(),
        };
        const districtResult = await LocationModel.updateOne(
          districtFilter,
          {
            $set: { isActive: true },
            $setOnInsert: districtFilter,
          },
          { upsert: true },
        ).exec();
        if (districtResult.upsertedCount > 0) created += 1;
        else if (districtResult.modifiedCount > 0) updated += 1;
        else skipped += 1;
      }
    }
    logger.info(
      { progress: `${i + 1}/${provinces.length}`, created, updated, skipped },
      "Province sync progress",
    );
  }

  logger.info(
    {
      countries: 1,
      provinces: provinces.length,
      regencies: regenciesCount,
      districts: districtsCount,
      created,
      updated,
      skipped,
    },
    "Location sync finished",
  );
  return okResult(200, "Synced", {
    countries: 1,
    provinces: provinces.length,
    regencies: regenciesCount,
    districts: districtsCount,
    created,
    updated,
    skipped,
  });
}
