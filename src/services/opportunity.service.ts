import mongoose from "mongoose";
import type { CreateOpportunityDto } from "../dto/createOpportunity.dto.js";
import type { MongoIdParamDto } from "../dto/mongoIdParam.dto.js";
import type {
  LinkOpportunityAttachmentDto,
  ShareOpportunityAttachmentDto,
} from "../dto/opportunityAttachment.dto.js";
import type { PatchOpportunityDto } from "../dto/patchOpportunity.dto.js";
import { failResult, okResult, type ServiceResult } from "../lib/serviceResponse.js";
import {
  addPublicAssetAvailableTo,
  buildPublicAssetFileUrl,
  createPublicAsset,
  linkPublicAssetReference,
  unlinkPublicAssetReference,
} from "../lib/publicAssetFiles.js";
import { ExternalOrgModel } from "../models/externalOrg.model.js";
import { LineOfBusinessModel } from "../models/lineOfBusiness.model.js";
import { MarketSegmentModel } from "../models/marketSegment.model.js";
import { LocationModel } from "../models/location.model.js";
import { OpportunityModel } from "../models/opportunity/opportunityHeader.model.js";
import { PublicAssetModel } from "../models/publicAsset.model.js";
import { StatusModel } from "../models/status.model.js";
import { UserModel } from "../models/user.model.js";
import { OpportunityDetailModel } from "../models/opportunity/opportunityDetail.model.js";
import { logger } from "../lib/logger.js";



type OpportunityOut = {
  id: string;
  ownerId: string;
  ownerName: string;
  availableTo: string[];
  lineOfBusinessId: string;
  lineOfBusinessName: string;
  marketSegmentId: string;
  marketSegmentName: string;
  leadQualificationId: string;
  leadQualificationName: string;
  leadQualificationColor: string;
  customer: { customerName: string; customerId: string | null };
  endUser: { endUserName: string; endUserId: string | null };
  contact: { contactName: string; contactDetails: string[] };
  notes: string;
  location: { provinceId: string | null; regencyId: string | null; districtId: string | null };
  locationNames: { provinceName: string; regencyName: string; districtName: string };
  propability: number;
  taxRate: number;
  subTotal: number;
  taxAmount: number;
  grandTotal: number;
  estimateCloseDate: Date | undefined;
  actualCloseDate: Date | undefined;
  attachments: Array<{
    fileId: string;
    url: string;
    filename: string;
    contentType: string;
    extension: string;
  }>;
  attachmentAssetIds: string[];
  attachmentUrls: string[];
  details: Array<{ id: string; description: string; quantity: number; price: number }>;
  createdAt: Date | undefined;
  updatedAt: Date | undefined;
};

type OpportunityHeaderOut = Omit<OpportunityOut, "details">;

type OpportunityDetailOut = { id: string; description: string; quantity: number; price: number };

function calculateOpportunityTotals(
  details: Array<{ quantity: number; price: number }>,
  taxRate: number,
): { subTotal: number; taxAmount: number; grandTotal: number } {
  const subTotal = Math.max(
    0,
    details.reduce((sum, d) => sum + Number(d.quantity ?? 0) * Number(d.price ?? 0), 0),
  );
  const taxAmount = Math.max(0, (subTotal * Number(taxRate ?? 0)) / 100);
  return { subTotal, taxAmount, grandTotal: subTotal + taxAmount };
}

function opportunityTotalsPayload(
  details: Array<{ quantity: number; price: number }>,
  taxRate: number,
): { taxRate: number; subTotal: number; taxAmount: number; grandTotal: number } {
  const totals = calculateOpportunityTotals(details, taxRate);
  return {
    taxRate: Number(taxRate ?? 0),
    subTotal: totals.subTotal,
    taxAmount: totals.taxAmount,
    grandTotal: totals.grandTotal,
  };
}

function parseCloseMonth(monthValue: string | null | undefined): Date | null {
  if (!monthValue) return null;
  const trimmed = monthValue.trim();
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  return new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
}

