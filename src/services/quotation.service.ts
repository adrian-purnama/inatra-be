import mongoose from "mongoose";
import type { CreateQuotationDto } from "../dto/createQuotation.dto.js";
import type { PatchQuotationDto } from "../dto/patchQuotation.dto.js";
import type { MongoIdParamDto } from "../dto/mongoIdParam.dto.js";
import type { RejectQuotationDto } from "../dto/rejectQuotation.dto.js";
import type { ReviseQuotationDto } from "../dto/reviseQuotation.dto.js";
import { failResult, okResult, type ServiceResult } from "../lib/serviceResponse.js";
import { buildPublicAssetFileUrl } from "../lib/publicAssetFiles.js";
import { suggestPermissionName } from "../lib/listHttpRoutes.js";
import {
  getEffectivePermissionIdsForRoleIds,
  getEffectivePermissionKeys,
} from "../lib/rbac.js";
import { PermissionModel } from "../models/permission.model.js";
import { ExternalOrgModel } from "../models/externalOrg.model.js";
import { LineOfBusinessModel } from "../models/lineOfBusiness.model.js";
import { LocationModel } from "../models/location.model.js";
import { OpportunityDetailModel } from "../models/opportunity/opportunityDetail.model.js";
import { MarketSegmentModel } from "../models/marketSegment.model.js";
import { OpportunityModel } from "../models/opportunity/opportunityHeader.model.js";
import {
  QUOTATION_STATUS_VALUES,
  QuotationHeaderModel,
  type QuotationStatus,
} from "../models/quotation/quotationHeader.model.js";
import { QuotationDetailModel } from "../models/quotation/quotationDetail.model.js";
import { UserModel } from "../models/user.model.js";

const QUOTATION_APPROVE_ROUTE = { path: "/quotation/:id/approve", method: "POST" };
const QUOTATION_REJECT_ROUTE = { path: "/quotation/:id/reject", method: "POST" };
const QUOTATION_APPROVE_PERM_FALLBACK = suggestPermissionName(
  QUOTATION_APPROVE_ROUTE.path,
  QUOTATION_APPROVE_ROUTE.method,
);
const QUOTATION_REJECT_PERM_FALLBACK = suggestPermissionName(
  QUOTATION_REJECT_ROUTE.path,
  QUOTATION_REJECT_ROUTE.method,
);

let cachedApproveRejectPermIds: { approveId: string | null; rejectId: string | null } | null =
  null;

type QuotationDetailOut = {
  id: string;
  sortOrder: number;
  description: string;
  quantity: number;
  unit: string;
  sku: string;
  price: number;
  discount: number;
  taxRate: number;
  lineNotes: string;
};

type QuotationOut = {
  id: string;
  opportunityId: string;
  ownerId: string;
  ownerName: string;
  availableTo: string[];
  quotationNo: string;
  revisionNo: number;
  quotationStatus: QuotationStatus;
  rejectReason: string;
  approverId: string | null;
  approverEmail: string;
  approvedAt: Date | null;
  lineOfBusinessId: string;
  lineOfBusinessName: string;
  marketSegmentId: string;
  marketSegmentName: string;
  customer: { customerName: string; customerId: string | null };
  endUser: { endUserName: string; endUserId: string | null };
  contact: { contactName: string; contactDetails: string[] };
  notes: string;
  location: { provinceId: string | null; regencyId: string | null; districtId: string | null };
  locationNames: { provinceName: string; regencyName: string; districtName: string };
  propability: number;
  estimateCloseDate: Date | null;
  actualCloseDate: Date | null;
  attachmentAssetIds: string[];
  attachmentUrls: string[];
  currency: string;
  taxRate: number;
  discountTotal: number;
  subTotal: number;
  taxAmount: number;
  grandTotal: number;
  validUntil: Date | null;
  termsAndConditions: string;
  isActive: boolean;
  createdAt: Date | undefined;
  updatedAt: Date | undefined;
  details: QuotationDetailOut[];
};