function toOpportunityOut(
  row: any,
  details: Array<{ _id: unknown; description: string; quantity: number; price: number }>,
  ownerName: string,
  lineOfBusinessName: string,
  marketSegmentName: string,
  leadQualificationMeta: { name: string; color: string },
  locationNameMap: Map<string, string>,
  attachmentMetaMap: Map<
    string,
    { filename: string; contentType: string; extension: string }
  >,
): OpportunityOut {
  const attachmentAssetIds = (row.attachmentAssetIds ?? []).map(String);
  const attachments = attachmentAssetIds.map((fileId: string) => {
    const meta = attachmentMetaMap.get(fileId) ?? {
      filename: "",
      contentType: "application/octet-stream",
      extension: "",
    };
    return {
      fileId,
      url: buildPublicAssetFileUrl(fileId),
      filename: meta.filename || `${fileId}.${meta.extension || "file"}`,
      contentType: meta.contentType || "application/octet-stream",
      extension: meta.extension || "",
    };
  });
  return {
    id: String(row._id),
    ownerId: String(row.ownerId),
    ownerName,
    availableTo: (row.availableTo ?? []).map(String),
    lineOfBusinessId: String(row.lineOfBusinessId),
    lineOfBusinessName,
    marketSegmentId: String(row.marketSegmentId),
    marketSegmentName,
    leadQualificationId: String(row.leadQualificationId),
    leadQualificationName: leadQualificationMeta.name,
    leadQualificationColor: leadQualificationMeta.color,
    customer: {
      customerName: String(row.customer?.customerName ?? ""),
      customerId: row.customer?.customerId ? String(row.customer.customerId) : null,
    },
    endUser: {
      endUserName: String(row.endUser?.endUserName ?? ""),
      endUserId: row.endUser?.endUserId ? String(row.endUser.endUserId) : null,
    },
    contact: {
      contactName: String(row.contact?.contactName ?? ""),
      contactDetails: (row.contact?.contactDetails ?? []).map(String),
    },
    notes: String(row.notes ?? ""),
    location: {
      provinceId: row.location?.provinceId ? String(row.location.provinceId) : null,
      regencyId: row.location?.regencyId ? String(row.location.regencyId) : null,
      districtId: row.location?.districtId ? String(row.location.districtId) : null,
    },
    locationNames: {
      provinceName: row.location?.provinceId
        ? (locationNameMap.get(String(row.location.provinceId)) ?? "")
        : "",
      regencyName: row.location?.regencyId
        ? (locationNameMap.get(String(row.location.regencyId)) ?? "")
        : "",
      districtName: row.location?.districtId
        ? (locationNameMap.get(String(row.location.districtId)) ?? "")
        : "",
    },
    propability: Number(row.propability ?? 0),
    taxRate: Number(row.taxRate ?? 0),
    subTotal: Number(row.subTotal ?? 0),
    taxAmount: Number(row.taxAmount ?? 0),
    grandTotal: Number(row.grandTotal ?? 0),
    estimateCloseDate: row.estimateCloseDate,
    actualCloseDate: row.actualCloseDate,
    attachments,
    attachmentAssetIds,
    attachmentUrls: attachments.map((x: { url: string }) => x.url),
    details: details.map((d) => ({
      id: String(d._id),
      description: d.description,
      quantity: d.quantity,
      price: d.price,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toOpportunityHeaderOut(row: any): OpportunityHeaderOut {
  const attachmentAssetIds = (row.attachmentAssetIds ?? []).map(String);
  const attachments = attachmentAssetIds.map((fileId: string) => ({
    fileId,
    url: buildPublicAssetFileUrl(fileId),
    filename: "",
    contentType: "application/octet-stream",
    extension: "",
  }));
  return {
    id: String(row._id),
    ownerId: String(row.ownerId),
    ownerName: "",
    availableTo: (row.availableTo ?? []).map(String),
    lineOfBusinessId: String(row.lineOfBusinessId),
    lineOfBusinessName: "",
    marketSegmentId: String(row.marketSegmentId),
    marketSegmentName: "",
    leadQualificationId: String(row.leadQualificationId),
    leadQualificationName: "",
    leadQualificationColor: "#6b7280",
    customer: {
      customerName: String(row.customer?.customerName ?? ""),
      customerId: row.customer?.customerId ? String(row.customer.customerId) : null,
    },
    endUser: {
      endUserName: String(row.endUser?.endUserName ?? ""),
      endUserId: row.endUser?.endUserId ? String(row.endUser.endUserId) : null,
    },
    contact: {
      contactName: String(row.contact?.contactName ?? ""),
      contactDetails: (row.contact?.contactDetails ?? []).map(String),
    },
    notes: String(row.notes ?? ""),
    location: {
      provinceId: row.location?.provinceId ? String(row.location.provinceId) : null,
      regencyId: row.location?.regencyId ? String(row.location.regencyId) : null,
      districtId: row.location?.districtId ? String(row.location.districtId) : null,
    },
    locationNames: {
      provinceName: "",
      regencyName: "",
      districtName: "",
    },
    propability: Number(row.propability ?? 0),
    taxRate: Number(row.taxRate ?? 0),
    subTotal: Number(row.subTotal ?? 0),
    taxAmount: Number(row.taxAmount ?? 0),
    grandTotal: Number(row.grandTotal ?? 0),
    estimateCloseDate: row.estimateCloseDate,
    actualCloseDate: row.actualCloseDate,
    attachments,
    attachmentAssetIds,
    attachmentUrls: attachments.map((x: { url: string }) => x.url),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toOpportunityDetailOut(row: {
  _id: unknown;
  description: string;
  quantity: number;
  price: number;
}): OpportunityDetailOut {
  return {
    id: String(row._id),
    description: String(row.description ?? ""),
    quantity: Number(row.quantity ?? 0),
    price: Number(row.price ?? 0),
  };
}

async function listAllOpportunityRows(): Promise<ServiceResult<any[]>> {
  const rows = await OpportunityModel.find()
    .sort({ createdAt: -1 })
    .lean()
    .exec();
  return okResult(200, "OK", rows);
}

async function getExternalOrgNameById(
  externalOrgId: string | null | undefined,
): Promise<string> {
  if (!externalOrgId || !mongoose.isValidObjectId(externalOrgId)) return "";
  const org = await ExternalOrgModel.findById(externalOrgId).select("name").lean().exec();
  return org?.name ? String(org.name) : "";
}

async function getOwnerNameMap(ownerIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(ownerIds)].filter((x) => mongoose.isValidObjectId(x));
  if (ids.length === 0) return new Map();
  const users = await UserModel.find({ _id: { $in: ids } })
    .select("_id email")
    .lean()
    .exec();
  return new Map(users.map((u) => [String(u._id), String(u.email ?? "")]));
}

async function getLineOfBusinessNameMap(ids: string[]): Promise<Map<string, string>> {
  const validIds = [...new Set(ids)].filter((x) => mongoose.isValidObjectId(x));
  if (validIds.length === 0) return new Map();
  const rows = await LineOfBusinessModel.find({ _id: { $in: validIds } })
    .select("_id name")
    .lean()
    .exec();
  return new Map(rows.map((r) => [String(r._id), String(r.name ?? "")]));
}

async function getMarketSegmentNameMap(ids: string[]): Promise<Map<string, string>> {
  const validIds = [...new Set(ids)].filter((x) => mongoose.isValidObjectId(x));
  if (validIds.length === 0) return new Map();
  const rows = await MarketSegmentModel.find({ _id: { $in: validIds } })
    .select("_id name")
    .lean()
    .exec();
  return new Map(rows.map((r) => [String(r._id), String(r.name ?? "")]));
}

async function getLeadQualificationMetaMap(
  ids: string[],
): Promise<Map<string, { name: string; color: string }>> {
  const validIds = [...new Set(ids)].filter((x) => mongoose.isValidObjectId(x));
  if (validIds.length === 0) return new Map();
  const rows = await StatusModel.find({ _id: { $in: validIds } })
    .select("_id name color")
    .lean()
    .exec();
  return new Map(
    rows.map((r) => [
      String(r._id),
      { name: String(r.name ?? ""), color: String(r.color ?? "#6b7280") },
    ]),
  );
}

async function getLocationNameMap(ids: string[]): Promise<Map<string, string>> {
  const validIds = [...new Set(ids)].filter((x) => mongoose.isValidObjectId(x));
  if (validIds.length === 0) return new Map();
  const rows = await LocationModel.find({ _id: { $in: validIds } })
    .select("_id name")
    .lean()
    .exec();
  return new Map(rows.map((r) => [String(r._id), String(r.name ?? "")]));
}

async function getAttachmentMetaMap(
  fileIds: string[],
): Promise<Map<string, { filename: string; contentType: string; extension: string }>> {
  const validIds = [...new Set(fileIds)].filter((x) => mongoose.isValidObjectId(x));
  if (validIds.length === 0) return new Map();
  const rows = await PublicAssetModel.find({
    fileId: { $in: validIds.map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .select("fileId filename contentType extension")
    .lean()
    .exec();
  return new Map(
    rows.map((r) => [
      String(r.fileId),
      {
        filename: String(r.filename ?? ""),
        contentType: String(r.contentType ?? "application/octet-stream"),
        extension: String(r.extension ?? ""),
      },
    ]),
  );
}

export async function listOpportunities(
  userId: string | undefined,
  options?: {
    page?: number;
    limit?: number;
    onlyMine?: boolean;
    customerId?: string;
    endUserId?: string;
    leadQualificationId?: string;
  },
): Promise<
  ServiceResult<{
    items: OpportunityOut[];
    total: number;
    page: number;
    limit: number;
  }>
> {
  const page = Math.max(1, Number(options?.page ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(options?.limit ?? 20) || 20));
  const filter: Record<string, unknown> = {};
  if (options?.onlyMine) {
    if (!userId || !mongoose.isValidObjectId(userId)) {
      return failResult(401, "Invalid session");
    }
    filter.ownerId = new mongoose.Types.ObjectId(userId);
  }
  if (options?.customerId) {
    if (!mongoose.isValidObjectId(options.customerId)) {
      return failResult(400, "customerId must be a mongodb id");
    }
    filter["customer.customerId"] = new mongoose.Types.ObjectId(options.customerId);
  }
  if (options?.endUserId) {
    if (!mongoose.isValidObjectId(options.endUserId)) {
      return failResult(400, "endUserId must be a mongodb id");
    }
    filter["endUser.endUserId"] = new mongoose.Types.ObjectId(options.endUserId);
  }
  if (options?.leadQualificationId) {
    if (!mongoose.isValidObjectId(options.leadQualificationId)) {
      return failResult(400, "leadQualificationId must be a mongodb id");
    }
    filter.leadQualificationId = new mongoose.Types.ObjectId(options.leadQualificationId);
  }

  const total = await OpportunityModel.countDocuments(filter).exec();
  const skip = (page - 1) * limit;
  const rows = await OpportunityModel.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean()
    .exec();

  const ownerNameMap = await getOwnerNameMap(rows.map((r) => String(r.ownerId)));
  const lineOfBusinessNameMap = await getLineOfBusinessNameMap(
    rows.map((r) => String(r.lineOfBusinessId)),
  );
  const marketSegmentNameMap = await getMarketSegmentNameMap(
    rows.map((r) => String(r.marketSegmentId)),
  );
  const leadQualificationMetaMap = await getLeadQualificationMetaMap(
    rows.map((r) => String(r.leadQualificationId)),
  );
  const locationNameMap = await getLocationNameMap(
    rows.flatMap((r) => [
      String(r.location?.provinceId ?? ""),
      String(r.location?.regencyId ?? ""),
      String(r.location?.districtId ?? ""),
    ]),
  );
  const attachmentMetaMap = await getAttachmentMetaMap(
    rows.flatMap((r) => (r.attachmentAssetIds ?? []).map(String)),
  );
  const ids = rows.map((r) => r._id).filter(Boolean);
  const details = await OpportunityDetailModel.find({ opportunityId: { $in: ids } })
    .sort({ createdAt: 1 })
    .lean()
    .exec();
  const byOppId = new Map<string, typeof details>();
  for (const d of details) {
    const key = String(d.opportunityId);
    const list = byOppId.get(key);
    if (list) list.push(d);
    else byOppId.set(key, [d]);
  }

  return okResult(200, "OK", {
    items: rows.map((r) =>
      toOpportunityOut(
        r,
        byOppId.get(String(r._id)) ?? [],
        ownerNameMap.get(String(r.ownerId)) || String(r.ownerId),
        lineOfBusinessNameMap.get(String(r.lineOfBusinessId)) || "",
        marketSegmentNameMap.get(String(r.marketSegmentId)) || "",
        leadQualificationMetaMap.get(String(r.leadQualificationId)) ?? {
          name: "",
          color: "#6b7280",
        },
        locationNameMap,
        attachmentMetaMap,
      ),
    ),
    total,
    page,
    limit,
  });
}

export async function getOpportunityById(
  _userId: string | undefined,
  opportunityId: string | undefined,
): Promise<ServiceResult<{ item: OpportunityOut }>> {
  if (!opportunityId || !mongoose.isValidObjectId(opportunityId)) {
    return failResult(400, "Invalid opportunity id");
  }
  const row = await OpportunityModel.findById(opportunityId).lean().exec();
  if (!row) {
    return failResult(404, "Opportunity not found");
  }
  const details = await OpportunityDetailModel.find({ opportunityId })
    .sort({ createdAt: 1 })
    .lean()
    .exec();
  const ownerNameMap = await getOwnerNameMap([String(row.ownerId)]);
  const lineOfBusinessNameMap = await getLineOfBusinessNameMap([String(row.lineOfBusinessId)]);
  const marketSegmentNameMap = await getMarketSegmentNameMap([String(row.marketSegmentId)]);
  const leadQualificationMetaMap = await getLeadQualificationMetaMap([
    String(row.leadQualificationId),
  ]);
  const locationNameMap = await getLocationNameMap([
    String(row.location?.provinceId ?? ""),
    String(row.location?.regencyId ?? ""),
    String(row.location?.districtId ?? ""),
  ]);
  const attachmentMetaMap = new Map<
    string,
    { filename: string; contentType: string; extension: string }
  >();

  logger.debug("getOpportunityById");
  logger.debug({
    row,
    details,
    ownerNameMap,
    lineOfBusinessNameMap,
    marketSegmentNameMap,
  })
  return okResult(200, "OK", {
    item: toOpportunityOut(
      row,
      details,
      ownerNameMap.get(String(row.ownerId)) || String(row.ownerId),
      lineOfBusinessNameMap.get(String(row.lineOfBusinessId)) || "",
      marketSegmentNameMap.get(String(row.marketSegmentId)) || "",
      leadQualificationMetaMap.get(String(row.leadQualificationId)) ?? {
        name: "",
        color: "#6b7280",
      },
      locationNameMap,
      attachmentMetaMap,
    ),
  });
}

export async function listOpportunityHeaders(
  _userId: string | undefined,
): Promise<ServiceResult<{ items: OpportunityHeaderOut[] }>> {
  const allRows = await listAllOpportunityRows();
  if (!allRows.success) return allRows;
  const rows = allRows.data;
  const ownerNameMap = await getOwnerNameMap(rows.map((r) => String(r.ownerId)));
  const lineOfBusinessNameMap = await getLineOfBusinessNameMap(
    rows.map((r) => String(r.lineOfBusinessId)),
  );
  const marketSegmentNameMap = await getMarketSegmentNameMap(
    rows.map((r) => String(r.marketSegmentId)),
  );
  const leadQualificationMetaMap = await getLeadQualificationMetaMap(
    rows.map((r) => String(r.leadQualificationId)),
  );
  const locationNameMap = await getLocationNameMap(
    rows.flatMap((r) => [
      String(r.location?.provinceId ?? ""),
      String(r.location?.regencyId ?? ""),
      String(r.location?.districtId ?? ""),
    ]),
  );
  const attachmentMetaMap = await getAttachmentMetaMap(
    rows.flatMap((r) => (r.attachmentAssetIds ?? []).map(String)),
  );
  return okResult(200, "OK", {
    items: rows.map((r) => ({
      ...toOpportunityOut(
        r,
        [],
        ownerNameMap.get(String(r.ownerId)) || String(r.ownerId),
        lineOfBusinessNameMap.get(String(r.lineOfBusinessId)) || "",
        marketSegmentNameMap.get(String(r.marketSegmentId)) || "",
        leadQualificationMetaMap.get(String(r.leadQualificationId)) ?? {
          name: "",
          color: "#6b7280",
        },
        locationNameMap,
        attachmentMetaMap,
      ),
      ownerName: ownerNameMap.get(String(r.ownerId)) || String(r.ownerId),
      lineOfBusinessName: lineOfBusinessNameMap.get(String(r.lineOfBusinessId)) || "",
      marketSegmentName: marketSegmentNameMap.get(String(r.marketSegmentId)) || "",
    })),
  });
}

export async function listOpportunityDetails(
  _userId: string | undefined,
  opportunityIds?: string[],
): Promise<
  ServiceResult<{
    items: Array<{
      opportunityId: string;
      details: OpportunityDetailOut[];
      totalPrice: number;
    }>;
  }>
> {
  const allRows = await listAllOpportunityRows();
  if (!allRows.success) return allRows;
  const allItems = allRows.data;
  const allIdSet = new Set(allItems.map((r) => String(r._id)));

  const requestedIds = Array.isArray(opportunityIds)
    ? opportunityIds.filter((id) => mongoose.isValidObjectId(id))
    : [];
  const effectiveIds =
    requestedIds.length > 0
      ? requestedIds.filter((id) => allIdSet.has(id))
      : [...allIdSet];
  if (effectiveIds.length === 0) {
    return okResult(200, "OK", { items: [] });
  }

  const rows = await OpportunityDetailModel.find({ opportunityId: { $in: effectiveIds } })
    .sort({ createdAt: 1 })
    .lean()
    .exec();
  const grouped = new Map<string, OpportunityDetailOut[]>();
  for (const row of rows) {
    const id = String(row.opportunityId);
    const list = grouped.get(id) ?? [];
    list.push(toOpportunityDetailOut(row));
    grouped.set(id, list);
  }
  const items = effectiveIds.map((id) => {
    const details = grouped.get(id) ?? [];
    return {
      opportunityId: id,
      details,
      totalPrice: details.reduce(
        (sum, d) => sum + Number(d.quantity ?? 0) * Number(d.price ?? 0),
        0,
      ),
    };
  });
  return okResult(200, "OK", { items });
}

export async function createOpportunity(
  userId: string | undefined,
  dto: CreateOpportunityDto,
): Promise<ServiceResult<{ item: OpportunityOut }>> {
  const ownerId = dto.ownerId ?? userId;
  if (!ownerId || !mongoose.isValidObjectId(ownerId)) {
    return failResult(400, "Invalid owner id");
  }
  const availableTo = [...new Set([ownerId, ...(dto.availableTo ?? [])])];
  const contactName = dto.contactName?.trim() ?? "";
  if (!contactName) {
    return failResult(400, "Contact person is required");
  }
  const customerName = await getExternalOrgNameById(dto.customerId);
  const endUserName = await getExternalOrgNameById(dto.endUserId);
  const estimateCloseDate = parseCloseMonth(dto.estimateCloseDate);
  const actualCloseDate = parseCloseMonth(dto.actualCloseDate);

  const session = await mongoose.startSession();
  try {
    let createdId = "";
    await session.withTransaction(async () => {
      const created = await OpportunityModel.create(
        [
          {
            ownerId,
            availableTo,
            lineOfBusinessId: dto.lineOfBusinessId,
            marketSegmentId: dto.marketSegmentId,
            leadQualificationId: dto.leadQualificationId,
            customer: {
              customerName,
              customerId: dto.customerId ?? null,
            },
            endUser: {
              endUserName,
              endUserId: dto.endUserId ?? null,
            },
            contact: {
              contactName,
              contactDetails: (dto.contactDetails ?? []).map((x) => x.trim()).filter(Boolean),
            },
            notes: dto.notes?.trim() ?? "",
            location: {
              provinceId: dto.provinceId ?? null,
              regencyId: dto.regencyId ?? null,
              districtId: dto.districtId ?? null,
            },
            propability: dto.propability ?? 0,
            ...opportunityTotalsPayload(
              (dto.details ?? []).filter((d) => d.description.trim().length > 0).map((d) => ({
                quantity: d.quantity,
                price: d.price,
              })),
              Number(dto.taxRate ?? 0),
            ),
            estimateCloseDate,
            actualCloseDate,
            attachmentAssetIds: (dto.attachmentAssetIds ?? [])
              .filter((id) => mongoose.isValidObjectId(id))
              .map((id) => new mongoose.Types.ObjectId(id)),
            attachmentsUpdatedAt: new Date(),
          },
        ],
        { session },
      );
      const createdDoc = created[0];
      if (!createdDoc) {
        throw new Error("create failed");
      }
      createdId = String(createdDoc._id);

      const details = (dto.details ?? []).filter((d) => d.description.trim().length > 0);
      if (details.length > 0) {
        await OpportunityDetailModel.insertMany(
          details.map((d) => ({
            opportunityId: createdId,
            description: d.description.trim(),
            quantity: d.quantity,
            price: d.price,
          })),
          { session },
        );
      }
    });

    const row = await OpportunityModel.findById(createdId).lean().exec();
    if (!row) return failResult(500, "Could not create opportunity");
    const details = await OpportunityDetailModel.find({ opportunityId: createdId }).lean().exec();
    const ownerNameMap = await getOwnerNameMap([String(row.ownerId)]);
    const lineOfBusinessNameMap = await getLineOfBusinessNameMap([String(row.lineOfBusinessId)]);
    const marketSegmentNameMap = await getMarketSegmentNameMap([String(row.marketSegmentId)]);
    const leadQualificationMetaMap = await getLeadQualificationMetaMap([
      String(row.leadQualificationId),
    ]);
    const locationNameMap = await getLocationNameMap([
      String(row.location?.provinceId ?? ""),
      String(row.location?.regencyId ?? ""),
      String(row.location?.districtId ?? ""),
    ]);
    const attachmentMetaMap = await getAttachmentMetaMap(
      (row.attachmentAssetIds ?? []).map(String),
    );
    return okResult(201, "Created", {
      item: toOpportunityOut(
        row,
        details,
        ownerNameMap.get(String(row.ownerId)) || String(row.ownerId),
        lineOfBusinessNameMap.get(String(row.lineOfBusinessId)) || "",
        marketSegmentNameMap.get(String(row.marketSegmentId)) || "",
        leadQualificationMetaMap.get(String(row.leadQualificationId)) ?? {
          name: "",
          color: "#6b7280",
        },
        locationNameMap,
        attachmentMetaMap,
      ),
    });
  } catch {
    return failResult(500, "Could not create opportunity");
  } finally {
    await session.endSession();
  }
}

export async function patchOpportunity(
  userId: string | undefined,
  opportunityId: string | undefined,
  dto: PatchOpportunityDto,
): Promise<ServiceResult<{ item: OpportunityOut }>> {
  if (!userId || !mongoose.isValidObjectId(userId)) {
    return failResult(401, "Invalid session");
  }
  if (!opportunityId || !mongoose.isValidObjectId(opportunityId)) {
    return failResult(400, "Invalid opportunity id");
  }

  const existing = await OpportunityModel.findOne({
    _id: opportunityId,
    ownerId: userId,
  })
    .lean()
    .exec();
  if (!existing) return failResult(404, "Opportunity not found");

  const $set: Record<string, unknown> = {};
  if (dto.ownerId !== undefined) $set.ownerId = dto.ownerId;
  if (dto.availableTo !== undefined) {
    const owner = String(dto.ownerId ?? existing.ownerId);
    $set.availableTo = [...new Set([owner, ...dto.availableTo])];
  }
  if (dto.lineOfBusinessId !== undefined) $set.lineOfBusinessId = dto.lineOfBusinessId;
  if (dto.marketSegmentId !== undefined) $set.marketSegmentId = dto.marketSegmentId;
  if (dto.leadQualificationId !== undefined) $set.leadQualificationId = dto.leadQualificationId;
  if (dto.customerId !== undefined) {
    const customerName = await getExternalOrgNameById(dto.customerId);
    $set.customer = {
      customerName,
      customerId: dto.customerId === null ? null : (dto.customerId ?? existing.customer?.customerId ?? null),
    };
  }
  if (dto.endUserId !== undefined) {
    const endUserName = await getExternalOrgNameById(dto.endUserId);
    $set.endUser = {
      endUserName,
      endUserId: dto.endUserId === null ? null : (dto.endUserId ?? existing.endUser?.endUserId ?? null),
    };
  }
  if (dto.contactName !== undefined && !dto.contactName.trim()) {
    return failResult(400, "Contact person is required");
  }
  if (dto.contactName !== undefined || dto.contactDetails !== undefined) {
    $set.contact = {
      contactName: dto.contactName?.trim() ?? existing.contact?.contactName ?? "",
      contactDetails:
        dto.contactDetails?.map((x) => x.trim()).filter(Boolean) ??
        (existing.contact?.contactDetails ?? []).map(String),
    };
  }
  if (dto.notes !== undefined) $set.notes = dto.notes.trim();
  if (dto.provinceId !== undefined || dto.regencyId !== undefined || dto.districtId !== undefined) {
    $set.location = {
      provinceId: dto.provinceId === null ? null : (dto.provinceId ?? existing.location?.provinceId ?? null),
      regencyId: dto.regencyId === null ? null : (dto.regencyId ?? existing.location?.regencyId ?? null),
      districtId: dto.districtId === null ? null : (dto.districtId ?? existing.location?.districtId ?? null),
    };
  }
  if (dto.propability !== undefined) $set.propability = dto.propability;
  if (dto.estimateCloseDate !== undefined) {
    $set.estimateCloseDate = parseCloseMonth(dto.estimateCloseDate);
  }
  if (dto.actualCloseDate !== undefined) {
    $set.actualCloseDate = parseCloseMonth(dto.actualCloseDate);
  }
  if (dto.attachmentAssetIds !== undefined) {
    $set.attachmentAssetIds = dto.attachmentAssetIds
      .filter((id) => mongoose.isValidObjectId(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    $set.attachmentsUpdatedAt = new Date();
  }

  const willRecalcTotals = dto.taxRate !== undefined || dto.details !== undefined;
  if (willRecalcTotals) {
    const detailsForTotals =
      dto.details !== undefined
        ? dto.details
            .filter((d) => d.description.trim().length > 0)
            .map((d) => ({ quantity: d.quantity, price: d.price }))
        : (
            await OpportunityDetailModel.find({ opportunityId })
              .select("quantity price")
              .lean()
              .exec()
          ).map((d) => ({ quantity: Number(d.quantity ?? 0), price: Number(d.price ?? 0) }));
    const taxRate = Number(dto.taxRate ?? existing.taxRate ?? 0);
    Object.assign($set, opportunityTotalsPayload(detailsForTotals, taxRate));
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (Object.keys($set).length > 0) {
        await OpportunityModel.updateOne({ _id: opportunityId }, { $set }, { session }).exec();
      }
      if (dto.details !== undefined) {
        await OpportunityDetailModel.deleteMany({ opportunityId }, { session }).exec();
        const details = dto.details.filter((d) => d.description.trim().length > 0);
        if (details.length > 0) {
          await OpportunityDetailModel.insertMany(
            details.map((d) => ({
              opportunityId,
              description: d.description.trim(),
              quantity: d.quantity,
              price: d.price,
            })),
            { session },
          );
        }
      }
    });

    const updated = await OpportunityModel.findById(opportunityId).lean().exec();
    if (!updated) return failResult(404, "Opportunity not found");
    const details = await OpportunityDetailModel.find({ opportunityId }).lean().exec();
    const ownerNameMap = await getOwnerNameMap([String(updated.ownerId)]);
    const lineOfBusinessNameMap = await getLineOfBusinessNameMap([String(updated.lineOfBusinessId)]);
    const marketSegmentNameMap = await getMarketSegmentNameMap([String(updated.marketSegmentId)]);
    const leadQualificationMetaMap = await getLeadQualificationMetaMap([
      String(updated.leadQualificationId),
    ]);
    const locationNameMap = await getLocationNameMap([
      String(updated.location?.provinceId ?? ""),
      String(updated.location?.regencyId ?? ""),
      String(updated.location?.districtId ?? ""),
    ]);
    const attachmentMetaMap = await getAttachmentMetaMap(
      (updated.attachmentAssetIds ?? []).map(String),
    );
    return okResult(200, "Updated", {
      item: toOpportunityOut(
        updated,
        details,
        ownerNameMap.get(String(updated.ownerId)) || String(updated.ownerId),
        lineOfBusinessNameMap.get(String(updated.lineOfBusinessId)) || "",
        marketSegmentNameMap.get(String(updated.marketSegmentId)) || "",
        leadQualificationMetaMap.get(String(updated.leadQualificationId)) ?? {
          name: "",
          color: "#6b7280",
        },
        locationNameMap,
        attachmentMetaMap,
      ),
    });
  } catch {
    return failResult(500, "Could not update opportunity");
  } finally {
    await session.endSession();
  }
}

export async function uploadOpportunityAttachment(
  userId: string | undefined,
  opportunityId: string | undefined,
  file: { buffer: Buffer; originalname: string; mimetype: string },
): Promise<ServiceResult<{ fileId: string; url: string; attachmentAssetIds: string[] }>> {
  if (!userId || !mongoose.isValidObjectId(userId)) {
    return failResult(401, "Invalid session");
  }
  if (!opportunityId || !mongoose.isValidObjectId(opportunityId)) {
    return failResult(400, "Invalid opportunity id");
  }
  if (!file?.buffer?.length) {
    return failResult(400, "Missing file");
  }

  const session = await mongoose.startSession();
  try {
    let createdFileId = "";
    let createdUrl = "";
    let nextAttachments: string[] = [];
    await session.withTransaction(async () => {
      const existing = await OpportunityModel.findOne({
        _id: opportunityId,
        $or: [{ ownerId: userId }, { availableTo: userId }],
      })
        .session(session)
        .lean()
        .exec();
      if (!existing) throw new Error("not_found");

      const created = await createPublicAsset(
        {
          buffer: file.buffer,
          filename: file.originalname,
          contentType: file.mimetype,
          isPublic: false,
          createdBy: userId,
          availableTo: [userId],
        },
        { session },
      );
      createdFileId = created.fileId;
      createdUrl = created.url;
      await OpportunityModel.updateOne(
        { _id: opportunityId },
        {
          $addToSet: { attachmentAssetIds: new mongoose.Types.ObjectId(created.fileId) },
          $set: { attachmentsUpdatedAt: new Date() },
        },
        { session },
      ).exec();
      const updated = await OpportunityModel.findById(opportunityId)
        .session(session)
        .lean()
        .exec();
      nextAttachments = (updated?.attachmentAssetIds ?? []).map(String);
    });
    return okResult(201, "Attachment uploaded", {
      fileId: createdFileId,
      url: createdUrl,
      attachmentAssetIds: nextAttachments,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "not_found") {
      return failResult(404, "Opportunity not found");
    }
    return failResult(500, "Could not upload attachment");
  } finally {
    await session.endSession();
  }
}

export async function linkOpportunityAttachment(
  userId: string | undefined,
  opportunityId: string | undefined,
  dto: LinkOpportunityAttachmentDto,
): Promise<ServiceResult<{ attachmentAssetIds: string[] }>> {
  if (!userId || !mongoose.isValidObjectId(userId)) {
    return failResult(401, "Invalid session");
  }
  if (!opportunityId || !mongoose.isValidObjectId(opportunityId)) {
    return failResult(400, "Invalid opportunity id");
  }
  if (!mongoose.isValidObjectId(dto.assetFileId)) {
    return failResult(400, "Invalid asset file id");
  }

  const session = await mongoose.startSession();
  try {
    let nextAttachments: string[] = [];
    await session.withTransaction(async () => {
      const existing = await OpportunityModel.findOne({
        _id: opportunityId,
        $or: [{ ownerId: userId }, { availableTo: userId }],
      })
        .session(session)
        .lean()
        .exec();
      if (!existing) throw new Error("not_found");

      const linked = await linkPublicAssetReference(dto.assetFileId, { session });
      if (!linked) throw new Error("asset_not_found");

      await addPublicAssetAvailableTo(dto.assetFileId, [userId]);
      await OpportunityModel.updateOne(
        { _id: opportunityId },
        {
          $addToSet: { attachmentAssetIds: new mongoose.Types.ObjectId(dto.assetFileId) },
          $set: { attachmentsUpdatedAt: new Date() },
        },
        { session },
      ).exec();
      const updated = await OpportunityModel.findById(opportunityId)
        .session(session)
        .lean()
        .exec();
      nextAttachments = (updated?.attachmentAssetIds ?? []).map(String);
    });
    return okResult(200, "Attachment linked", { attachmentAssetIds: nextAttachments });
  } catch (err) {
    if (err instanceof Error && err.message === "not_found") {
      return failResult(404, "Opportunity not found");
    }
    if (err instanceof Error && err.message === "asset_not_found") {
      return failResult(404, "Asset not found");
    }
    return failResult(500, "Could not link attachment");
  } finally {
    await session.endSession();
  }
}

export async function shareOpportunityAttachment(
  userId: string | undefined,
  opportunityId: string | undefined,
  dto: ShareOpportunityAttachmentDto,
): Promise<ServiceResult<{ sharedUserIds: string[] }>> {
  if (!userId || !mongoose.isValidObjectId(userId)) {
    return failResult(401, "Invalid session");
  }
  if (!opportunityId || !mongoose.isValidObjectId(opportunityId)) {
    return failResult(400, "Invalid opportunity id");
  }
  if (!mongoose.isValidObjectId(dto.assetFileId)) {
    return failResult(400, "Invalid asset file id");
  }

  const opp = await OpportunityModel.findOne({
    _id: opportunityId,
    $or: [{ ownerId: userId }, { availableTo: userId }],
  })
    .select("ownerId availableTo attachmentAssetIds")
    .lean()
    .exec();
  if (!opp) return failResult(404, "Opportunity not found");

  const hasAttachment = (opp.attachmentAssetIds ?? []).some(
    (id: unknown) => String(id) === String(dto.assetFileId),
  );
  if (!hasAttachment) {
    return failResult(400, "Asset is not attached to this opportunity");
  }

  const candidateIds = dto.shareWithAllAvailable
    ? [String(opp.ownerId), ...(opp.availableTo ?? []).map(String)]
    : dto.userIds;
  const unique = [...new Set(candidateIds)].filter((id) => mongoose.isValidObjectId(id));
  const allowed = new Set([String(opp.ownerId), ...(opp.availableTo ?? []).map(String)]);
  const shareIds = unique.filter((id) => allowed.has(id));

  if (shareIds.length === 0) {
    return failResult(400, "No valid users selected to share");
  }
  const updated = await addPublicAssetAvailableTo(dto.assetFileId, shareIds);
  if (!updated) return failResult(404, "Asset not found");
  return okResult(200, "Attachment shared", { sharedUserIds: shareIds });
}

export async function removeOpportunityAttachment(
  userId: string | undefined,
  opportunityId: string | undefined,
  assetFileId: string | undefined,
): Promise<ServiceResult<{ attachmentAssetIds: string[] }>> {
  if (!userId || !mongoose.isValidObjectId(userId)) {
    return failResult(401, "Invalid session");
  }
  if (!opportunityId || !mongoose.isValidObjectId(opportunityId)) {
    return failResult(400, "Invalid opportunity id");
  }
  if (!assetFileId || !mongoose.isValidObjectId(assetFileId)) {
    return failResult(400, "Invalid asset file id");
  }

  const session = await mongoose.startSession();
  try {
    let nextAttachments: string[] = [];
    await session.withTransaction(async () => {
      const existing = await OpportunityModel.findOne({
        _id: opportunityId,
        $or: [{ ownerId: userId }, { availableTo: userId }],
      })
        .session(session)
        .lean()
        .exec();
      if (!existing) throw new Error("not_found");

      await OpportunityModel.updateOne(
        { _id: opportunityId },
        {
          $pull: { attachmentAssetIds: new mongoose.Types.ObjectId(assetFileId) },
          $set: { attachmentsUpdatedAt: new Date() },
        },
        { session },
      ).exec();
      await unlinkPublicAssetReference(assetFileId, { session });
      const updated = await OpportunityModel.findById(opportunityId)
        .session(session)
        .lean()
        .exec();
      nextAttachments = (updated?.attachmentAssetIds ?? []).map(String);
    });
    return okResult(200, "Attachment removed", { attachmentAssetIds: nextAttachments });
  } catch (err) {
    if (err instanceof Error && err.message === "not_found") {
      return failResult(404, "Opportunity not found");
    }
    return failResult(500, "Could not remove attachment");
  } finally {
    await session.endSession();
  }
}

export async function deleteOpportunity(
  userId: string | undefined,
  dto: MongoIdParamDto,
): Promise<ServiceResult<{ id: string }>> {
  if (!userId || !mongoose.isValidObjectId(userId)) {
    return failResult(401, "Invalid session");
  }
  const existing = await OpportunityModel.findOne({
    _id: dto.id,
    $or: [{ ownerId: userId }, { availableTo: userId }],
  })
    .select("_id")
    .lean()
    .exec();
  if (!existing) return failResult(404, "Opportunity not found");

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await OpportunityDetailModel.deleteMany({ opportunityId: dto.id }, { session }).exec();
      await OpportunityModel.deleteOne({ _id: dto.id }, { session }).exec();
    });
    return okResult(200, "Deleted", { id: dto.id });
  } catch {
    return failResult(500, "Could not delete opportunity");
  } finally {
    await session.endSession();
  }
}