function parseCloseMonth(monthValue: string | null | undefined): Date | null {
  if (!monthValue) return null;
  const trimmed = monthValue.trim();
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  return new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function asObjectIdOrNull(value: string | null | undefined): mongoose.Types.ObjectId | null {
  if (!value || !mongoose.isValidObjectId(value)) return null;
  return new mongoose.Types.ObjectId(value);
}

function buildQuotationNo(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const seq = String(now.getUTCMilliseconds()).padStart(3, "0");
  return `${seq}/QUO/${month}/${year}`;
}

function calculateTotals(details: Array<{ quantity: number; price: number; discount?: number }>, taxRate: number, discountTotal: number): {
  subTotal: number;
  taxAmount: number;
  grandTotal: number;
} {
  const raw = details.reduce(
    (sum, d) => sum + Number(d.quantity ?? 0) * Number(d.price ?? 0) - Number(d.discount ?? 0),
    0,
  );
  const subTotal = Math.max(0, raw - Number(discountTotal ?? 0));
  const taxAmount = Math.max(0, (subTotal * Number(taxRate ?? 0)) / 100);
  return { subTotal, taxAmount, grandTotal: subTotal + taxAmount };
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

async function getLocationNameMap(ids: string[]): Promise<Map<string, string>> {
  const validIds = [...new Set(ids)].filter((x) => mongoose.isValidObjectId(x));
  if (validIds.length === 0) return new Map();
  const rows = await LocationModel.find({ _id: { $in: validIds } })
    .select("_id name")
    .lean()
    .exec();
  return new Map(rows.map((r) => [String(r._id), String(r.name ?? "")]));
}

function toQuotationDetailOut(row: any): QuotationDetailOut {
  return {
    id: String(row._id),
    sortOrder: Number(row.sortOrder ?? 0),
    description: String(row.description ?? ""),
    quantity: Number(row.quantity ?? 0),
    unit: String(row.unit ?? ""),
    sku: String(row.sku ?? ""),
    price: Number(row.price ?? 0),
    discount: Number(row.discount ?? 0),
    taxRate: Number(row.taxRate ?? 0),
    lineNotes: String(row.lineNotes ?? ""),
  };
}

function toQuotationOut(
  row: any,
  details: any[],
  ownerNameMap: Map<string, string>,
  lobNameMap: Map<string, string>,
  segNameMap: Map<string, string>,
  locationNameMap: Map<string, string>,
  approverNameMap: Map<string, string>,
): QuotationOut {
  const attachmentAssetIds = (row.attachmentAssetIds ?? []).map(String);
  const approverId = row.approver?.approverId ? String(row.approver.approverId) : null;
  return {
    id: String(row._id),
    opportunityId: String(row.opportunityId),
    ownerId: String(row.ownerId),
    ownerName: ownerNameMap.get(String(row.ownerId)) ?? String(row.ownerId),
    availableTo: (row.availableTo ?? []).map(String),
    quotationNo: String(row.quotationNo ?? ""),
    revisionNo: Number(row.revisionNo ?? 0),
    quotationStatus: (row.quotationStatus ?? "draft") as QuotationStatus,
    rejectReason: String(row.rejectReason ?? ""),
    approverId,
    approverEmail: approverId ? approverNameMap.get(approverId) ?? "" : "",
    approvedAt: row.approver?.approvedAt ?? null,
    lineOfBusinessId: String(row.lineOfBusinessId ?? ""),
    lineOfBusinessName: lobNameMap.get(String(row.lineOfBusinessId)) ?? "",
    marketSegmentId: String(row.marketSegmentId ?? ""),
    marketSegmentName: segNameMap.get(String(row.marketSegmentId)) ?? "",
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
    estimateCloseDate: row.estimateCloseDate ?? null,
    actualCloseDate: row.actualCloseDate ?? null,
    attachmentAssetIds,
    attachmentUrls: attachmentAssetIds.map((id: string) => buildPublicAssetFileUrl(id)),
    currency: String(row.currency ?? "IDR"),
    taxRate: Number(row.taxRate ?? 0),
    discountTotal: Number(row.discountTotal ?? 0),
    subTotal: Number(row.subTotal ?? 0),
    taxAmount: Number(row.taxAmount ?? 0),
    grandTotal: Number(row.grandTotal ?? 0),
    validUntil: row.validUntil ?? null,
    termsAndConditions: String(row.termsAndConditions ?? ""),
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    details: details.map((d) => toQuotationDetailOut(d)),
  };
}

async function getQuotationApproveRejectPermissionIds(): Promise<{
  approveId: string | null;
  rejectId: string | null;
}> {
  if (cachedApproveRejectPermIds) return cachedApproveRejectPermIds;
  const [approveRow, rejectRow] = await Promise.all([
    PermissionModel.findOne({
      path: QUOTATION_APPROVE_ROUTE.path,
      method: QUOTATION_APPROVE_ROUTE.method,
    })
      .select("_id")
      .lean()
      .exec(),
    PermissionModel.findOne({
      path: QUOTATION_REJECT_ROUTE.path,
      method: QUOTATION_REJECT_ROUTE.method,
    })
      .select("_id")
      .lean()
      .exec(),
  ]);
  cachedApproveRejectPermIds = {
    approveId: approveRow?._id ? String(approveRow._id) : null,
    rejectId: rejectRow?._id ? String(rejectRow._id) : null,
  };
  return cachedApproveRejectPermIds;
}

async function userIsSuperAdmin(userId: string): Promise<boolean> {
  if (!mongoose.isValidObjectId(userId)) return false;
  const user = await UserModel.findById(userId).select("isSuperAdmin isActive").lean().exec();
  return user?.isActive === true && user?.isSuperAdmin === true;
}

async function userHasBothApproveRejectRoutePermissions(userId: string): Promise<boolean> {
  const user = await UserModel.findById(userId).select("roleIds isActive").lean().exec();
  if (!user || user.isActive !== true) return false;
  const { approveId, rejectId } = await getQuotationApproveRejectPermissionIds();
  if (!approveId || !rejectId) {
    const keys = new Set(
      (await getEffectivePermissionKeys(userId)).map((k) => String(k).trim().toLowerCase()),
    );
    return (
      keys.has(QUOTATION_APPROVE_PERM_FALLBACK.toLowerCase()) &&
      keys.has(QUOTATION_REJECT_PERM_FALLBACK.toLowerCase())
    );
  }
  const permIds = new Set(await getEffectivePermissionIdsForRoleIds(user.roleIds ?? []));
  return permIds.has(approveId) && permIds.has(rejectId);
}

async function userCanBeQuotationApproverCandidate(userId: string): Promise<boolean> {
  if (!mongoose.isValidObjectId(userId)) return false;
  if (await userIsSuperAdmin(userId)) return true;
  return userHasBothApproveRejectRoutePermissions(userId);
}

type QuotationApproverRow = { approver?: { approverId?: unknown } | null };

async function userCanApproveOrRejectQuotation(
  actingUserId: string,
  row: QuotationApproverRow,
): Promise<boolean> {
  if (!mongoose.isValidObjectId(actingUserId)) return false;
  if (await userIsSuperAdmin(actingUserId)) return true;
  if (!(await userCanBeQuotationApproverCandidate(actingUserId))) return false;
  const assigned = row.approver?.approverId ? String(row.approver.approverId) : "";
  return assigned === actingUserId;
}

function isQuotationOwner(userId: string, row: { ownerId: unknown }): boolean {
  return String(row.ownerId) === userId;
}

function statusAfterSubmit(current: QuotationStatus, hasApprover: boolean): QuotationStatus {
  if (!hasApprover) return "draft";
  if (current === "rejected" || current === "draft" || current === "pending_approved") {
    return "pending_approved";
  }
  return current;
}

export async function listQuotationApproverCandidates(): Promise<
  ServiceResult<{ items: Array<{ id: string; email: string }> }>
> {
  const users = await UserModel.find({ isActive: true })
    .select("_id email")
    .lean()
    .exec();
  const out: Array<{ id: string; email: string }> = [];
  for (const u of users) {
    const id = String(u._id);
    if (await userCanBeQuotationApproverCandidate(id)) {
      out.push({ id, email: String(u.email ?? "") });
    }
  }
  return okResult(200, "OK", { items: out });
}

export async function listQuotations(
  userId: string | undefined,
  options?: {
    page?: number;
    limit?: number;
    onlyMine?: boolean;
    opportunityId?: string;
    quotationStatus?: string;
    customerId?: string;
    endUserId?: string;
  },
): Promise<ServiceResult<{ items: QuotationOut[]; total: number; page: number; limit: number }>> {
  const page = Math.max(1, Number(options?.page ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(options?.limit ?? 20) || 20));
  const filter: Record<string, unknown> = {};
  if (options?.onlyMine && userId && mongoose.isValidObjectId(userId)) {
    filter.ownerId = new mongoose.Types.ObjectId(userId);
  }
  if (options?.opportunityId && mongoose.isValidObjectId(options.opportunityId)) {
    filter.opportunityId = new mongoose.Types.ObjectId(options.opportunityId);
  }
  if (options?.quotationStatus && QUOTATION_STATUS_VALUES.includes(options.quotationStatus as QuotationStatus)) {
    filter.quotationStatus = options.quotationStatus;
  }
  if (options?.customerId && mongoose.isValidObjectId(options.customerId)) {
    filter["customer.customerId"] = new mongoose.Types.ObjectId(options.customerId);
  }
  if (options?.endUserId && mongoose.isValidObjectId(options.endUserId)) {
    filter["endUser.endUserId"] = new mongoose.Types.ObjectId(options.endUserId);
  }
  const total = await QuotationHeaderModel.countDocuments(filter).exec();
  const rows = await QuotationHeaderModel.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean()
    .exec();
  const headerIds = rows.map((r) => String(r._id));
  const details = await QuotationDetailModel.find({ quotationId: { $in: headerIds } })
    .sort({ sortOrder: 1, createdAt: 1 })
    .lean()
    .exec();
  const detailsMap = new Map<string, any[]>();
  for (const d of details) {
    const id = String(d.quotationId);
    const list = detailsMap.get(id) ?? [];
    list.push(d);
    detailsMap.set(id, list);
  }
  const ownerNameMap = await getOwnerNameMap(rows.map((r) => String(r.ownerId)));
  const lobNameMap = await getLineOfBusinessNameMap(rows.map((r) => String(r.lineOfBusinessId)));
  const segNameMap = await getMarketSegmentNameMap(rows.map((r) => String(r.marketSegmentId)));
  const locationNameMap = await getLocationNameMap(
    rows.flatMap((r) => [
      String(r.location?.provinceId ?? ""),
      String(r.location?.regencyId ?? ""),
      String(r.location?.districtId ?? ""),
    ]),
  );
  const approverNameMap = await getOwnerNameMap(
    rows.map((r) => String(r.approver?.approverId ?? "")).filter(Boolean),
  );
  return okResult(200, "OK", {
    items: rows.map((r) =>
      toQuotationOut(
        r,
        detailsMap.get(String(r._id)) ?? [],
        ownerNameMap,
        lobNameMap,
        segNameMap,
        locationNameMap,
        approverNameMap,
      ),
    ),
    total,
    page,
    limit,
  });
}

export async function getQuotationById(
  quotationId: string | undefined,
): Promise<ServiceResult<{ item: QuotationOut }>> {
  if (!quotationId || !mongoose.isValidObjectId(quotationId)) {
    return failResult(400, "Invalid quotation id");
  }
  const row = await QuotationHeaderModel.findById(quotationId).lean().exec();
  if (!row) return failResult(404, "Quotation not found");
  const details = await QuotationDetailModel.find({ quotationId })
    .sort({ sortOrder: 1, createdAt: 1 })
    .lean()
    .exec();
  const ownerNameMap = await getOwnerNameMap([String(row.ownerId)]);
  const lobNameMap = await getLineOfBusinessNameMap([String(row.lineOfBusinessId)]);
  const segNameMap = await getMarketSegmentNameMap([String(row.marketSegmentId)]);
  const locationNameMap = await getLocationNameMap([
    String(row.location?.provinceId ?? ""),
    String(row.location?.regencyId ?? ""),
    String(row.location?.districtId ?? ""),
  ]);
  const approverNameMap = await getOwnerNameMap([
    String(row.approver?.approverId ?? ""),
  ]);
  return okResult(200, "OK", {
    item: toQuotationOut(
      row,
      details,
      ownerNameMap,
      lobNameMap,
      segNameMap,
      locationNameMap,
      approverNameMap,
    ),
  });
}

async function resolveQuotationSeedFromOpportunity(opportunityId: string) {
  const row = await OpportunityModel.findById(opportunityId).lean().exec();
  if (!row) return null;
  const details = await OpportunityDetailModel.find({ opportunityId })
    .sort({ createdAt: 1 })
    .lean()
    .exec();
  return {
    ownerId: String(row.ownerId),
    availableTo: (row.availableTo ?? []).map(String),
    lineOfBusinessId: String(row.lineOfBusinessId),
    marketSegmentId: String(row.marketSegmentId),
    customerId: row.customer?.customerId ? String(row.customer.customerId) : null,
    endUserId: row.endUser?.endUserId ? String(row.endUser.endUserId) : null,
    contactName: String(row.contact?.contactName ?? ""),
    contactDetails: (row.contact?.contactDetails ?? []).map(String),
    notes: String(row.notes ?? ""),
    provinceId: row.location?.provinceId ? String(row.location.provinceId) : null,
    regencyId: row.location?.regencyId ? String(row.location.regencyId) : null,
    districtId: row.location?.districtId ? String(row.location.districtId) : null,
    propability: Number(row.propability ?? 0),
    estimateCloseDate: row.estimateCloseDate ?? null,
    actualCloseDate: row.actualCloseDate ?? null,
    attachmentAssetIds: (row.attachmentAssetIds ?? []).map(String),
    taxRate: Number(row.taxRate ?? 0),
    details: details.map((d) => ({
      sortOrder: 0,
      description: String(d.description ?? ""),
      quantity: Number(d.quantity ?? 0),
      unit: "",
      sku: "",
      price: Number(d.price ?? 0),
      discount: 0,
      taxRate: 0,
      lineNotes: "",
    })),
  };
}

export async function createQuotation(
  userId: string | undefined,
  dto: CreateQuotationDto,
): Promise<ServiceResult<{ item: QuotationOut }>> {
  const ownerId = dto.ownerId ?? userId;
  if (!ownerId || !mongoose.isValidObjectId(ownerId)) return failResult(400, "Invalid owner id");

  const seed =
    dto.opportunityId && mongoose.isValidObjectId(dto.opportunityId)
      ? await resolveQuotationSeedFromOpportunity(dto.opportunityId)
      : null;
  if (dto.opportunityId && !seed) return failResult(404, "Opportunity not found");

  const opportunityId =
    dto.opportunityId && mongoose.isValidObjectId(dto.opportunityId) ? dto.opportunityId : "";
  if (!opportunityId) return failResult(400, "opportunityId is required");
  const lineOfBusinessId = dto.lineOfBusinessId ?? seed?.lineOfBusinessId ?? "";
  const marketSegmentId = dto.marketSegmentId ?? seed?.marketSegmentId ?? "";
  if (!mongoose.isValidObjectId(lineOfBusinessId)) {
    return failResult(400, "lineOfBusinessId is required");
  }
  if (!mongoose.isValidObjectId(marketSegmentId)) {
    return failResult(400, "marketSegmentId is required");
  }

  const approverId = dto.approverId?.trim() || "";
  if (
    approverId &&
    (!mongoose.isValidObjectId(approverId) || !(await userCanBeQuotationApproverCandidate(approverId)))
  ) {
    return failResult(400, "Invalid approver user");
  }

  const detailsInput = (dto.details ?? seed?.details ?? []).filter(
    (d) => d.description.trim().length > 0,
  );
  const discountTotal = Number(dto.discountTotal ?? 0);
  const taxRate = Number(dto.taxRate ?? seed?.taxRate ?? 0);
  const totals = calculateTotals(detailsInput, taxRate, discountTotal);
  const customerId = dto.customerId ?? seed?.customerId ?? null;
  const endUserId = dto.endUserId ?? seed?.endUserId ?? null;
  const customerName = await getExternalOrgNameById(customerId ?? undefined);
  const endUserName = await getExternalOrgNameById(endUserId ?? undefined);
  const availableTo = [...new Set([ownerId, ...(dto.availableTo ?? seed?.availableTo ?? [])])];
  const estimateCloseDate = dto.estimateCloseDate
    ? parseCloseMonth(dto.estimateCloseDate)
    : seed?.estimateCloseDate ?? null;
  const actualCloseDate = dto.actualCloseDate
    ? parseCloseMonth(dto.actualCloseDate)
    : seed?.actualCloseDate ?? null;
  const quotationStatus = statusAfterSubmit("draft", Boolean(approverId));

  const createdDocs = await QuotationHeaderModel.create([
    {
      opportunityId,
      ownerId,
      availableTo,
      lineOfBusinessId,
      marketSegmentId,
      customer: { customerName, customerId: asObjectIdOrNull(customerId) },
      endUser: { endUserName, endUserId: asObjectIdOrNull(endUserId) },
      contact: {
        contactName: dto.contactName ?? seed?.contactName ?? "",
        contactDetails: dto.contactDetails ?? seed?.contactDetails ?? [],
      },
      notes: dto.notes ?? seed?.notes ?? "",
      location: {
        provinceId: asObjectIdOrNull(dto.provinceId ?? seed?.provinceId ?? null),
        regencyId: asObjectIdOrNull(dto.regencyId ?? seed?.regencyId ?? null),
        districtId: asObjectIdOrNull(dto.districtId ?? seed?.districtId ?? null),
      },
      propability: dto.propability ?? seed?.propability ?? 0,
      estimateCloseDate,
      actualCloseDate,
      attachmentAssetIds: (dto.attachmentAssetIds ?? seed?.attachmentAssetIds ?? [])
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(id)),
      attachmentsUpdatedAt: new Date(),
      quotationNo: dto.quotationNo?.trim() || buildQuotationNo(),
      revisionNo: dto.revisionNo ?? 0,
      quotationStatus,
      approver: {
        approverId: approverId ? new mongoose.Types.ObjectId(approverId) : null,
        approvedAt: null,
      },
      currency: dto.currency?.trim() || "IDR",
      taxRate,
      discountTotal,
      subTotal: totals.subTotal,
      taxAmount: totals.taxAmount,
      grandTotal: totals.grandTotal,
      validUntil: parseIsoDate(dto.validUntil ?? null),
      termsAndConditions: dto.termsAndConditions ?? "",
      isActive: true,
    },
  ]);
  const created = Array.isArray(createdDocs) ? createdDocs[0] : null;
  if (!created) return failResult(500, "Could not create quotation");

  if (detailsInput.length > 0) {
    await QuotationDetailModel.insertMany(
      detailsInput.map((d) => ({
        quotationId: created._id,
        sortOrder: Number(d.sortOrder ?? 0),
        description: d.description.trim(),
        quantity: Number(d.quantity ?? 0),
        unit: d.unit?.trim() ?? "",
        sku: d.sku?.trim() ?? "",
        price: Number(d.price ?? 0),
        discount: Number(d.discount ?? 0),
        taxRate: Number(d.taxRate ?? 0),
        lineNotes: d.lineNotes?.trim() ?? "",
      })),
    );
  }
  return getQuotationById(String(created._id));
}

export async function createDraftQuotationFromOpportunity(
  userId: string | undefined,
  opportunityId: string | undefined,
): Promise<ServiceResult<{ item: QuotationOut }>> {
  if (!userId || !mongoose.isValidObjectId(userId)) return failResult(401, "Invalid session");
  if (!opportunityId || !mongoose.isValidObjectId(opportunityId)) {
    return failResult(400, "Invalid opportunity id");
  }
  return createQuotation(userId, { opportunityId });
}

export async function patchQuotation(
  userId: string | undefined,
  quotationId: string | undefined,
  dto: PatchQuotationDto,
): Promise<ServiceResult<{ item: QuotationOut }>> {
  if (!userId || !mongoose.isValidObjectId(userId)) return failResult(401, "Invalid session");
  if (!quotationId || !mongoose.isValidObjectId(quotationId)) return failResult(400, "Invalid quotation id");
  const existing = await QuotationHeaderModel.findById(quotationId).lean().exec();
  if (!existing) return failResult(404, "Quotation not found");
  if (!isQuotationOwner(userId, existing)) {
    return failResult(403, "Only the quotation owner can edit");
  }
  if (!["draft", "rejected"].includes(String(existing.quotationStatus))) {
    return failResult(400, "Quotation cannot be edited in current status");
  }

  const $set: Record<string, unknown> = {};
  if (dto.ownerId !== undefined) $set.ownerId = dto.ownerId;
  if (dto.availableTo !== undefined) $set.availableTo = dto.availableTo;
  if (dto.lineOfBusinessId !== undefined) $set.lineOfBusinessId = dto.lineOfBusinessId;
  if (dto.marketSegmentId !== undefined) $set.marketSegmentId = dto.marketSegmentId;
  if (dto.customerId !== undefined) {
    const customerName = await getExternalOrgNameById(dto.customerId);
    $set.customer = {
      customerName,
      customerId: dto.customerId === null ? null : dto.customerId,
    };
  }
  if (dto.endUserId !== undefined) {
    const endUserName = await getExternalOrgNameById(dto.endUserId);
    $set.endUser = {
      endUserName,
      endUserId: dto.endUserId === null ? null : dto.endUserId,
    };
  }
  if (dto.contactName !== undefined || dto.contactDetails !== undefined) {
    $set.contact = {
      contactName: dto.contactName ?? existing.contact?.contactName ?? "",
      contactDetails: dto.contactDetails ?? (existing.contact?.contactDetails ?? []).map(String),
    };
  }
  if (dto.notes !== undefined) $set.notes = dto.notes;
  if (dto.provinceId !== undefined || dto.regencyId !== undefined || dto.districtId !== undefined) {
    $set.location = {
      provinceId: dto.provinceId === null ? null : (dto.provinceId ?? existing.location?.provinceId ?? null),
      regencyId: dto.regencyId === null ? null : (dto.regencyId ?? existing.location?.regencyId ?? null),
      districtId: dto.districtId === null ? null : (dto.districtId ?? existing.location?.districtId ?? null),
    };
  }
  if (dto.propability !== undefined) $set.propability = dto.propability;
  if (dto.estimateCloseDate !== undefined) $set.estimateCloseDate = parseCloseMonth(dto.estimateCloseDate);
  if (dto.actualCloseDate !== undefined) $set.actualCloseDate = parseCloseMonth(dto.actualCloseDate);
  if (dto.attachmentAssetIds !== undefined) {
    $set.attachmentAssetIds = dto.attachmentAssetIds
      .filter((id) => mongoose.isValidObjectId(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    $set.attachmentsUpdatedAt = new Date();
  }
  if (dto.approverId !== undefined) {
    if (dto.approverId && !(await userCanBeQuotationApproverCandidate(dto.approverId))) {
      return failResult(400, "Invalid approver user");
    }
    $set.approver = {
      approverId: asObjectIdOrNull(dto.approverId ?? null),
      approvedAt: existing.approver?.approvedAt ?? null,
    };
    $set.quotationStatus = statusAfterSubmit(
      String(existing.quotationStatus) as QuotationStatus,
      Boolean(dto.approverId),
    );
    if (dto.approverId) {
      $set.rejectReason = "";
    }
  }
  if (dto.currency !== undefined) $set.currency = dto.currency;
  if (dto.taxRate !== undefined) $set.taxRate = dto.taxRate;
  if (dto.discountTotal !== undefined) $set.discountTotal = dto.discountTotal;
  if (dto.validUntil !== undefined) $set.validUntil = parseIsoDate(dto.validUntil);
  if (dto.termsAndConditions !== undefined) $set.termsAndConditions = dto.termsAndConditions;

  const detailsInput =
    dto.details?.filter((d) => d.description.trim().length > 0).map((d) => ({
      sortOrder: Number(d.sortOrder ?? 0),
      description: d.description.trim(),
      quantity: Number(d.quantity ?? 0),
      unit: d.unit?.trim() ?? "",
      sku: d.sku?.trim() ?? "",
      price: Number(d.price ?? 0),
      discount: Number(d.discount ?? 0),
      taxRate: Number(d.taxRate ?? 0),
      lineNotes: d.lineNotes?.trim() ?? "",
    })) ?? null;
  const taxRate = Number(dto.taxRate ?? existing.taxRate ?? 0);
  const discountTotal = Number(dto.discountTotal ?? existing.discountTotal ?? 0);
  if (detailsInput != null) {
    const totals = calculateTotals(detailsInput, taxRate, discountTotal);
    $set.subTotal = totals.subTotal;
    $set.taxAmount = totals.taxAmount;
    $set.grandTotal = totals.grandTotal;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (Object.keys($set).length > 0) {
        await QuotationHeaderModel.updateOne({ _id: quotationId }, { $set }, { session }).exec();
      }
      if (detailsInput != null) {
        await QuotationDetailModel.deleteMany({ quotationId }, { session }).exec();
        if (detailsInput.length > 0) {
          await QuotationDetailModel.insertMany(
            detailsInput.map((d) => ({ quotationId, ...d })),
            { session },
          );
        }
      }
    });
    return getQuotationById(quotationId);
  } catch {
    return failResult(500, "Could not update quotation");
  } finally {
    await session.endSession();
  }
}

export async function submitQuotation(
  userId: string | undefined,
  quotationId: string | undefined,
  approverId: string | undefined,
): Promise<ServiceResult<{ item: QuotationOut }>> {
  if (!userId || !mongoose.isValidObjectId(userId)) return failResult(401, "Invalid session");
  if (!quotationId || !mongoose.isValidObjectId(quotationId)) return failResult(400, "Invalid quotation id");
  const row = await QuotationHeaderModel.findById(quotationId).lean().exec();
  if (!row) return failResult(404, "Quotation not found");
  if (!isQuotationOwner(userId, row)) {
    return failResult(403, "Only the quotation owner can submit");
  }
  if (!["draft", "rejected"].includes(String(row.quotationStatus))) {
    return failResult(400, "Quotation cannot be submitted in current status");
  }
  const effectiveApproverId =
    approverId?.trim() ||
    (row.approver?.approverId ? String(row.approver.approverId) : "");
  if (!effectiveApproverId) {
    return failResult(400, "Approver is required before submit");
  }
  if (
    !mongoose.isValidObjectId(effectiveApproverId) ||
    !(await userCanBeQuotationApproverCandidate(effectiveApproverId))
  ) {
    return failResult(400, "Invalid approver user");
  }
  await QuotationHeaderModel.updateOne(
    { _id: quotationId },
    {
      $set: {
        quotationStatus: "pending_approved",
        approver: {
          approverId: new mongoose.Types.ObjectId(effectiveApproverId),
          approvedAt: null,
        },
        rejectReason: "",
      },
    },
  ).exec();
  return getQuotationById(quotationId);
}

export async function approveQuotation(
  approverUserId: string | undefined,
  quotationId: string | undefined,
): Promise<ServiceResult<{ item: QuotationOut }>> {
  if (!approverUserId || !mongoose.isValidObjectId(approverUserId)) {
    return failResult(401, "Invalid session");
  }
  if (!quotationId || !mongoose.isValidObjectId(quotationId)) return failResult(400, "Invalid quotation id");
  const row = await QuotationHeaderModel.findById(quotationId).lean().exec();
  if (!row) return failResult(404, "Quotation not found");
  if (String(row.quotationStatus) !== "pending_approved") {
    return failResult(400, "Only pending quotation can be approved");
  }
  if (!(await userCanApproveOrRejectQuotation(approverUserId, row))) {
    return failResult(403, "You are not allowed to approve this quotation");
  }
  const actingApproverId = row.approver?.approverId
    ? String(row.approver.approverId)
    : approverUserId;
  await QuotationHeaderModel.updateOne(
    { _id: quotationId },
    {
      $set: {
        quotationStatus: "open",
        rejectReason: "",
        approver: {
          approverId: new mongoose.Types.ObjectId(actingApproverId),
          approvedAt: new Date(),
        },
      },
    },
  ).exec();
  return getQuotationById(quotationId);
}

export async function rejectQuotation(
  approverUserId: string | undefined,
  quotationId: string | undefined,
  dto: RejectQuotationDto,
): Promise<ServiceResult<{ item: QuotationOut }>> {
  if (!approverUserId || !mongoose.isValidObjectId(approverUserId)) {
    return failResult(401, "Invalid session");
  }
  if (!quotationId || !mongoose.isValidObjectId(quotationId)) return failResult(400, "Invalid quotation id");
  const row = await QuotationHeaderModel.findById(quotationId).lean().exec();
  if (!row) return failResult(404, "Quotation not found");
  if (String(row.quotationStatus) !== "pending_approved") {
    return failResult(400, "Only pending quotation can be rejected");
  }
  if (!(await userCanApproveOrRejectQuotation(approverUserId, row))) {
    return failResult(403, "You are not allowed to reject this quotation");
  }
  await QuotationHeaderModel.updateOne(
    { _id: quotationId },
    {
      $set: {
        quotationStatus: "rejected",
        rejectReason: dto.reason.trim(),
        "approver.approvedAt": null,
      },
    },
  ).exec();
  return getQuotationById(quotationId);
}

export async function reviseQuotation(
  userId: string | undefined,
  quotationId: string | undefined,
  dto: ReviseQuotationDto,
): Promise<ServiceResult<{ item: QuotationOut }>> {
  if (!userId || !mongoose.isValidObjectId(userId)) return failResult(401, "Invalid session");
  if (!quotationId || !mongoose.isValidObjectId(quotationId)) return failResult(400, "Invalid quotation id");
  const row = await QuotationHeaderModel.findById(quotationId).lean().exec();
  if (!row) return failResult(404, "Quotation not found");
  if (!isQuotationOwner(userId, row)) {
    return failResult(403, "Only the quotation owner can create a revision");
  }
  if (String(row.quotationStatus) !== "open") {
    return failResult(400, "Only approved/open quotation can be revised");
  }

  const approverId = dto.approverId ?? (row.approver?.approverId ? String(row.approver.approverId) : "");
  if (approverId && !(await userCanBeQuotationApproverCandidate(approverId))) {
    return failResult(400, "Invalid approver user");
  }

  const details = await QuotationDetailModel.find({ quotationId }).lean().exec();
  const revisionNo = Number(row.revisionNo ?? 0) + 1;
  const nextApproverId = asObjectIdOrNull(approverId);
  const createdDocs = await QuotationHeaderModel.create([
    {
      opportunityId: row.opportunityId,
      ownerId: row.ownerId,
      availableTo: row.availableTo ?? [],
      lineOfBusinessId: row.lineOfBusinessId,
      marketSegmentId: row.marketSegmentId,
      customer: row.customer ?? {},
      endUser: row.endUser ?? {},
      contact: row.contact ?? { contactName: "", contactDetails: [] },
      notes: row.notes ?? "",
      location: row.location ?? {},
      propability: row.propability ?? 0,
      estimateCloseDate: row.estimateCloseDate ?? null,
      actualCloseDate: row.actualCloseDate ?? null,
      attachmentAssetIds: row.attachmentAssetIds ?? [],
      attachmentsUpdatedAt: row.attachmentsUpdatedAt ?? null,
      quotationNo: row.quotationNo,
      quotationStatus: approverId ? "pending_approved" : "draft",
      rejectReason: "",
      revisionNo,
      approver: {
        approverId: nextApproverId,
        approvedAt: null,
      },
      currency: row.currency ?? "IDR",
      taxRate: row.taxRate ?? 0,
      discountTotal: row.discountTotal ?? 0,
      subTotal: row.subTotal ?? 0,
      taxAmount: row.taxAmount ?? 0,
      grandTotal: row.grandTotal ?? 0,
      validUntil: row.validUntil ?? null,
      termsAndConditions: row.termsAndConditions ?? "",
      isActive: row.isActive ?? true,
    },
  ]);
  const created = Array.isArray(createdDocs) ? createdDocs[0] : null;
  if (!created) return failResult(500, "Could not revise quotation");
  if (details.length > 0) {
    await QuotationDetailModel.insertMany(
      details.map((d) => ({
        ...d,
        _id: undefined,
        quotationId: created._id,
        createdAt: undefined,
        updatedAt: undefined,
      })),
    );
  }
  return getQuotationById(String(created._id));
}

export async function deleteQuotation(
  userId: string | undefined,
  dto: MongoIdParamDto,
): Promise<ServiceResult<{ deleted: true }>> {
  if (!userId || !mongoose.isValidObjectId(userId)) return failResult(401, "Invalid session");
  if (!dto.id || !mongoose.isValidObjectId(dto.id)) return failResult(400, "Invalid quotation id");
  const row = await QuotationHeaderModel.findById(dto.id).lean().exec();
  if (!row) return failResult(404, "Quotation not found");
  if (!["draft", "rejected"].includes(String(row.quotationStatus))) {
    return failResult(400, "Only draft/rejected quotation can be deleted");
  }
  await QuotationDetailModel.deleteMany({ quotationId: dto.id }).exec();
  await QuotationHeaderModel.deleteOne({ _id: dto.id }).exec();
  return okResult(200, "Deleted", { deleted: true });
}
